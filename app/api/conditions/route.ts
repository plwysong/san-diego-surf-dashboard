import { createForecastCache } from "../../../lib/forecast/cache.ts";
import {
  angularDifference,
  cardinal,
  componentFaceFeet,
  conditionSummary,
  forecastConfidence,
  n,
  nwsWindPoints,
  profiles,
  rating,
  scoreConditions,
  spotCoordinates,
  spotHeight,
  zoneLeadSpot,
  zonePoints,
  type CdipObservation,
  type HourlyData,
  type Profile,
  type WaveComponent,
  type WaveEstimate,
  type Zone,
} from "../../../lib/forecast/model.ts";
import { fetchJson, fetchText, inRange, isFresh, parseCsvRows, settledMapWithConcurrency } from "../../../lib/forecast/providers.ts";

type ForecastMode = "live" | "partial" | "unavailable";
type ForecastResponse = { hourly?: HourlyData; error?: boolean; reason?: string };
type TidePrediction = { t: string; v: string; type?: string };
type TideEstimate = { value: number | null; trend: "steady" | "rising" | "falling" | null };
type TideFeed = { predictions: TidePrediction[]; complete: boolean };
type ProviderStatus = { ok: boolean; detail: string; checkedAt: string; dataTimestamp?: string; validThrough?: string };
type SpectrumComponent = { period: number; direction: number; heightM: number; energy: number };
type CdipSpectrum = { observedAt: string; station: string; components: SpectrumComponent[] };
type CoastalWind = { observedAt: string; station: string; speed: number; direction: number };
type ZoneForecast = { marine: HourlyData; weather: HourlyData; windLive: boolean; regionalLive: boolean; windSource: "Open-Meteo" | "NWS" | "Unavailable" };
type ForecastBundle = { zones: Map<Zone, ZoneForecast>; spotWinds: Map<string, HourlyData> };

export function displayedDayIndexes(times: string[], start: number) {
  const byDate = new Map<string, number[]>();
  times.forEach((time, index) => {
    const hour = Number(time.slice(11, 13));
    if (index < start || hour < 5 || hour > 19) return;
    const date = time.slice(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push(index);
  });
  return [...byDate.entries()].slice(0, 5);
}

function hasCoherentWave(hourly: HourlyData, index: number) {
  return coherentComponent(hourly.swell_wave_height?.[index], hourly.swell_wave_direction?.[index], hourly.swell_wave_period?.[index], "mid") != null
    || coherentComponent(hourly.wave_height?.[index], hourly.wave_direction?.[index], hourly.wave_period?.[index], "bulk") != null;
}

function hasUsableMarineForecast(hourly: HourlyData) {
  const length = hourly.time?.length ?? 0;
  if (length < 24) return false;
  const timelineValid = hourly.time.every((time, index) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time)
    && Number.isFinite(pseudoLocalMs(time))
    && (index === 0 || (pseudoLocalMs(time) - pseudoLocalMs(hourly.time[index - 1]) > 0
      && pseudoLocalMs(time) - pseudoLocalMs(hourly.time[index - 1]) <= 3 * 60 * 60 * 1000)));
  if (!timelineValid) return false;
  const nowKey = localNowKey();
  const current = nearestTimeIndex(hourly.time, nowKey, 2);
  if (current < 0 || pseudoLocalMs(hourly.time.at(-1)!) - pseudoLocalMs(nowKey) < 4 * 24 * 60 * 60 * 1000) return false;
  const days = displayedDayIndexes(hourly.time, current);
  return hasCoherentWave(hourly, current) && days.length === 5 && days.every(([, indexes]) =>
    indexes.filter((index) => hasCoherentWave(hourly, index)).length >= indexes.length * .8);
}

function alignWeatherToMarine(marineTimes: string[], weather: HourlyData) {
  const byTime = new Map(weather.time.map((time, index) => [time, index]));
  const windSpeed = marineTimes.map((time) => {
    const index = byTime.get(time);
    return index == null ? null : weather.wind_speed_10m?.[index] ?? null;
  });
  const windDirection = marineTimes.map((time) => {
    const index = byTime.get(time);
    return index == null ? null : weather.wind_direction_10m?.[index] ?? null;
  });
  const current = nearestTimeIndex(marineTimes, localNowKey(), 2);
  const days = current < 0 ? [] : displayedDayIndexes(marineTimes, current);
  const coherent = (index: number) => typeof windSpeed[index] === "number" && Number.isFinite(windSpeed[index])
    && typeof windDirection[index] === "number" && Number.isFinite(windDirection[index]);
  const usable = current >= 0 && coherent(current) && days.length === 5
    && days.every(([, indexes]) => indexes.filter(coherent).length >= indexes.length * .8);
  return { usable, hourly: { time: marineTimes, wind_speed_10m: windSpeed, wind_direction_10m: windDirection } satisfies HourlyData };
}

function localNowKey() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:00`;
}

function currentIndex(times: string[]) {
  return nearestTimeIndex(times, localNowKey(), 3);
}

function localKeyFromUtc(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

function pseudoLocalMs(value: string) {
  return Date.parse(`${value.slice(0, 16)}:00Z`);
}

function localForecastTimeToIso(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.replace(" ", "T").slice(0, 16);
  const target = pseudoLocalMs(normalized);
  if (!Number.isFinite(target)) return undefined;
  let guess = target + 8 * 60 * 60 * 1000;
  const rendered = localKeyFromUtc(new Date(guess).toISOString());
  guess += target - pseudoLocalMs(rendered);
  return Number.isFinite(guess) ? new Date(guess).toISOString() : undefined;
}

function formatHour(time: string) {
  const hour = Number(time.slice(11, 13));
  const normalized = hour % 12 || 12;
  return `${normalized} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatWindow(times: string[], startIndex: number, endIndex: number) {
  const start = formatHour(times[startIndex]);
  const end = formatHour(times[endIndex]);
  return startIndex === endIndex ? `Around ${start}` : `${start}–${end}`;
}

function surfableIndexes(times: string[], start: number, count: number) {
  const startDate = times[start]?.slice(0, 10);
  const startHour = Number(times[start]?.slice(11, 13));
  const targetDate = startHour > 19
    ? times.slice(start).find((time) => Number(time.slice(11, 13)) >= 5 && Number(time.slice(11, 13)) <= 19)?.slice(0, 10)
    : startDate;
  return times.map((time, index) => ({ time, index }))
    .filter(({ time, index }) => index >= start && time.slice(0, 10) === targetDate && Number(time.slice(11, 13)) >= 5 && Number(time.slice(11, 13)) <= 19)
    .slice(0, count).map(({ index }) => index);
}

function bestWindowSelection(candidates: number[], times: string[], scores: number[]) {
  if (!candidates.length) return null;
  const availableSpan = pseudoLocalMs(times[candidates.at(-1)!]) - pseudoLocalMs(times[candidates[0]]);
  const targetDuration = Math.min(3 * 60 * 60 * 1000, Math.max(0, availableSpan));
  let best = { startOffset: 0, endOffset: 0, average: Number.NEGATIVE_INFINITY };
  candidates.forEach((candidate, startOffset) => {
    const startMs = pseudoLocalMs(times[candidate]);
    let endOffset = startOffset;
    while (endOffset + 1 < candidates.length && pseudoLocalMs(times[candidates[endOffset + 1]]) - startMs <= 3 * 60 * 60 * 1000) endOffset += 1;
    const duration = pseudoLocalMs(times[candidates[endOffset]]) - startMs;
    if (duration < targetDuration) return;
    const slice = scores.slice(startOffset, endOffset + 1);
    const average = slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length);
    if (average > best.average) best = { startOffset, endOffset, average };
  });
  const windowScores = scores.slice(best.startOffset, best.endOffset + 1);
  const representativeOffset = best.startOffset + windowScores.reduce((winner, value, offset) => value > windowScores[winner] ? offset : winner, 0);
  return {
    startIndex: candidates[best.startOffset],
    endIndex: candidates[best.endOffset],
    representativeIndex: candidates[representativeOffset],
    score: Math.round(best.average),
  };
}

