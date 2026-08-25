#!/usr/bin/env node
/**
 * Forecast skill analysis. Not part of the app, the build, or the test suite.
 *
 * Answers one question: how good is the regional wave forecast this dashboard
 * falls back on, and how fast does it decay with lead time?
 *
 * Prediction  Open-Meteo marine `*_previous_dayN` variables, which expose the
 *             forecast that was actually issued N days before each valid hour.
 * Truth       CDIP MOP `_nowcast.nc`, a buoy-initialised spectral propagation
 *             at the same MOP point the dashboard forecasts for. It is a
 *             reconstruction, not an observation, and is labelled as such.
 *
 * The two sources sit at different grid points and depths, so raw error is
 * dominated by a systematic location offset rather than by forecast error.
 * Every break is therefore bias-corrected: the mean signed error of Open-Meteo's
 * own analysis against the same truth is measured per break and subtracted from
 * every lead time. What survives is forecast error, not geography.
 *
 * A truth-free control is printed alongside it: the mean absolute difference
 * between each lead time's forecast and the analysis for the same hour. That
 * needs no observations at all, so if it and the corrected error disagree
 * badly, the truth pairing is suspect rather than the forecast.
 */
import { evaluateForecastSkill } from "../lib/forecast/verification.ts";
import { profiles, spotCoordinates } from "../lib/forecast/model.ts";

// Either a trailing day count, or an explicit window: --from 2026-01-10 --to 2026-01-24
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const FROM = flag("--from");
const TO = flag("--to");
const DAYS = Number(argv.find((value) => /^\d+$/.test(value)) ?? 14);
const LEADS = [1, 2, 3, 4, 5];
const M_TO_FT = 3.28084;

const hourKey = (iso) => iso.slice(0, 13);

async function fetchJson(label, url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.json();
}

/** Open-Meteo marine, batched across every break, with the runs issued 1-5 days earlier. */
async function fetchPredictions() {
  const points = profiles.map((profile) => spotCoordinates[profile.name]);
  const hourly = ["wave_height", ...LEADS.map((lead) => `wave_height_previous_day${lead}`)].join(",");
  const url = new URL("https://marine-api.open-meteo.com/v1/marine");
  url.searchParams.set("latitude", points.map(([lat]) => lat).join(","));
  url.searchParams.set("longitude", points.map(([, lon]) => lon).join(","));
  url.searchParams.set("hourly", hourly);
  if (FROM && TO) {
    url.searchParams.set("start_date", FROM);
    url.searchParams.set("end_date", TO);
  } else {
    url.searchParams.set("past_days", String(DAYS));
    url.searchParams.set("forecast_days", "0");
  }
  url.searchParams.set("cell_selection", "sea");
  const response = await fetchJson("Open-Meteo marine previous runs", url.toString());
  return Array.isArray(response) ? response : [response];
}

/** CDIP MOP nowcast for one break: buoy-initialised truth at the same point. */
async function fetchTruth(profile, start, end) {
  const url = new URL(`https://thredds.cdip.ucsd.edu/thredds/ncss/point/cdip/model/MOP_alongshore/${profile.mopId}_nowcast.nc`);
  url.searchParams.append("var", "waveHs");
  url.searchParams.set("time_start", start.toISOString());
  url.searchParams.set("time_end", end.toISOString());
  url.searchParams.set("accept", "csv");
  const response = await fetch(url.toString(), { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) return null;
  const rows = (await response.text()).trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(","));
  const header = rows[0]?.map((column) => column.replace(/\s*\[.*$/, "").trim()) ?? [];
  const timeColumn = header.indexOf("time");
  const heightColumn = header.indexOf("waveHs");
  if (timeColumn < 0 || heightColumn < 0) return null;
  const byHour = new Map();
  for (const row of rows.slice(1)) {
    const height = Number(row[heightColumn]);
    if (Number.isFinite(height) && height >= 0 && height < 20) byHour.set(hourKey(row[timeColumn]), height);
  }
  return byHour;
}

function score(samples, biasFt = 0) {
  const corrected = samples.map((sample) => ({
    ...sample,
    predictedLow: sample.predictedLow - biasFt,
    predictedHigh: sample.predictedHigh - biasFt,
  }));
  const skill = evaluateForecastSkill(corrected);
  return { n: skill.samples, mae: skill.midpointMae, within1ft: skill.withinOneFootRate, underRate: skill.underforecastRate };
}

/** Mean signed error, i.e. the systematic offset between the two grid points. */
function meanBias(samples) {
  if (!samples.length) return 0;
  return samples.reduce((sum, sample) => sum + (sample.predictedLow - sample.observedLow), 0) / samples.length;
}

const pct = (value) => value == null ? "  n/a" : `${(value * 100).toFixed(0)}%`.padStart(5);
const ft = (value) => value == null ? "  n/a" : `${value.toFixed(2)}`.padStart(5);

const end = TO ? new Date(`${TO}T23:59:59Z`) : new Date();
const start = FROM ? new Date(`${FROM}T00:00:00Z`) : new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000);
const window = FROM && TO ? `${FROM} to ${TO}` : `${DAYS} days to ${end.toISOString().slice(0, 10)}`;
console.log(`Forecast skill vs CDIP MOP nowcast — ${window}\n`);

