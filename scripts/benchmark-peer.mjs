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
 *   npm run dev                       # in another terminal; add reads the live forecast
 *   npm run benchmark:add -- --spot Blacks --their 3-4 [--source Surfline]
 *   npm run benchmark:report
 *
 * --api, or BENCHMARK_API, points at a different forecast, such as the deployed
 * site. A deployment running older code may omit the forecast timestamp, which
 * costs the CDIP truth leg but still records the peer comparison.
 *
 * `add` records what this dashboard is saying right now, so the only thing
 * typed by hand is the peer's number. `report` fetches CDIP nowcast truth for
 * each recorded hour once it exists.
 */
import { readFile, writeFile } from "node:fs/promises";
import { profiles } from "../lib/forecast/model.ts";

const LOG = new URL("../benchmarks/peer-samples.json", import.meta.url);
const DEPLOYED = "https://san-diego-surf-dashboard.pwysong.chatgpt.site/api/conditions";
const LOCAL = "http://localhost:5173/api/conditions";
const M_TO_FT = 3.28084;

const argv = process.argv.slice(2);
const command = argv[0];
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const API = flag("api") ?? process.env.BENCHMARK_API ?? LOCAL;

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

  let payload;
  try {
    const response = await fetch(API, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = await response.json();
  } catch (error) {
    const reason = error?.cause?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(String(error?.message))
      ? "nothing is listening there"
      : error instanceof Error ? error.message : "request failed";
    console.error(`Could not reach the forecast at ${API} (${reason}).\n`);
    console.error("This command records what the dashboard is currently saying, so it needs a running forecast. Either:\n");
    console.error("  1. start the dev server in another terminal, then run this again:");
    console.error("       npm run dev\n");
    console.error("  2. or read from the deployed site instead:");
    console.error(`       npm run benchmark:add -- --spot "${spotArg}" --their ${flag("their")} --api ${DEPLOYED}\n`);
    console.error("     Note the deployment may be running older code than this checkout, in which case");
    console.error("     the sample records the comparison but cannot be matched to CDIP truth later.");
    process.exit(69);
  }

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

  if (!ours.raw?.validAt) {
    console.warn(`Warning: ${API} returned no forecast timestamp for ${profile.name}.`);
    console.warn("The comparison is recorded, but this sample cannot be matched to CDIP truth in the report.\n");
  }

  const samples = await readLog();
  samples.push({
    recordedAt: new Date().toISOString(),
    validAt: ours.raw?.validAt ?? null,
    api: API,
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
  // Feet first. A ratio misleads at small surf: one band apart is 0.71x one way
  // and 1.40x the other, so ratio scatter looks alarming when the absolute
  // difference is a single foot.
  const diffs = rows.map((row) => row.oursMid - row.theirMid);
  const bias = mean(diffs);
  const scatter = diffs.length > 1 ? Math.sqrt(mean(diffs.map((value) => (value - bias) ** 2))) : null;

  console.log(`\n${rows.length} samples\n`);
  console.log("date        break             ours     peer      diff    CDIP truth");
  console.log("-".repeat(74));
  for (const row of rows) {
    const truth = row.truthFt == null ? "     \u2014" : `${row.truthFt.toFixed(1).padStart(5)} ft`;
    const diff = row.oursMid - row.theirMid;
    console.log(`${row.recordedAt.slice(0, 10)}  ${row.spot.padEnd(17)} ${`${row.oursLow}-${row.oursHigh}`.padStart(6)}  ${`${row.theirLow}-${row.theirHigh}`.padStart(6)}  ${((diff >= 0 ? "+" : "") + diff.toFixed(1)).padStart(6)}   ${truth}`);
  }

  const within = diffs.filter((value) => Math.abs(value) < 1).length;
  console.log(`\nours minus peer: mean ${bias >= 0 ? "+" : ""}${bias.toFixed(2)} ft${scatter == null ? "" : `, spread ${scatter.toFixed(2)} ft`}`);
  console.log(`ratio ours/peer: ${mean(rows.map((row) => row.ratio)).toFixed(2)}x`);
  console.log(`within one band: ${within}/${diffs.length}`);

  // Bias and scatter are different questions, and only bias justifies a
  // constant. Half a band for bias, one band for scatter, since the published
  // bands are about a foot wide at the sizes seen here.
  if (scatter == null) {
    console.log("\nOne sample cannot separate a real difference from a single odd reading. Collect more.");
  } else {
    const biased = Math.abs(bias) > .5;
    const noisy = scatter > 1;
    if (!biased && !noisy) {
      console.log("\nNo systematic difference, and scatter inside one band. Nothing here indicates a calibration problem.");
    } else if (biased && !noisy) {
      console.log(`\nSystematic offset of ${bias >= 0 ? "+" : ""}${bias.toFixed(2)} ft with tight scatter. A consistent offset is a convention or calibration difference, and one constant would correct it.`);
    } else if (!biased && noisy) {
      console.log("\nNo systematic offset, but individual breaks differ by more than a band. The average is fine; the per-break picture is where to look. A break off in the same direction across several readings is the thing worth acting on.");
    } else {
      console.log(`\nBoth a systematic offset of ${bias >= 0 ? "+" : ""}${bias.toFixed(2)} ft and scatter beyond one band. Correct the offset first, then re-measure before judging individual breaks.`);
    }
  }

  // Repeat readings are the only basis for changing a single break.
  const byBreak = new Map();
  for (const row of rows) byBreak.set(row.spot, [...(byBreak.get(row.spot) ?? []), row.oursMid - row.theirMid]);
  const repeated = [...byBreak].filter(([, values]) => values.length > 1);
  if (!repeated.length) {
    console.log("\nEvery break has a single reading: enough to rule out a systematic problem, not enough to change any individual break.");
  } else {
    const consistent = repeated.filter(([, values]) => Math.abs(mean(values)) >= 1 && values.every((value) => Math.sign(value) === Math.sign(values[0])));
    console.log(`\n${repeated.length} break${repeated.length === 1 ? " has" : "s have"} more than one reading.`);
    if (consistent.length) {
      console.log("Off in the same direction every time, which is what would justify a constant change:");
      consistent.forEach(([spot, values]) => console.log(`  ${spot.padEnd(17)} ${values.length} readings, mean ${mean(values) >= 0 ? "+" : ""}${mean(values).toFixed(1)} ft`));
    } else {
      console.log("None is off in the same direction every time, so none warrants a constant change yet.");
    }
  }

  const untimed = rows.filter((row) => !row.validAt).length;
  if (untimed) console.log(`\n${untimed} sample${untimed === 1 ? "" : "s"} recorded without a forecast timestamp, so no CDIP truth could be matched.`);

  const withTruth = rows.filter((row) => row.truthFt != null);
  if (withTruth.length >= 3) {
    const oursVsTruth = mean(withTruth.map((row) => row.oursMid / (row.truthFt * M_TO_FT)));
    const peerVsTruth = mean(withTruth.map((row) => row.theirMid / (row.truthFt * M_TO_FT)));
    console.log(`\nAgainst buoy-initialised nowcast Hs (${withTruth.length} samples):`);
    console.log(`  ours ${oursVsTruth.toFixed(2)}x Hs, peer ${peerVsTruth.toFixed(2)}x Hs`);
    console.log("  This is the check that does not depend on the peer being right, because it");
    console.log("  compares both conversions to a measured sea. Neither is truth, and Hs is a");
    console.log("  different quantity from a breaking face, so read it as a scale comparison.");
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
    console.log("Needs a running forecast: `npm run dev` in another terminal, or --api to read the deployed site.");
  } else {
    const rows = [];
    for (const sample of samples) {
      rows.push({
        ...sample,
        oursMid: (sample.oursLow + sample.oursHigh) / 2,
        theirMid: (sample.theirLow + sample.theirHigh) / 2,
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