function bestWindow(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], start: number, mop?: HourlyData) {
  const candidates = surfableIndexes(marine.time, start, 12);
  if (!candidates.length) return { label: "No daylight window", score: 0 };
  const scored = candidates.flatMap((index) => {
    const wave = waveAt(profile, marine, index, mop);
    if (!wave) return [];
    const wind = weather.wind_speed_10m?.[index] ?? null;
    const windDirection = weather.wind_direction_10m?.[index] ?? null;
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, wave);
    return [{ index, score: scoreConditions(profile, wave.period, wind, windDirection, tide, face.faceFeet) }];
  });
  const selection = bestWindowSelection(scored.map((item) => item.index), marine.time, scored.map((item) => item.score));
  if (!selection) return { label: "No daylight window", score: 0 };
  return { label: formatWindow(marine.time, selection.startIndex, selection.endIndex), score: selection.score };
}

function buildSpotHourly(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], start: number, mop?: HourlyData) {
  return surfableIndexes(marine.time, start, 7).flatMap((index) => {
    const wave = waveAt(profile, marine, index, mop);
    if (!wave) return [];
    const wind = weather.wind_speed_10m?.[index] ?? null;
    const windDirection = weather.wind_direction_10m?.[index] ?? null;
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, wave);
    return [{
      time: formatHour(marine.time[index]),
      height: face.faceFeet,
      wind: wind == null ? null : Math.round(wind),
      score: scoreConditions(profile, wave.period, wind, windDirection, tide, face.faceFeet),
    }];
  });
}

function closestTide(predictions: TidePrediction[], time: string): TideEstimate {
  if (!predictions.length) return { value: null, trend: null };
  const normalized = time.replace("T", " ").slice(0, 16);
  const targetMs = pseudoLocalMs(normalized.replace(" ", "T"));
  if (!Number.isFinite(targetMs)) return { value: null, trend: null };
  const nextIndex = predictions.findIndex((prediction) => prediction.t >= normalized);
  const upperIndex = nextIndex < 0 ? predictions.length : nextIndex;
  const lowerIndex = Math.max(0, upperIndex - 1);
  const lower = predictions[lowerIndex];
  const upper = predictions[Math.min(upperIndex, predictions.length - 1)];
  const lowerValue = Number(lower?.v);
  const upperValue = Number(upper?.v);
  if (!lower || !upper || !Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) return { value: null, trend: null };
  const lowerMs = pseudoLocalMs(lower.t.replace(" ", "T"));
  const upperMs = pseudoLocalMs(upper.t.replace(" ", "T"));
  const bracketed = targetMs >= lowerMs && targetMs <= upperMs;
  if (!bracketed) return { value: null, trend: null };
  if (lowerMs !== upperMs && upperMs - lowerMs > 3 * 60 * 60 * 1000) return { value: null, trend: null };
  const fraction = upperMs > lowerMs ? Math.max(0, Math.min(1, (targetMs - lowerMs) / (upperMs - lowerMs))) : 0;
  const value = lowerValue + (upperValue - lowerValue) * fraction;
  const delta = upperValue - lowerValue;
  const trend = lowerMs === upperMs ? null : Math.abs(delta) < .03 ? "steady" : delta > 0 ? "rising" : "falling";
  return { value, trend };
}

function formatTide(tide: TideEstimate) {
  if (tide.value == null) return "Forecast unavailable";
  return `${tide.value.toFixed(1)} ft${tide.trend ? ` ${tide.trend}` : ""}`;
}

const mopFrequencies = [.04, .045, .05, .055, .06, .065, .07, .075, .08, .085, .09, .095, .1013, .11, .12, .13, .14, .15, .16, .17, .18, .19, .2, .21, .22, .23, .24, .25];
// La Jolla Shores is included because it is the most sheltered break in the set
// and carried roughly double every other break's error in the measured results,
// which is what directional spread governs. See docs/forecast-verification.md.
const prioritySpectralSpots = new Set(["Trestles", "Swami’s", "Blacks", "La Jolla Shores", "Windansea", "Ocean Beach", "Sunset Cliffs", "Imperial Beach"]);
const mopBandwidths = mopFrequencies.map((frequency, index) => {
  const lower = index === 0 ? frequency - (mopFrequencies[1] - frequency) / 2 : (mopFrequencies[index - 1] + frequency) / 2;
  const upper = index === mopFrequencies.length - 1 ? frequency + (frequency - mopFrequencies[index - 1]) / 2 : (frequency + mopFrequencies[index + 1]) / 2;
  return upper - lower;
});

/**
 * Parses a whitespace-separated spectral vector positionally.
 *
 * CDIP emits a literal `NaN` for frequency bins its model could not resolve,
 * usually the lowest one or two. Dropping those entries shortens the vector and
 * silently misaligns every later bin with its frequency, so unresolved bins are
 * preserved as null and skipped individually instead.
 */
function parseBinVector(value: string | undefined): Array<number | null> {
  return (value ?? "").trim().split(/\s+/).map((token) => {
    const parsed = Number(token);
    return Number.isFinite(parsed) ? parsed : null;
  });
}

function spectralPartitions(
  energyDensity: Array<number | null>,
  directions: Array<number | null>,
  bulkHeight: number,
  a1?: Array<number | null>,
  b1?: Array<number | null>,
): WaveComponent[] {
  // CDIP's a1/b1 are in the same convention as waveMeanDirection: atan2(b1, a1)
  // reproduces it exactly. Using them instead of unit vectors keeps the direction
  // and additionally preserves the magnitude, which is the coherence.
  const directional = a1?.length === mopFrequencies.length && b1?.length === mopFrequencies.length;
  const groups: Array<{ band: WaveComponent["band"]; minimumPeriod: number; maximumPeriod: number }> = [
    { band: "long", minimumPeriod: 14, maximumPeriod: Number.POSITIVE_INFINITY },
    { band: "mid", minimumPeriod: 9, maximumPeriod: 14 },
    { band: "short", minimumPeriod: 0, maximumPeriod: 9 },
  ];
  const components = groups.flatMap(({ band, minimumPeriod, maximumPeriod }) => {
    const bins = mopFrequencies.map((frequency, index) => ({
      period: 1 / frequency,
      direction: directions[index] ?? Number.NaN,
      // Unit vectors when only a mean direction is available; the true Fourier
      // pair when it is not, so a spread band contributes a shorter vector.
      x: directional ? a1![index] ?? Number.NaN : Math.cos((directions[index] ?? Number.NaN) * Math.PI / 180),
      y: directional ? b1![index] ?? Number.NaN : Math.sin((directions[index] ?? Number.NaN) * Math.PI / 180),
      energy: Math.max(0, energyDensity[index] ?? 0) * mopBandwidths[index],
    })).filter((bin) => bin.period >= minimumPeriod && bin.period < maximumPeriod && inRange(bin.direction, 0, 360)
      && Number.isFinite(bin.x) && Number.isFinite(bin.y) && bin.energy > 0);
    const energy = bins.reduce((sum, bin) => sum + bin.energy, 0);
    if (energy < .0001) return [];
    const period = bins.reduce((sum, bin) => sum + bin.period * bin.energy, 0) / energy;
    const x = bins.reduce((sum, bin) => sum + bin.x * bin.energy, 0);
    const y = bins.reduce((sum, bin) => sum + bin.y * bin.energy, 0);
    const direction = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const coherence = directional ? Math.max(0, Math.min(1, Math.hypot(x, y) / energy)) : undefined;
    return [{ height: 4 * Math.sqrt(energy), period, direction, band, ...(coherence == null ? {} : { coherence }) } satisfies WaveComponent];
  });
  const spectralHeight = Math.sqrt(components.reduce((sum, component) => sum + component.height ** 2, 0));
  const scale = spectralHeight > .05 && bulkHeight > 0 ? bulkHeight / spectralHeight : 1;
  return components.map((component) => ({ ...component, height: component.height * scale }));
}

