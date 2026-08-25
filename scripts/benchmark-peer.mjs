#!/usr/bin/env node
/**
 * Peer benchmark. Not part of the app, the build, or the test suite.
 *
 * Answers whether this forecast is an outlier against the established services,
 * which is the only available check on the breaking-face translation because no
 * instrument measures a breaking wave.
 *
 * Peers are not ground truth and are never scored as such. Height conventions
 * differ between services, so the report looks for a *consistent* ratio rather
 * than agreement: a steady offset is a convention difference and harmless, a
 * ratio swinging between half and double is a real calibration defect.
 *
 *   npm run benchmark:add -- --spot Blacks --their 3-4 [--source Surfline]
 *   npm run benchmark:report
 *
 * `add` records what this dashboard is saying right now, so the only thing
 * typed by hand is the peer's number. `report` fetches CDIP nowcast truth for
 * each recorded hour once it exists.
 */
import { readFile, writeFile } from "node:fs/promises";
import { profiles } from "../lib/forecast/model.ts";

const LOG = new URL("../benchmarks/peer-samples.json", import.meta.url);
const API = process.env.BENCHMARK_API ?? "http://localhost:5173/api/conditions";
const M_TO_FT = 3.28084;

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };

const readLog = async () => JSON.parse(await readFile(LOG, "utf8"));
const writeLog = async (samples) => writeFile(LOG, `${JSON.stringify(samples, null, 2)}\n`);

/**
 * "3-4", "3–4", "3 to 4" or "4" all parse; a single value is a point estimate.
 * Empty input must return null rather than zero, or a missing argument records
 * a silent 0-0 sample instead of failing.
 */
function parseRange(text) {
  const parts = String(text ?? "")
    .split(/\s*(?:[-–—]|\bto\b)\s*/)
    .map((part) => part.replace(/[^\d.]/g, "").trim())
    .filter((part) => part !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!parts.length) return null;
  return { low: Math.min(...parts), high: Math.max(...parts) };
}

async function add() {
  const spotArg = flag("spot");
  const theirs = parseRange(flag("their"));
  if (!spotArg || !theirs) {
    console.error('usage: npm run benchmark:add -- --spot "Blacks" --their 3-4 [--source Surfline] [--note "..."]');
    process.exit(64);
  }
  const profile = profiles.find((item) => item.name.toLowerCase() === spotArg.toLowerCase());
  if (!profile) {
    console.error(`unknown break: ${spotArg}\nknown: ${profiles.map((item) => item.name).join(", ")}`);
    process.exit(64);
  }

  const payload = await (await fetch(API, { signal: AbortSignal.timeout(120_000) })).json();
  const ours = payload.conditions?.find((item) => item.name === profile.name);
  if (!ours) {
    console.error(`the dashboard has no current forecast for ${profile.name} (mode=${payload.mode})`);
    process.exit(69);
  }
  const oursRange = parseRange(ours.height);
  if (!oursRange) {
    console.error(`the dashboard reports "${ours.height}" for ${profile.name}, which is not a range to compare`);
    process.exit(69);
  }

  const samples = await readLog();
  samples.push({
    recordedAt: new Date().toISOString(),
    validAt: ours.raw?.validAt ?? null,
    spot: profile.name,
    mopId: profile.mopId,
    source: flag("source") ?? "Surfline",
    theirLow: theirs.low,
    theirHigh: theirs.high,
    oursLow: oursRange.low,
    oursHigh: oursRange.high,
    oursModelHeightM: ours.raw?.waveHeightM ?? null,
    oursPeriodS: ours.raw?.periodS ?? null,
    oursSource: ours.secondarySwellSource ?? null,
    payloadMode: payload.mode,
    note: flag("note") ?? "",
  });
  await writeLog(samples);
  console.log(`recorded ${profile.name}: ours ${oursRange.low}-${oursRange.high} ft, ${flag("source") ?? "Surfline"} ${theirs.low}-${theirs.high} ft  (${samples.length} samples)`);
}