const predictions = await fetchPredictions();
const byLead = new Map([[0, []], ...LEADS.map((lead) => [lead, []])]);
const spreadSamples = new Map(LEADS.map((lead) => [lead, []]));
const perBreak = new Map();
let missing = 0;

for (const [index, profile] of profiles.entries()) {
  const hourlyData = predictions[index]?.hourly;
  const truth = hourlyData ? await fetchTruth(profile, start, end) : null;
  if (!hourlyData || !truth?.size) { missing += 1; continue; }

  const breakSamples = new Map([[0, []], ...LEADS.map((lead) => [lead, []])]);
  hourlyData.time.forEach((time, hour) => {
    const analysis = hourlyData.wave_height?.[hour];
    for (const lead of LEADS) {
      const predicted = hourlyData[`wave_height_previous_day${lead}`]?.[hour];
      if (analysis != null && predicted != null) spreadSamples.get(lead).push(Math.abs(predicted - analysis) * M_TO_FT);
    }
    const observed = truth.get(hourKey(`${time}:00Z`));
    if (observed == null) return;
    for (const lead of [0, ...LEADS]) {
      const key = lead === 0 ? "wave_height" : `wave_height_previous_day${lead}`;
      const predicted = hourlyData[key]?.[hour];
      if (predicted == null) continue;
      const sample = {
        spot: profile.name,
        issuedAt: time, validAt: time, horizonHours: lead * 24,
        predictedLow: predicted * M_TO_FT, predictedHigh: predicted * M_TO_FT,
        observedLow: observed * M_TO_FT, observedHigh: observed * M_TO_FT,
        observationSource: "CDIP MOP nowcast (buoy-initialised reconstruction)",
      };
      byLead.get(lead).push(sample);
      breakSamples.get(lead).push(sample);
    }
  });
  perBreak.set(profile.name, breakSamples);
}

const meanAbsSpread = new Map([...spreadSamples].map(([lead, values]) =>
  [lead, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null]));
const globalBias = meanBias(byLead.get(0));
console.log(`Systematic offset between the Open-Meteo grid point and the MOP point: ${globalBias >= 0 ? "+" : ""}${globalBias.toFixed(2)} ft`);
console.log("Removed per break below, so the remaining error is the forecast rather than the geography.\n");

console.log("Lead time   samples   raw MAE   corrected MAE   vs analysis   within 1ft   spread vs analysis");
console.log("-".repeat(96));
const perBreakBias = new Map([...perBreak].map(([name, samples]) => [name, meanBias(samples.get(0))]));
const scoreLead = (lead) => {
  const all = [...perBreak].flatMap(([name, samples]) => samples.get(lead).map((sample) => ({ sample, bias: perBreakBias.get(name) })));
  const corrected = all.map(({ sample, bias }) => ({ ...sample, predictedLow: sample.predictedLow - bias, predictedHigh: sample.predictedHigh - bias }));
  return { raw: score(byLead.get(lead)), corrected: evaluateForecastSkill(corrected) };
};
const base = scoreLead(0);
console.log(`analysis  ${String(base.corrected.samples).padStart(8)}   ${ft(base.raw.mae)}       ${ft(base.corrected.midpointMae)}          ----        ${pct(base.corrected.withinOneFootRate)}        ----`);
for (const lead of LEADS) {
  const r = scoreLead(lead);
  const growth = r.corrected.midpointMae != null && base.corrected.midpointMae != null
    ? ft(r.corrected.midpointMae - base.corrected.midpointMae) : "  n/a";
  const control = ft(meanAbsSpread.get(lead));
  console.log(`day ${lead}     ${String(r.corrected.samples).padStart(8)}   ${ft(r.raw.mae)}       ${ft(r.corrected.midpointMae)}         ${growth}        ${pct(r.corrected.withinOneFootRate)}             ${control}`);
}

console.log("\nPer break, bias-corrected MAE ft by lead time");
console.log("break".padEnd(18) + ["analysis", ...LEADS.map((l) => `day ${l}`)].map((h) => h.padStart(9)).join(""));
console.log("-".repeat(74));
for (const [name, samples] of perBreak) {
  const bias = perBreakBias.get(name);
  const cells = [0, ...LEADS].map((lead) => ft(score(samples.get(lead), bias).mae).padStart(9)).join("");
  console.log(name.padEnd(18) + cells);
}

const observedFt = [...perBreak.values()].flatMap((samples) => samples.get(0).map((sample) => sample.observedLow));
if (observedFt.length) {
  const sorted = [...observedFt].sort((a, b) => a - b);
  const q = (f) => sorted[Math.floor(f * (sorted.length - 1))];
  console.log(`\nSea state over this window (nearshore Hs, ft): median ${q(0.5).toFixed(1)}, p90 ${q(0.9).toFixed(1)}, max ${sorted.at(-1).toFixed(1)}`);
  console.log("A calm window produces small absolute errors; compare windows before drawing conclusions.");
}
console.log(`\n${perBreak.size}/${profiles.length} breaks scored${missing ? `, ${missing} without usable truth` : ""}.`);
console.log("Truth is a buoy-initialised reconstruction, not an observation.");
console.log("Raw MAE is dominated by the grid-point offset; the corrected column is the forecast error.");
console.log("The spread column needs no truth at all, so it independently corroborates the decay curve.");
console.log("This scores the regional wave input only. The breaking-face translation is not verified.");