async function fetchMopForecast(profile: Profile) {
  const baseUrl = `https://thredds.cdip.ucsd.edu/thredds/ncss/point/cdip/model/MOP_alongshore/${profile.mopId}_forecast.nc`;
  const start = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  const requestUrl = (variables: string[]) => {
    const url = new URL(baseUrl);
    variables.forEach((variable) => url.searchParams.append("var", variable));
    url.searchParams.set("time_start", start.toISOString());
    url.searchParams.set("time_end", end.toISOString());
    url.searchParams.set("accept", "csv");
    return url.toString();
  };
  const spectralPromise = prioritySpectralSpots.has(profile.name)
    ? fetchText(`CDIP MOP spectrum ${profile.mopId}`, requestUrl(["waveEnergyDensity", "waveMeanDirection", "waveA1Value", "waveB1Value"]), 8_000).catch(() => null)
    : Promise.resolve(null);
  const [text, spectralText] = await Promise.all([
    fetchText(`CDIP MOP ${profile.mopId}`, requestUrl(["waveHs", "waveTp", "waveDp"])),
    spectralPromise,
  ]);
  const rows = parseCsvRows(text);
  const header = rows[0]?.map((column) => column.replace(/\s*\[.*$/, "")) ?? [];
  const column = (name: string) => header.indexOf(name);
  const timeColumn = column("time");
  const heightColumn = column("waveHs");
  const periodColumn = column("waveTp");
  const directionColumn = column("waveDp");
  const spectralByTime = new Map<string, { energy: Array<number | null>; directions: Array<number | null>; a1?: Array<number | null>; b1?: Array<number | null> }>();
  if (spectralText) {
    const spectralRows = parseCsvRows(spectralText);
    const spectralHeader = spectralRows[0]?.map((value) => value.replace(/\s*\[.*$/, "")) ?? [];
    const spectralTimeColumn = spectralHeader.indexOf("time");
    const energyColumn = spectralHeader.indexOf("waveEnergyDensity");
    const meanDirectionColumn = spectralHeader.indexOf("waveMeanDirection");
    if ([spectralTimeColumn, energyColumn, meanDirectionColumn].every((index) => index >= 0)) {
      const a1Column = spectralHeader.indexOf("waveA1Value");
      const b1Column = spectralHeader.indexOf("waveB1Value");
      spectralRows.slice(1).forEach((row) => spectralByTime.set(row[spectralTimeColumn], {
        energy: parseBinVector(row[energyColumn]),
        directions: parseBinVector(row[meanDirectionColumn]),
        a1: a1Column >= 0 ? parseBinVector(row[a1Column]) : undefined,
        b1: b1Column >= 0 ? parseBinVector(row[b1Column]) : undefined,
      }));
    }
  }
  if (rows.length < 9 || [timeColumn, heightColumn, periodColumn, directionColumn].some((index) => index < 0)) throw new Error(`CDIP MOP ${profile.mopId}: empty or changed schema`);
  const values = rows.slice(1).map((row) => {
    const height = Number(row[heightColumn]);
    const spectral = spectralByTime.get(row[timeColumn]);
    const energyDensity = spectral?.energy ?? [];
    const meanDirections = spectral?.directions ?? [];
    return {
      sourceTime: row[timeColumn],
      time: localKeyFromUtc(row[timeColumn]),
      height,
      period: Number(row[periodColumn]),
      direction: Number(row[directionColumn]),
      components: energyDensity.length === mopFrequencies.length && meanDirections.length === mopFrequencies.length
        ? spectralPartitions(energyDensity, meanDirections, height, spectral?.a1, spectral?.b1)
        : [],
    };
  }).filter((row) => row.time && inRange(row.height, 0, 20) && inRange(row.period, 2, 35) && inRange(row.direction, 0, 360));
  if (values.length < 8) throw new Error(`CDIP MOP ${profile.mopId}: invalid forecast`);
  const nowKey = localNowKey();
  const valueTimes = values.map((row) => row.time);
  const current = nearestTimeIndex(valueTimes, nowKey, 3);
  const timelineValid = valueTimes.every((time, index) => Number.isFinite(pseudoLocalMs(time))
    && (index === 0 || (pseudoLocalMs(time) - pseudoLocalMs(valueTimes[index - 1]) > 0
      && pseudoLocalMs(time) - pseudoLocalMs(valueTimes[index - 1]) <= 4 * 60 * 60 * 1000)));
  const dayCoverage = current < 0 ? [] : displayedDayIndexes(valueTimes, current);
  if (!timelineValid || current < 0 || dayCoverage.length !== 5
    || dayCoverage.some(([date, indexes]) => indexes.length < (date === nowKey.slice(0, 10) ? 1 : 4))) {
    throw new Error(`CDIP MOP ${profile.mopId}: insufficient current or forward coverage`);
  }
  return {
    time: values.map((row) => row.time),
    wave_height: values.map((row) => row.height),
    wave_period: values.map((row) => row.period),
    wave_direction: values.map((row) => row.direction),
    spectral_components: values.map((row) => row.components),
    dataTimestamp: values.at(-1)?.sourceTime,
  } satisfies HourlyData & { dataTimestamp?: string };
}

async function fetchCdipObservations() {
  const text = await fetchText("CDIP active stations", "https://cdip.ucsd.edu/data_access/sccoos.cdip");
  const cleaned = text.replace(/<[^>]+>/g, "").trim();
  const observations = cleaned.split(/\r?\n/).map((line) => line.trim().split("\t")).flatMap((fields) => {
    if (fields.length < 10) return [];
    const [stamp, station, name, lat, lon, depthCm, height, period, direction, water] = fields;
    const match = stamp.match(/^(\d{2})\.(\d{2})\.(\d{4})-(\d{2}):(\d{2}):(\d{2})$/);
    if (!match) return [];
    const observedAt = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2]), Number(match[4]), Number(match[5]), Number(match[6])));
    if (!isFresh(observedAt, 6 * 60 * 60 * 1000)) return [];
    const directionValue = direction === "" ? Number.NaN : Number(direction);
    const waterValue = water === "" ? Number.NaN : Number(water);
    const parsed = {
      observedAt: observedAt.toISOString(), station, name, lat: Number(lat), lon: Number(lon), depthM: Number(depthCm) / 100,
      waveHeightM: Number(height), period: Number(period), direction: inRange(directionValue, 0, 360) ? directionValue : null, waterC: inRange(waterValue, 0, 40) ? waterValue : null,
    };
    if (!inRange(parsed.lat, -90, 90) || !inRange(parsed.lon, -180, 180) || !inRange(parsed.waveHeightM, 0, 20) || !inRange(parsed.period, 2, 35)) return [];
    return [parsed satisfies CdipObservation];
  }).filter((item) => item.lat >= 32.45 && item.lat <= 33.5 && item.lon >= -117.75 && item.lon <= -117.05);
  if (!observations.length) throw new Error("CDIP active stations: no fresh San Diego observations");
  return observations.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
}

async function fetchCdipSpectrum(station: string) {
  const text = await fetchText(`CDIP spectrum ${station}`, `https://cdip.ucsd.edu/data_access/ndar.cdip?${station}+9c+1`);
  const cleaned = text.replace(/<[^>]+>/g, "").trim();
  const row = cleaned.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^\d{12}\s+/.test(line)).at(-1);
  if (!row) throw new Error(`CDIP spectrum ${station}: no recent spectrum`);
  const values = row.split(/\s+/).map(Number);
  const stamp = String(values.shift());
  const observedAt = new Date(Date.UTC(Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)), Number(stamp.slice(8, 10)), Number(stamp.slice(10, 12))));
  const periodBands = [24, 20, 17, 15, 13, 11, 9, 7, 4];
  const ranked = periodBands.map((period, index) => {
    const energy = values[index * 2];
    const direction = values[index * 2 + 1];
    return { period, direction, energy, heightM: 4 * Math.sqrt(Math.max(0, energy) / 10_000) };
  }).filter((item) => item.period >= 8 && item.energy > 0 && inRange(item.direction, 0, 360)).sort((a, b) => b.energy - a.energy);
  const primary = ranked[0];
  const distinct = primary && ranked.find((item) => item !== primary && item.energy >= primary.energy * .18
    && (Math.abs(item.period - primary.period) >= 3 || angularDifference(item.direction, primary.direction) >= 25));
  const components = primary ? [primary, ...(distinct ? [distinct] : [])] : [];
  if (!components.length || !isFresh(observedAt, 6 * 60 * 60 * 1000)) throw new Error(`CDIP spectrum ${station}: stale or empty`);
  return { observedAt: observedAt.toISOString(), station, components } satisfies CdipSpectrum;
}

async function fetchCoastalWind(station: string) {
  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.searchParams.set("product", "wind");
  url.searchParams.set("application", "SanDiegoSurfDashboard");
  url.searchParams.set("date", "latest");
  url.searchParams.set("station", station);
  url.searchParams.set("time_zone", "gmt");
  url.searchParams.set("units", "english");
  url.searchParams.set("format", "json");
  const data = await fetchJson<{ data?: Array<{ t: string; s: string; d: string }> }>(`NOAA coastal wind ${station}`, url.toString());
  const item = data.data?.[0];
  if (!item) throw new Error(`NOAA coastal wind ${station}: no observation`);
  const observedAt = new Date(`${item.t.replace(" ", "T")}:00Z`);
  const observation = { observedAt: observedAt.toISOString(), station, speed: Number(item.s), direction: Number(item.d) };
  if (!inRange(observation.speed, 0, 100) || !inRange(observation.direction, 0, 360) || !isFresh(observedAt, 3 * 60 * 60 * 1000)) throw new Error(`NOAA coastal wind ${station}: stale observation`);
  return observation satisfies CoastalWind;
}