/** CDIP nowcast at the recorded hour, which exists only once the hour has passed. */
async function truthFor(mopId, validAt) {
  if (!validAt) return null;
  const target = new Date(validAt);
  const url = new URL(`https://thredds.cdip.ucsd.edu/thredds/ncss/point/cdip/model/MOP_alongshore/${mopId}_nowcast.nc`);
  url.searchParams.append("var", "waveHs");
  url.searchParams.set("time_start", new Date(target.getTime() - 90 * 60 * 1000).toISOString());
  url.searchParams.set("time_end", new Date(target.getTime() + 90 * 60 * 1000).toISOString());
  url.searchParams.set("accept", "csv");
  try {
    const response = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) return null;
    const rows = (await response.text()).trim().split(/\r?\n/).map((line) => line.split(","));
    const header = rows[0]?.map((column) => column.replace(/\s*\[.*$/, "").trim()) ?? [];
    const timeColumn = header.indexOf("time");
    const heightColumn = header.indexOf("waveHs");
    if (timeColumn < 0 || heightColumn < 0) return null;
    const best = rows.slice(1).map((row) => ({ ms: Date.parse(row[timeColumn]), value: Number(row[heightColumn]) }))
      .filter((row) => Number.isFinite(row.ms) && Number.isFinite(row.value))
      .sort((a, b) => Math.abs(a.ms - target.getTime()) - Math.abs(b.ms - target.getTime()))[0];
    return best?.value ?? null;
  } catch { return null; }
}

const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function report(rows) {
  const ratios = rows.map((row) => row.ratio);
  const average = mean(ratios);
  const spread = ratios.length > 1
    ? Math.sqrt(mean(ratios.map((value) => (value - average) ** 2)))
    : null;

  console.log(`\n${rows.length} samples\n`);
  console.log("date        break             ours     peer      ratio   CDIP truth");
  console.log("-".repeat(74));
  for (const row of rows) {
    const truth = row.truthFt == null ? "     —" : `${row.truthFt.toFixed(1).padStart(5)} ft`;
    console.log(`${row.recordedAt.slice(0, 10)}  ${row.spot.padEnd(17)} ${`${row.oursLow}-${row.oursHigh}`.padStart(6)}  ${`${row.theirLow}-${row.theirHigh}`.padStart(6)}   ${row.ratio.toFixed(2).padStart(6)}   ${truth}`);
  }

  console.log(`\nours / peer: mean ${average.toFixed(2)}${spread == null ? "" : `, standard deviation ${spread.toFixed(2)}`}`);
  if (spread == null) {
    console.log("A single sample says nothing. Consistency is the signal, so collect more.");
  } else if (spread <= 0.2) {
    console.log(average >= 0.85 && average <= 1.18
      ? "Consistent and close: no evidence of a calibration problem."
      : `Consistent offset of about ${average.toFixed(2)}x. That reads as a height-convention difference rather than a defect, and it is correctable with one constant if you want to match.`);
  } else {
    console.log("Inconsistent: the ratio moves too much between samples to be a convention difference. That points at the face translation, not at a scale offset.");
  }

  const withTruth = rows.filter((row) => row.truthFt != null);
  if (withTruth.length >= 3) {
    const oursVsTruth = mean(withTruth.map((row) => ((row.oursLow + row.oursHigh) / 2) / (row.truthFt * M_TO_FT)));
    const peerVsTruth = mean(withTruth.map((row) => ((row.theirLow + row.theirHigh) / 2) / (row.truthFt * M_TO_FT)));
    console.log(`\nAgainst buoy-initialised nowcast Hs (${withTruth.length} samples):`);
    console.log(`  ours ${oursVsTruth.toFixed(2)}x Hs, peer ${peerVsTruth.toFixed(2)}x Hs`);
    console.log("  Both are face estimates from the same physical sea, so this shows which conversion is more aggressive.");
    console.log("  Neither is truth. Hs is a different quantity from a breaking face and is shown for scale only.");
  }
  console.log("\nPeers are an external model comparison, never an observation.");
}

const samples = await readLog();
if (command === "add") {
  await add();
} else if (command === "report" || command === undefined) {
  if (!samples.length) {
    console.log("No samples yet.\n");
    console.log('  npm run benchmark:add -- --spot "Blacks" --their 3-4');
    console.log("\nRecord what a peer is showing while the dashboard is running; everything else is captured for you.");
  } else {
    const rows = [];
    for (const sample of samples) {
      rows.push({
        ...sample,
        ratio: ((sample.oursLow + sample.oursHigh) / 2) / Math.max(.25, (sample.theirLow + sample.theirHigh) / 2),
        truthFt: await truthFor(sample.mopId, sample.validAt),
      });
    }
    report(rows);
  }
} else {
  console.error(`unknown command: ${command}\n  add | report`);
  process.exit(64);
}