function nearestTimeIndex(times: string[] | undefined, target: string, toleranceHours = 2) {
  if (!times?.length) return -1;
  const targetMs = pseudoLocalMs(target);
  let bestIndex = -1;
  let bestDifference = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const difference = Math.abs(pseudoLocalMs(time) - targetMs);
    if (difference < bestDifference) { bestDifference = difference; bestIndex = index; }
  });
  return bestDifference <= toleranceHours * 60 * 60 * 1000 ? bestIndex : -1;
}

function regionalPartitionsAt(marine: HourlyData, index: number) {
  const components: WaveComponent[] = [];
  const bandForPeriod = (period: number): WaveComponent["band"] => period >= 14 ? "long" : period >= 9 ? "mid" : "short";
  const add = (height: number | null | undefined, direction: number | null | undefined, period: number | null | undefined, band: WaveComponent["band"]) => {
    if (height != null && direction != null && period != null && inRange(height, .05, 20) && inRange(direction, 0, 360) && inRange(period, 2, 35)) {
      components.push({ height, direction, period, band });
    }
  };
  const primaryPeriod = marine.swell_wave_period?.[index];
  const secondaryPeriod = marine.secondary_swell_wave_period?.[index];
  add(marine.swell_wave_height?.[index], marine.swell_wave_direction?.[index], primaryPeriod, primaryPeriod == null ? "mid" : bandForPeriod(primaryPeriod));
  add(marine.secondary_swell_wave_height?.[index], marine.secondary_swell_wave_direction?.[index], secondaryPeriod, secondaryPeriod == null ? "mid" : bandForPeriod(secondaryPeriod));
  const totalHeight = n(marine.wave_height?.[index]);
  const partitionEnergy = components.reduce((sum, component) => sum + component.height ** 2, 0);
  const residualHeight = Math.sqrt(Math.max(0, totalHeight ** 2 - partitionEnergy));
  if (residualHeight >= .08) add(residualHeight, marine.wave_direction?.[index], marine.wave_period?.[index], "short");
  return components;
}

function coherentComponent(height: number | null | undefined, direction: number | null | undefined, period: number | null | undefined, band: WaveComponent["band"]) {
  return height != null && direction != null && period != null
    && inRange(height, .05, 20) && inRange(direction, 0, 360) && inRange(period, 2, 35)
    ? { height, direction, period, band } satisfies WaveComponent
    : null;
}

function waveAt(profile: Profile, marine: HourlyData, index: number, mop?: HourlyData): WaveEstimate | null {
  const mopIndex = nearestTimeIndex(mop?.time, marine.time[index], 2);
  const nearshore = mopIndex >= 0;
  const source = nearshore ? mop! : marine;
  const sourceIndex = nearshore ? mopIndex : index;
  const bulk = coherentComponent(source.wave_height?.[sourceIndex], source.wave_direction?.[sourceIndex], source.wave_period?.[sourceIndex], "bulk")
    ?? coherentComponent(source.swell_wave_height?.[sourceIndex], source.swell_wave_direction?.[sourceIndex], source.swell_wave_period?.[sourceIndex], "mid");
  let componentSource: WaveEstimate["componentSource"] = "Bulk peak";
  let components = source.spectral_components?.[sourceIndex]?.filter((component) => component.height > .03) ?? [];
  if (components.length) {
    componentSource = "CDIP spectrum";
  } else {
    components = regionalPartitionsAt(marine, index);
    if (components.length) {
      componentSource = "Regional partitions";
      if (nearshore) {
        if (!bulk) return null;
        const partitionHeight = Math.sqrt(components.reduce((sum, component) => sum + component.height ** 2, 0));
        const scale = partitionHeight > .05 ? bulk.height / partitionHeight : 1;
        components = components.map((component) => ({ ...component, height: component.height * scale }));
      }
    }
  }
  if (!components.length && bulk) components = [bulk];
  if (!components.length) return null;
  components = [...components].sort((a, b) => componentFaceFeet(profile, b, nearshore) - componentFaceFeet(profile, a, nearshore));
  const primary = components[0];
  const height = bulk?.height ?? Math.sqrt(components.reduce((sum, component) => sum + component.height ** 2, 0));
  return { height, direction: primary.direction, period: primary.period, nearshore, components, componentSource };
}

function peakWaveAt(profile: Profile, marine: HourlyData, indexes: number[], mop?: HourlyData, includeRegionalGuide = false) {
  return indexes.reduce<{ index: number; wave: WaveEstimate; face: ReturnType<typeof spotHeight>; source: "Nearshore model" | "Regional planning guide" } | null>((peak, index) => {
    const waves = [waveAt(profile, marine, index, mop), ...(includeRegionalGuide && mop ? [waveAt(profile, marine, index)] : [])]
      .filter((wave): wave is WaveEstimate => Boolean(wave));
    const strongest = waves.reduce<{ wave: WaveEstimate; face: ReturnType<typeof spotHeight> } | null>((best, wave) => {
      const face = spotHeight(profile, wave);
      return !best || face.faceFeet > best.face.faceFeet ? { wave, face } : best;
    }, null);
    if (!strongest) return peak;
    const candidate = { index, ...strongest, source: strongest.wave.nearshore ? "Nearshore model" as const : "Regional planning guide" as const };
    return !peak || candidate.face.faceFeet > peak.face.faceFeet ? candidate : peak;
  }, null);
}

function blendDirection(model: number, observed: number, weight: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const x = (1 - weight) * Math.cos(radians(model)) + weight * Math.cos(radians(observed));
  const y = (1 - weight) * Math.sin(radians(model)) + weight * Math.sin(radians(observed));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function windCorrectionIndex(weather: HourlyData, observation: CoastalWind, zone: Zone) {
  // La Jolla is a Central County station; do not imply county-wide correction.
  if (zone !== "Central") return -1;
  const observedKey = localKeyFromUtc(observation.observedAt);
  const observedIndex = nearestTimeIndex(weather.time, observedKey, 2);
  if (observedIndex < 0) return -1;
  const modeledObservedSpeed = weather.wind_speed_10m?.[observedIndex];
  const modeledObservedDirection = weather.wind_direction_10m?.[observedIndex];
  return modeledObservedSpeed == null || modeledObservedDirection == null ? -1 : observedIndex;
}

function correctWindForecast(weather: HourlyData, observation: CoastalWind, zone: Zone) {
  const observedIndex = windCorrectionIndex(weather, observation, zone);
  if (observedIndex < 0) return weather;
  const observedKey = localKeyFromUtc(observation.observedAt);
  const modeledObservedSpeed = weather.wind_speed_10m![observedIndex]!;
  const ageHours = Math.max(0, (Date.now() - Date.parse(observation.observedAt)) / 3_600_000);
  const ageWeight = Math.exp(-ageHours / 3);
  return {
    ...weather,
    wind_speed_10m: weather.time.map((time, index) => {
      const modeled = weather.wind_speed_10m?.[index];
      if (modeled == null || weather.wind_direction_10m?.[index] == null) return null;
      const lead = Math.max(0, (pseudoLocalMs(time) - pseudoLocalMs(observedKey)) / 3_600_000);
      const weight = ageWeight * Math.exp(-lead / 18);
      return Math.max(0, modeled + (observation.speed - modeledObservedSpeed) * weight);
    }),
    wind_direction_10m: weather.time.map((time, index) => {
      const modeled = weather.wind_direction_10m?.[index];
      if (modeled == null || weather.wind_speed_10m?.[index] == null) return null;
      const lead = Math.max(0, (pseudoLocalMs(time) - pseudoLocalMs(observedKey)) / 3_600_000);
      return blendDirection(modeled, observation.direction, ageWeight * Math.exp(-lead / 18));
    }),
  } satisfies HourlyData;
}

function nearestObservation(profile: Profile, observations: CdipObservation[]) {
  const coordinates = spotCoordinates[profile.name];
  if (!coordinates) return null;
  const [lat, lon] = coordinates;
  return observations.reduce<{ item: CdipObservation; distance: number } | null>((best, item) => {
    const latitudeMiles = (item.lat - lat) * 69;
    const longitudeMiles = (item.lon - lon) * 69 * Math.cos(lat * Math.PI / 180);
    const distance = Math.hypot(latitudeMiles, longitudeMiles);
    return !best || distance < best.distance ? { item, distance } : best;
  }, null);
}

/**
 * The modeled values behind the display strings, captured so a stored run can
 * later be scored against CDIP truth. The published fields are formatted faces
 * ("1-2 ft"), which are a different quantity from the measured significant
 * wave height a buoy-initialised nowcast reports in metres.
 */
function rawForecastRecord(
  profile: Profile,
  wave: WaveEstimate,
  localTime: string,
  windSpeed: number | null,
  windDirection: number | null,
  tideFt: number | null,
) {
  return {
    validAt: localForecastTimeToIso(localTime),
    horizonHours: Math.max(0, Math.round((pseudoLocalMs(localTime) - pseudoLocalMs(localNowKey())) / 3_600_000)),
    waveHeightM: wave.height,
    periodS: wave.period,
    directionDeg: wave.direction,
    windKt: windSpeed,
    windDeg: windDirection,
    tideFt,
    nearshore: wave.nearshore,
    mopId: profile.mopId,
  };
}

function secondarySwellAt(wave: WaveEstimate) {
  const primary = wave.components[0];
  const component = wave.components.slice(1).find((candidate) => !primary || Math.abs(candidate.period - primary.period) >= 2 || angularDifference(candidate.direction, primary.direction) >= 25)
  if (!component) return "No distinct secondary";
  return `${cardinal(component.direction)} · ${Math.round(component.period)}s`;
}

const windDirectionDegrees: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

function parseNwsWindSpeed(value: string) {
  const values = value.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!values.length) return null;
  const milesPerHour = values.reduce((sum, item) => sum + item, 0) / values.length;
  return milesPerHour * .868976;
}

async function fetchNwsWind(zone: Zone) {
  const point = nwsWindPoints[zone];
  const metadata = await fetchJson<{ properties?: { forecastHourly?: string } }>(`NWS ${zone} grid`, `https://api.weather.gov/points/${point.lat.toFixed(4)},${point.lon.toFixed(4)}`);
  const forecastUrl = metadata.properties?.forecastHourly;
  if (!forecastUrl) throw new Error(`NWS ${zone}: no hourly grid`);
  const forecast = await fetchJson<{ properties?: { periods?: Array<{ startTime: string; windSpeed: string; windDirection: string }> } }>(`NWS ${zone} wind`, forecastUrl);
  const rows = (forecast.properties?.periods ?? []).flatMap((period) => {
    const speed = parseNwsWindSpeed(period.windSpeed);
    const direction = windDirectionDegrees[period.windDirection];
    if (speed == null || direction == null) return [];
    return [{ time: localKeyFromUtc(new Date(period.startTime).toISOString()), speed, direction }];
  });
  if (rows.length < 24) throw new Error(`NWS ${zone}: insufficient hourly wind`);
  return {
    time: rows.map((row) => row.time),
    wind_speed_10m: rows.map((row) => row.speed),
    wind_direction_10m: rows.map((row) => row.direction),
  } satisfies HourlyData;
}

async function fetchNwsWinds() {
  const zones = Object.keys(zonePoints) as Zone[];
  const results = await Promise.allSettled(zones.map(fetchNwsWind));
  return new Map<Zone, HourlyData>(zones.flatMap((zone, index) => results[index].status === "fulfilled" ? [[zone, results[index].value]] : []));
}

async function fetchZones() {
  const zones = Object.keys(zonePoints) as Zone[];
  const points = zones.map((zone) => zonePoints[zone]);
  const spotPoints = profiles.map((profile) => {
    const [lat, lon] = spotCoordinates[profile.name];
    return { lat, lon };
  });
  const windPoints = [...points, ...spotPoints];
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude", points.map((point) => point.lat).join(","));
  marineUrl.searchParams.set("longitude", points.map((point) => point.lon).join(","));
  marineUrl.searchParams.set("hourly", "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period");
  marineUrl.searchParams.set("timezone", zones.map(() => "America/Los_Angeles").join(","));
  marineUrl.searchParams.set("forecast_days", "6");
  marineUrl.searchParams.set("cell_selection", "sea");

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", windPoints.map((point) => point.lat).join(","));
  weatherUrl.searchParams.set("longitude", windPoints.map((point) => point.lon).join(","));
  weatherUrl.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  weatherUrl.searchParams.set("wind_speed_unit", "kn");
  weatherUrl.searchParams.set("timezone", windPoints.map(() => "America/Los_Angeles").join(","));
  weatherUrl.searchParams.set("forecast_days", "6");

  const [marineResult, weatherResult] = await Promise.allSettled([
    fetchJson<ForecastResponse[]>("Open-Meteo marine (3-zone batch)", marineUrl.toString()),
    fetchJson<ForecastResponse[]>("Open-Meteo wind (3-zone + 17-spot batch)", weatherUrl.toString()),
  ]);

  const marineResponses = marineResult.status === "fulfilled" ? marineResult.value : [];
  const weatherResponses = weatherResult.status === "fulfilled" ? weatherResult.value : [];
  const forecasts = new Map<Zone, ZoneForecast>();
  zones.forEach((zone, index) => {
    const marine = marineResponses[index]?.hourly;
    if (!marine || !hasUsableMarineForecast(marine)) return;
    const weatherHourly = weatherResponses[index]?.hourly;
    const alignedWeather = weatherHourly ? alignWeatherToMarine(marine.time, weatherHourly) : null;
    const windLive = Boolean(alignedWeather?.usable);
    forecasts.set(zone, {
      marine,
      weather: windLive ? alignedWeather!.hourly : { time: marine.time },
      windLive,
      regionalLive: true,
      windSource: windLive ? "Open-Meteo" : "Unavailable",
    });
  });
  const spotWinds = new Map<string, HourlyData>();
  profiles.forEach((profile, index) => {
    const weather = weatherResponses[zones.length + index]?.hourly;
    if (weather?.time?.length) spotWinds.set(profile.name, weather);
  });
  return { zones: forecasts, spotWinds } satisfies ForecastBundle;
}

async function fetchTides(station: string) {
  const url = new URL("https://api.tidesandcurrents.noaa.gov/api/prod/datagetter");
  url.searchParams.set("product", "predictions");
  url.searchParams.set("application", "SanDiegoSurfDashboard");
  url.searchParams.set("begin_date", localNowKey().slice(0, 10).replaceAll("-", ""));
  url.searchParams.set("range", "144");
  url.searchParams.set("datum", "MLLW");
  url.searchParams.set("station", station);
  url.searchParams.set("time_zone", "lst_ldt");
  url.searchParams.set("units", "english");
  url.searchParams.set("interval", "h");
  url.searchParams.set("format", "json");
  const data = await fetchJson<{ predictions?: TidePrediction[] }>(`NOAA tides ${station}`, url.toString());
  const predictions = (data.predictions ?? [])
    .filter((prediction) => typeof prediction.t === "string" && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(prediction.t)
      && typeof prediction.v === "string" && prediction.v.trim() !== ""
      && Number.isFinite(pseudoLocalMs(prediction.t.replace(" ", "T"))) && inRange(Number(prediction.v), -10, 15))
    .sort((a, b) => a.t.localeCompare(b.t));
  if (!predictions.length) throw new Error(`NOAA tides ${station}: empty predictions`);
  const nowKey = localNowKey();
  const tideTimes = predictions.map((prediction) => prediction.t.replace(" ", "T"));
  const currentPrediction = nearestTimeIndex(tideTimes, nowKey, 2);
  const displayedDays = currentPrediction < 0 ? [] : displayedDayIndexes(tideTimes, currentPrediction);
  const finalDisplayedHour = displayedDays.length === 5 ? `${displayedDays[4][0]}T19:00` : null;
  const hasLargeGap = predictions.some((prediction, index) => index > 0
    && pseudoLocalMs(prediction.t.replace(" ", "T")) - pseudoLocalMs(predictions[index - 1].t.replace(" ", "T")) > 3 * 60 * 60 * 1000);
  const complete = closestTide(predictions, nowKey).value != null
    && finalDisplayedHour != null
    && closestTide(predictions, finalDisplayedHour).value != null
    && !hasLargeGap;
  return { predictions, complete } satisfies TideFeed;
}

async function fetchBuoy() {
  const response = await fetch("https://www.ndbc.noaa.gov/data/realtime2/46225.txt", { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`NDBC returned ${response.status}`);
  const text = await response.text();
  const row = text.split("\n").find((line) => line.trim() && !line.startsWith("#"));
  if (!row) throw new Error("No buoy observation");
  const fields = row.trim().split(/\s+/);
  const parse = (index: number) => fields[index] === "MM" ? null : Number(fields[index]);
  const year = Number(fields[0]);
  const month = Number(fields[1]);
  const day = Number(fields[2]);
  const hour = Number(fields[3]);
  const minute = Number(fields[4]);
  const observedAt = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (!isFresh(observedAt, 6 * 60 * 60 * 1000)) {
    throw new Error("NDBC observation is stale");
  }
  const waveHeightM = parse(8);
  const dominantPeriod = parse(9);
  const meanDirection = parse(11);
  const rawWaterC = parse(14);
  if (waveHeightM == null || !inRange(waveHeightM, 0, 20)
    || dominantPeriod == null || !inRange(dominantPeriod, 1, 40)
    || meanDirection == null || !inRange(meanDirection, 0, 360)) {
    throw new Error("NDBC observation is incomplete or out of range");
  }
  const observation = {
    observedAt: observedAt.toISOString(),
    waveHeightM,
    dominantPeriod,
    meanDirection,
    waterC: rawWaterC != null && inRange(rawWaterC, -5, 40) ? rawWaterC : null,
  };
  return observation;
}

function buildZoneSeries(zone: Zone, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], mop?: HourlyData, leadProfile?: Profile) {
  const profile = leadProfile ?? profiles.find((item) => item.name === zoneLeadSpot[zone])!;
  const start = currentIndex(marine.time);
  if (start < 0) return { hourly: [], days: [] };
  const hourly = buildSpotHourly(profile, marine, weather, tides, start, mop);

  const today = marine.time[start]?.slice(0, 10);
  const uniqueDates = displayedDayIndexes(marine.time, start).map(([date]) => date);
  const days = uniqueDates.flatMap((date) => {
    const indexes = marine.time.map((time, index) => ({ time, index }))
      .filter(({ time, index }) => index >= start && time.startsWith(date) && Number(time.slice(11, 13)) >= 5 && Number(time.slice(11, 13)) <= 19)
      .map(({ index }) => index);
    const scored = indexes.flatMap((index) => {
      const hourWave = waveAt(profile, marine, index, mop);
      if (!hourWave) return [];
      const wind = weather.wind_speed_10m?.[index] ?? null;
      const windDirection = weather.wind_direction_10m?.[index] ?? null;
      const tide = closestTide(tides, marine.time[index]).value;
      const hourFace = spotHeight(profile, hourWave);
      return [{ index, score: scoreConditions(profile, hourWave.period, wind, windDirection, tide, hourFace.faceFeet) }];
    });
    const selection = bestWindowSelection(scored.map((item) => item.index), marine.time, scored.map((item) => item.score));
    const representativeIndex = selection?.representativeIndex ?? scored[0]?.index;
    if (representativeIndex == null) return [];
    const peak = peakWaveAt(profile, marine, indexes, mop, Boolean(profile.regionalPlanningGuide));
    if (!peak) return [];
    const parsed = new Date(`${date}T12:00:00-07:00`);
    return [{
      dateKey: date,
      day: date === today ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Los_Angeles" }).format(parsed),
      date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(parsed),
      height: peak.face.label,
      sets: peak.face.sets,
      dayPeak: formatHour(marine.time[peak.index]),
      daySource: peak.source,
      rating: rating(selection?.score ?? 0),
      period: `${Math.round(peak.wave.period)}s`,
    }];
  });
  return { hourly, days };
}

function buildDailySpot(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], date: string, waterF: number | null, context: {
  mop?: HourlyData;
  observation: { item: CdipObservation; distance: number } | null;
  windObserved: boolean;
  tidesLive: boolean;
  windLive: boolean;
  regionalLive: boolean;
  windSource: ZoneForecast["windSource"];
}) {
  const candidates = marine.time.map((time, index) => ({ time, index }))
    .filter(({ time, index }) => time.startsWith(date) && Number(time.slice(11, 13)) >= 5 && Number(time.slice(11, 13)) <= 19
      && waveAt(profile, marine, index, context.mop) != null)
    .map(({ index }) => index);
  if (!candidates.length) return null;

  const scoreAt = (index: number) => {
    const wave = waveAt(profile, marine, index, context.mop);
    if (!wave) return 0;
    const wind = weather.wind_speed_10m?.[index] ?? null;
    const windDirection = weather.wind_direction_10m?.[index] ?? null;
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, wave);
    return scoreConditions(profile, wave.period, wind, windDirection, tide, face.faceFeet);
  };

  const scores = candidates.map(scoreAt);
  const selection = bestWindowSelection(candidates, marine.time, scores);
  if (!selection) return null;
  const peak = peakWaveAt(profile, marine, candidates, context.mop, Boolean(profile.regionalPlanningGuide));
  if (!peak) return null;
  const index = selection.representativeIndex;
  const wave = waveAt(profile, marine, index, context.mop);
  if (!wave) return null;
  const windSpeed = weather.wind_speed_10m?.[index] ?? null;
  const windDirection = weather.wind_direction_10m?.[index] ?? null;
  const tide = closestTide(tides, marine.time[index]);
  const face = spotHeight(profile, wave);
  const chartIndexes = candidates.filter((_, position) => position % 2 === 0).slice(0, 7);
  const regionalSwellHeight = marine.swell_wave_height?.[index];
  const regionalBulkHeight = marine.wave_height?.[index];
  const offshoreHeight = context.regionalLive
    ? typeof regionalSwellHeight === "number" && Number.isFinite(regionalSwellHeight) ? regionalSwellHeight
      : typeof regionalBulkHeight === "number" && Number.isFinite(regionalBulkHeight) ? regionalBulkHeight : null
    : null;
  const horizonHours = Math.max(0, (pseudoLocalMs(marine.time[index]) - pseudoLocalMs(localNowKey())) / 3_600_000);
  const confidence = forecastConfidence({
    nearshore: wave.nearshore,
    observation: context.observation,
    windObserved: context.windObserved && windSpeed != null && windDirection != null,
    tidesLive: context.tidesLive && tide.value != null,
    windLive: context.windLive && windSpeed != null && windDirection != null,
    horizonHours,
    offshoreHeight,
    nearshoreHeight: wave.height,
    modelPeriod: wave.period,
    modelDirection: wave.direction,
  });

  return {
    name: profile.name,
    height: face.label,
    sets: face.sets,
    dayHeight: peak.face.label,
    daySets: peak.face.sets,
    dayPeak: formatHour(marine.time[peak.index]),
    daySource: peak.source,
    rating: rating(selection.score),
    score: selection.score,
    swell: cardinal(wave.direction),
    swellDegrees: Math.round(wave.direction),
    period: `${Math.round(wave.period)}s`,
    secondarySwell: secondarySwellAt(wave),
    secondarySwellSource: wave.componentSource,
    wind: windSpeed == null || windDirection == null ? "Forecast unavailable" : `${Math.round(windSpeed)} kt ${cardinal(windDirection)}`,
    windSource: context.windSource,
    tide: formatTide(tide),
    water: waterF == null ? "—" : `${waterF}°`,
    best: formatWindow(marine.time, selection.startIndex, selection.endIndex),
    confidence: confidence.label,
    confidenceScore: confidence.score,
    confidenceReason: confidence.reason,
    forecastSkill: "Not measured",
    modelPoint: wave.nearshore ? profile.mopId : "Regional fallback",
    summary: conditionSummary(profile, wave.period, windSpeed, windDirection, tide.value),
    raw: rawForecastRecord(profile, wave, marine.time[index], windSpeed, windDirection, tide.value),
    hourly: chartIndexes.map((hourIndex) => ({
      time: formatHour(marine.time[hourIndex]),
      height: (() => {
        const chartWave = waveAt(profile, marine, hourIndex, context.mop);
        return chartWave ? spotHeight(profile, chartWave).faceFeet : 0;
      })(),
      wind: weather.wind_speed_10m?.[hourIndex] == null ? null : Math.round(weather.wind_speed_10m![hourIndex]!),
      score: scoreAt(hourIndex),
    })),
  };
}

async function buildPayload() {
  const zones = Object.keys(zonePoints) as Zone[];
  const [regionalForecastResult, laJollaTideResult, sanDiegoTideResult, buoyResult, cdipResult, spectrumResult, windObservationResult, nwsWindResult, mopResults] = await Promise.all([
    fetchZones().then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] Open-Meteo batch unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: { zones: new Map<Zone, ZoneForecast>(), spotWinds: new Map<string, HourlyData>() } satisfies ForecastBundle };
    }),
    fetchTides("9410230").then((feed) => ({ ok: feed.complete, value: feed.predictions })).catch(() => ({ ok: false, value: [] as TidePrediction[] })),
    fetchTides("9410170").then((feed) => ({ ok: feed.complete, value: feed.predictions })).catch(() => ({ ok: false, value: [] as TidePrediction[] })),
    fetchBuoy().then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] NDBC buoy fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: null };
    }),
    fetchCdipObservations().then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] CDIP station fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: [] as CdipObservation[] };
    }),
    fetchCdipSpectrum("100").then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] CDIP spectrum fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: null };
    }),
    fetchCoastalWind("9410230").then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] NOAA coastal wind fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: null };
    }),
    fetchNwsWinds().then((value) => ({ ok: value.size > 0, value })).catch((error) => {
      console.error(`[conditions] NWS wind fallback failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false, value: new Map<Zone, HourlyData>() };
    }),
    settledMapWithConcurrency(profiles, 4, fetchMopForecast),
  ]);

  const laJollaTides = laJollaTideResult.value;
  const sanDiegoTides = sanDiegoTideResult.value;

  const mopBySpot = new Map<string, HourlyData>();
  mopResults.forEach((result, index) => {
    if (result.status === "fulfilled") mopBySpot.set(profiles[index].name, result.value);
    else console.error(`[conditions] CDIP MOP ${profiles[index].mopId} unavailable`);
  });

  const zoneData = new Map<Zone, ZoneForecast>();
  zones.forEach((zone) => {
    const regional = regionalForecastResult.value.zones.get(zone);
    if (regional) {
      const nwsAligned = nwsWindResult.value.get(zone) ? alignWeatherToMarine(regional.marine.time, nwsWindResult.value.get(zone)!) : null;
      const windResolved: ZoneForecast = regional.windLive
        ? regional
        : nwsAligned?.usable
          ? { ...regional, weather: nwsAligned.hourly, windLive: true, windSource: "NWS" }
          : regional;
      zoneData.set(zone, windResolved);
      return;
    }
    const lead = profiles.find((profile) => profile.zone === zone && mopBySpot.has(profile.name));
    const mop = lead ? mopBySpot.get(lead.name) : undefined;
    if (mop?.time.length) {
      const nwsAligned = nwsWindResult.value.get(zone) ? alignWeatherToMarine(mop.time, nwsWindResult.value.get(zone)!) : null;
      const fallback: ZoneForecast = nwsAligned?.usable
        ? { marine: mop, weather: nwsAligned.hourly, windLive: true, regionalLive: false, windSource: "NWS" }
        : { marine: mop, weather: { time: mop.time }, windLive: false, regionalLive: false, windSource: "Unavailable" };
      zoneData.set(zone, fallback);
    }
  });

  const dataForProfile = (profile: Profile) => {
    const zone = zoneData.get(profile.zone);
    if (!zone) return null;
    if (zone.regionalLive) {
      const spotWeather = regionalForecastResult.value.spotWinds.get(profile.name);
      const alignedSpotWeather = spotWeather ? alignWeatherToMarine(zone.marine.time, spotWeather) : null;
      const resolved = alignedSpotWeather?.usable
        ? { ...zone, weather: alignedSpotWeather.hourly, windLive: true, windSource: "Open-Meteo" as const }
        : zone;
      return windObservationResult.value && resolved.windLive
        ? { ...resolved, weather: correctWindForecast(resolved.weather, windObservationResult.value, profile.zone) }
        : resolved;
    }
    const ownMop = mopBySpot.get(profile.name);
    if (!ownMop) return null;
    const weatherSource = nwsWindResult.value.get(profile.zone);
    const aligned = weatherSource ? alignWeatherToMarine(ownMop.time, weatherSource) : null;
    const alignedWeather: HourlyData = aligned?.usable ? aligned.hourly : { time: ownMop.time };
    return {
      ...zone,
      marine: ownMop,
      weather: windObservationResult.value && aligned?.usable
        ? correctWindForecast(alignedWeather, windObservationResult.value, profile.zone)
        : alignedWeather,
      windLive: Boolean(aligned?.usable),
      windSource: aligned?.usable ? "NWS" as const : "Unavailable" as const,
    };
  };
  const conditions = profiles.flatMap((profile) => {
    const data = dataForProfile(profile);
    if (!data) return [];
    const tides = profile.zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const tidesLive = profile.zone === "South Bay" ? sanDiegoTideResult.ok : laJollaTideResult.ok;
    const index = currentIndex(data.marine.time);
    if (index < 0) return [];
    const mop = mopBySpot.get(profile.name);
    const wave = waveAt(profile, data.marine, index, mop);
    if (!wave) return [];
    const observation = nearestObservation(profile, cdipResult.value);
    const windSpeed = data.weather.wind_speed_10m?.[index] ?? null;
    const windDirection = data.weather.wind_direction_10m?.[index] ?? null;
    const tide = closestTide(tides, data.marine.time[index]);
    const face = spotHeight(profile, wave);
    const score = scoreConditions(profile, wave.period, windSpeed, windDirection, tide.value, face.faceFeet);
    const window = bestWindow(profile, data.marine, data.weather, tides, index, mop);
    const waterC = observation?.item.waterC ?? buoyResult.value?.waterC ?? null;
    const waterF = waterC != null ? Math.round(waterC * 9 / 5 + 32) : null;
    const windObservationApplied = Boolean(windObservationResult.value && data.windLive && profile.zone === "Central"
      && windCorrectionIndex(data.weather, windObservationResult.value, profile.zone) >= 0);
    const confidence = forecastConfidence({
      nearshore: wave.nearshore,
      observation,
      windObserved: windObservationApplied && windSpeed != null && windDirection != null,
      tidesLive: tidesLive && tide.value != null,
      windLive: data.windLive && windSpeed != null && windDirection != null,
      horizonHours: 0,
      offshoreHeight: data.regionalLive
        ? n(data.marine.swell_wave_height?.[index], n(data.marine.wave_height?.[index], 0)) || null
        : null,
      nearshoreHeight: wave.height,
      modelPeriod: wave.period,
      modelDirection: wave.direction,
    });
    return [{
      name: profile.name,
      height: face.label,
      sets: face.sets,
      rating: rating(score),
      currentScore: score,
      score: window.score,
      swell: cardinal(wave.direction),
      swellDegrees: Math.round(wave.direction),
      period: `${Math.round(wave.period)}s`,
      secondarySwell: secondarySwellAt(wave),
      secondarySwellSource: wave.componentSource,
      wind: windSpeed == null || windDirection == null ? "Forecast unavailable" : `${Math.round(windSpeed)} kt ${cardinal(windDirection)}`,
      windSource: data.windSource,
      tide: formatTide(tide),
      water: waterF == null ? "—" : `${waterF}°`,
      best: window.label,
      confidence: confidence.label,
      confidenceScore: confidence.score,
      confidenceReason: confidence.reason,
      forecastSkill: "Not measured",
      modelPoint: wave.nearshore ? profile.mopId : "Regional fallback",
      summary: conditionSummary(profile, wave.period, windSpeed, windDirection, tide.value),
      raw: rawForecastRecord(profile, wave, data.marine.time[index], windSpeed, windDirection, tide.value),
      hourly: buildSpotHourly(profile, data.marine, data.weather, tides, index, mop),
    }];
  });

  const series = Object.fromEntries(zones.flatMap((zone) => {
    const zoneProfiles = profiles.filter((profile) => profile.zone === zone);
    const preferred = zoneProfiles.find((profile) => profile.name === zoneLeadSpot[zone]);
    const lead = preferred && dataForProfile(preferred) ? preferred : zoneProfiles.find((profile) => dataForProfile(profile));
    if (!lead) return [];
    const data = dataForProfile(lead);
    if (!data) return [];
    const tides = zone === "South Bay" ? sanDiegoTides : laJollaTides;
    return [[zone, buildZoneSeries(zone, data.marine, data.weather, tides, mopBySpot.get(lead.name), lead)]];
  }));

  const firstLiveZone = zones.find((zone) => zoneData.has(zone));
  const firstLiveMarine = firstLiveZone ? zoneData.get(firstLiveZone)!.marine : null;
  const firstLiveIndex = firstLiveMarine ? currentIndex(firstLiveMarine.time) : -1;
  const dailyDateKeys = firstLiveMarine && firstLiveIndex >= 0
    ? displayedDayIndexes(firstLiveMarine.time, firstLiveIndex).map(([date]) => date)
    : [];
  const dailyConditions = Object.fromEntries(dailyDateKeys.map((date) => [date, profiles.flatMap((profile) => {
    const data = dataForProfile(profile);
    if (!data) return [];
    const tides = profile.zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const observation = nearestObservation(profile, cdipResult.value);
    const waterC = observation?.item.waterC ?? buoyResult.value?.waterC ?? null;
    const waterF = waterC != null ? Math.round(waterC * 9 / 5 + 32) : null;
    const forecast = buildDailySpot(profile, data.marine, data.weather, tides, date, waterF, {
      mop: mopBySpot.get(profile.name),
      observation,
      windObserved: Boolean(windObservationResult.value && data.windLive && profile.zone === "Central"
        && windCorrectionIndex(data.weather, windObservationResult.value, profile.zone) >= 0),
      tidesLive: profile.zone === "South Bay" ? sanDiegoTideResult.ok : laJollaTideResult.ok,
      windLive: data.windLive,
      regionalLive: data.regionalLive,
      windSource: data.windSource,
    });
    return forecast ? [forecast] : [];
  })]));

  const liveZones = zoneData.size;
  const regionalMarineLiveCount = [...zoneData.values()].filter((data) => data.regionalLive).length;
  const resolvedSpotData = profiles.flatMap((profile) => {
    const data = dataForProfile(profile);
    return data ? [{ profile, data }] : [];
  });
  const windLiveCount = resolvedSpotData.filter(({ data }) => data.windLive).length;
  const allWindLive = windLiveCount === profiles.length;
  const spotScaleWindCount = regionalForecastResult.value.spotWinds.size;
  const mopLiveCount = mopBySpot.size;
  const mopSpectralCount = [...mopBySpot.values()].filter((value) => value.spectral_components?.some((components) => components.length > 1)).length;
  const completeWaveCoverage = mopLiveCount === profiles.length || regionalMarineLiveCount === zones.length;
  const completeCurrentCoverage = conditions.length === profiles.length;
  const completeCurrentWindCoverage = completeCurrentCoverage && conditions.every((condition) => condition.wind !== "Forecast unavailable");
  const coreForecastLive = completeWaveCoverage && completeCurrentCoverage && allWindLive && completeCurrentWindCoverage && laJollaTideResult.ok && sanDiegoTideResult.ok;
  const generatedAt = new Date().toISOString();
  const mopValidThrough = [...mopBySpot.values()].map((value) => (value as HourlyData & { dataTimestamp?: string }).dataTimestamp).filter((value): value is string => Boolean(value)).sort()[0];
  const minimumValidThrough = (values: Array<string | undefined>) => values.filter((value): value is string => Boolean(value)).sort()[0];
  const marineValidThrough = minimumValidThrough([...zoneData.values()].filter((data) => data.regionalLive)
    .map((data) => localForecastTimeToIso(data.marine.time.at(-1))));
  const windValidThrough = minimumValidThrough(resolvedSpotData.filter(({ data }) => data.windLive)
    .map(({ data }) => localForecastTimeToIso(data.weather.time.at(-1))));
  const tideValidThrough = localForecastTimeToIso([laJollaTides.at(-1)?.t, sanDiegoTides.at(-1)?.t].filter((value): value is string => Boolean(value)).sort()[0]);
  const centralData = dataForProfile(profiles.find((profile) => profile.name === "Blacks")!);
  const centralWindAdjusted = Boolean(windObservationResult.value && centralData?.windLive
    && windCorrectionIndex(centralData.weather, windObservationResult.value, "Central") >= 0);
  const regionalSecondaryCount = [...zoneData.values()].filter((data) => data.regionalLive
    && data.marine.secondary_swell_wave_height?.some((height, index) => coherentComponent(height, data.marine.secondary_swell_wave_direction?.[index], data.marine.secondary_swell_wave_period?.[index], "short") != null)).length;
  const providers: Record<string, ProviderStatus> = {
    mop: { ok: mopLiveCount === profiles.length, detail: `${mopLiveCount}/${profiles.length} break-adjacent CDIP model points live; ${mopSpectralCount} include forecast spectral partitions`, checkedAt: generatedAt, validThrough: mopValidThrough },
    cdip: { ok: cdipResult.ok, detail: cdipResult.ok ? `${cdipResult.value.length} fresh San Diego-area buoy observations` : "Nearshore observation feed unavailable", checkedAt: generatedAt, dataTimestamp: cdipResult.value[0]?.observedAt },
    spectra: { ok: mopSpectralCount > 0, detail: `${mopSpectralCount}/${mopLiveCount || profiles.length} live MOP points include long-, mid-, and short-period forecast energy${spectrumResult.ok ? "; Torrey Pines Outer spectrum is available for monitoring only" : ""}`, checkedAt: generatedAt, dataTimestamp: spectrumResult.value?.observedAt },
    marine: { ok: regionalMarineLiveCount === 3, detail: `${regionalMarineLiveCount}/3 regional forecast zones have complete five-day wave coverage; ${regionalSecondaryCount}/${regionalMarineLiveCount || 3} include coherent secondary-swell components${regionalMarineLiveCount === 3 ? "" : `; CDIP nearshore forecasts cover ${liveZones}/3 zones`}`, checkedAt: generatedAt, validThrough: marineValidThrough },
    wind: { ok: allWindLive && completeCurrentWindCoverage, detail: `${windLiveCount}/${profiles.length} break forecasts have wind · ${spotScaleWindCount}/${profiles.length} use spot-scale Open-Meteo guidance · ${zones.map((zone) => `${zone}: ${zoneData.get(zone)?.windSource ?? "Unavailable"}`).join("; ")}; remaining healthy breaks use isolated zone or NWS fallback${allWindLive && completeCurrentWindCoverage ? "" : "; missing wind is shown as unavailable, never fabricated"}`, checkedAt: generatedAt, validThrough: windValidThrough },
    windObservation: { ok: centralWindAdjusted, detail: centralWindAdjusted ? "La Jolla observation adjusts Central County wind only, with time decay" : "Using uncorrected forecast wind", checkedAt: generatedAt, dataTimestamp: windObservationResult.value?.observedAt },
    tides: { ok: laJollaTideResult.ok && sanDiegoTideResult.ok, detail: `${Number(laJollaTideResult.ok) + Number(sanDiegoTideResult.ok)}/2 stations have complete five-day coverage; unbracketed hours are unavailable`, checkedAt: generatedAt, validThrough: tideValidThrough },
    buoy: { ok: buoyResult.ok, detail: buoyResult.ok ? "NDBC 46225 fallback observation live" : "CDIP observations are primary", checkedAt: generatedAt, dataTimestamp: buoyResult.value?.observedAt },
  };
  // Declared rather than inferred so the cache layer's payload contract is
  // enforced here instead of relying on this ternary being widened correctly.
  const mode: ForecastMode = coreForecastLive ? "live" : conditions.length > 0 ? "partial" : "unavailable";
  return {
    mode,
    generatedAt,
    buoy: buoyResult.value,
    conditions,
    dailyConditions,
    zones: series,
    liveZones: [...zoneData.keys()],
    providers,
    sources: [
      { name: "CDIP MOP", role: "Break-adjacent nearshore wave forecasts" },
      { name: "CDIP observations", role: "Regional buoy agreement checks, water temperature, and source monitoring" },
      { name: "Open-Meteo", role: "Regional waves, secondary swell, and spot-scale wind forecast" },
      { name: "National Weather Service", role: "Independent hourly wind fallback when Open-Meteo is rate-limited" },
      { name: "NOAA CO-OPS", role: "Tide predictions and coastal wind observations" },
      { name: "NDBC 46225", role: "Fallback offshore observation" },
    ],
  };
}

const respondWithForecastCache = createForecastCache();

export async function GET() {
  return respondWithForecastCache(buildPayload);
}
