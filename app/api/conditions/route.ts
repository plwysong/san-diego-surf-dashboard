type Zone = "North County" | "Central" | "South Bay";
type Rating = "Excellent" | "Good" | "Fair" | "Poor";

type Profile = {
  name: string;
  zone: Zone;
  swellTarget: number;
  shoal: number;
  tideLow: number;
  tideHigh: number;
  mopId: string;
  shoreNormal: number;
};

type HourlyData = {
  time: string[];
  wave_height?: Array<number | null>;
  wave_direction?: Array<number | null>;
  wave_period?: Array<number | null>;
  swell_wave_height?: Array<number | null>;
  swell_wave_direction?: Array<number | null>;
  swell_wave_period?: Array<number | null>;
  secondary_swell_wave_height?: Array<number | null>;
  secondary_swell_wave_direction?: Array<number | null>;
  secondary_swell_wave_period?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
};

type ForecastResponse = { hourly?: HourlyData; error?: boolean; reason?: string };
type TidePrediction = { t: string; v: string; type?: string };
type ProviderStatus = { ok: boolean; detail: string; checkedAt: string; dataTimestamp?: string; validThrough?: string };
type CdipObservation = { observedAt: string; station: string; name: string; lat: number; lon: number; depthM: number; waveHeightM: number; period: number; direction: number | null; waterC: number | null };
type SpectrumComponent = { period: number; direction: number; heightM: number; energy: number };
type CdipSpectrum = { observedAt: string; station: string; components: SpectrumComponent[] };
type CoastalWind = { observedAt: string; station: string; speed: number; direction: number };
type Confidence = { label: "High" | "Medium" | "Low"; score: number; reason: string };

const profiles: Profile[] = [
  { name: "Trestles", zone: "North County", swellTarget: 190, shoal: 1.12, tideLow: 1.0, tideHigh: 3.6, mopId: "D1207", shoreNormal: 209.49 },
  { name: "Oceanside", zone: "North County", swellTarget: 225, shoal: 1.02, tideLow: 1.3, tideHigh: 4.0, mopId: "D0903", shoreNormal: 231.02 },
  { name: "Tamarack", zone: "North County", swellTarget: 245, shoal: 1.02, tideLow: 1.1, tideHigh: 4.0, mopId: "D0845", shoreNormal: 238.01 },
  { name: "Ponto", zone: "North County", swellTarget: 245, shoal: 1.08, tideLow: 1.3, tideHigh: 4.2, mopId: "D0775", shoreNormal: 248.53 },
  { name: "Grandview", zone: "North County", swellTarget: 230, shoal: .95, tideLow: 1.5, tideHigh: 4.5, mopId: "D0757", shoreNormal: 256.52 },
  { name: "Swami’s", zone: "North County", swellTarget: 225, shoal: 1.08, tideLow: 1.8, tideHigh: 4.4, mopId: "D0708", shoreNormal: 219.51 },
  { name: "Cardiff Reef", zone: "North County", swellTarget: 225, shoal: 1.1, tideLow: 2.0, tideHigh: 4.8, mopId: "D0680", shoreNormal: 252.55 },
  { name: "Del Mar", zone: "North County", swellTarget: 255, shoal: .95, tideLow: 1.0, tideHigh: 4.0, mopId: "D0620", shoreNormal: 264.49 },
  { name: "Blacks", zone: "Central", swellTarget: 275, shoal: 1.32, tideLow: 1.5, tideHigh: 4.0, mopId: "D0537", shoreNormal: 270 },
  { name: "La Jolla Shores", zone: "Central", swellTarget: 270, shoal: .65, tideLow: 1.4, tideHigh: 4.4, mopId: "D0500", shoreNormal: 299.45 },
  { name: "Windansea", zone: "Central", swellTarget: 260, shoal: 1.02, tideLow: 1.8, tideHigh: 4.5, mopId: "D0457", shoreNormal: 267.47 },
  { name: "Tourmaline", zone: "Central", swellTarget: 275, shoal: .72, tideLow: 2.0, tideHigh: 4.8, mopId: "D0416", shoreNormal: 226.29 },
  { name: "Crystal Pier", zone: "Central", swellTarget: 270, shoal: .82, tideLow: 1.2, tideHigh: 4.0, mopId: "D0406", shoreNormal: 250.84 },
  { name: "Ocean Beach", zone: "Central", swellTarget: 250, shoal: .98, tideLow: 1.2, tideHigh: 4.0, mopId: "D0348", shoreNormal: 296.97 },
  { name: "Sunset Cliffs", zone: "Central", swellTarget: 255, shoal: 1.08, tideLow: 2.0, tideHigh: 4.8, mopId: "D0318", shoreNormal: 267 },
  { name: "Coronado", zone: "South Bay", swellTarget: 225, shoal: .62, tideLow: 1.0, tideHigh: 3.8, mopId: "D0178", shoreNormal: 221.17 },
  { name: "Imperial Beach", zone: "South Bay", swellTarget: 220, shoal: .88, tideLow: 1.2, tideHigh: 4.0, mopId: "D0053", shoreNormal: 267.47 },
];

const spotCoordinates: Record<string, [number, number]> = {
  Trestles: [33.3833, -117.5937], Oceanside: [33.1937, -117.3831], Tamarack: [33.1477, -117.3508], Ponto: [33.0916, -117.3160],
  Grandview: [33.0774, -117.3086], "Swami’s": [33.0344, -117.2926], "Cardiff Reef": [33.0134, -117.2850], "Del Mar": [32.9595, -117.2686],
  Blacks: [32.8875, -117.2533], "La Jolla Shores": [32.8570, -117.2571], Windansea: [32.8313, -117.2818], Tourmaline: [32.8057, -117.2610],
  "Crystal Pier": [32.7976, -117.2574], "Ocean Beach": [32.7495, -117.2526], "Sunset Cliffs": [32.7202, -117.2572], Coronado: [32.6800, -117.1835], "Imperial Beach": [32.5791, -117.1324],
};

const zonePoints: Record<Zone, { lat: number; lon: number; tideStation: string }> = {
  "North County": { lat: 33.16, lon: -117.39, tideStation: "9410230" },
  Central: { lat: 32.89, lon: -117.30, tideStation: "9410230" },
  "South Bay": { lat: 32.63, lon: -117.22, tideStation: "9410170" },
};

const zoneLeadSpot: Record<Zone, string> = {
  "North County": "Swami’s",
  Central: "Blacks",
  "South Bay": "Coronado",
};

type ZoneForecast = { marine: HourlyData; weather: HourlyData; windLive: boolean; regionalLive: boolean };
type CacheState = "origin" | "fresh-cache" | "stale-cache";
type CacheMeta = { state: CacheState; storedAt: string; ageSeconds: number; refreshError?: string };
type CacheRow = { payload: string | null; fetched_at: number; fresh_until: number; stale_until: number; refresh_lock_until: number; last_error: string | null };
type D1ResultLike = { meta?: { changes?: number }; results?: unknown[] };
type D1StatementLike = { bind(...values: unknown[]): D1StatementLike; run(): Promise<D1ResultLike>; first<T>(): Promise<T | null> };
type D1DatabaseLike = { prepare(query: string): D1StatementLike };

const CACHE_KEY = "san-diego-conditions-v3";
const FRESH_TTL_MS = 60 * 60 * 1000;
const STALE_TTL_MS = 36 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 45 * 1000;

let cached: { freshUntil: number; staleUntil: number; storedAt: number; payload: Record<string, unknown> } | undefined;
let negativeCache: { expires: number; payload: unknown } | undefined;
let inFlight: ReturnType<typeof buildPayload> | undefined;

const n = (value: number | null | undefined, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

async function durableCacheDb(): Promise<D1DatabaseLike | null> {
  const injected = (globalThis as typeof globalThis & { __FORECAST_CACHE_DB__?: D1DatabaseLike }).__FORECAST_CACHE_DB__;
  if (injected) return injected;
  try {
    const worker = await import("cloudflare:workers");
    return (worker.env as unknown as { DB?: D1DatabaseLike }).DB ?? null;
  } catch {
    return null;
  }
}

async function initializeCache(db: D1DatabaseLike) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS forecast_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT,
    fetched_at INTEGER NOT NULL DEFAULT 0,
    fresh_until INTEGER NOT NULL DEFAULT 0,
    stale_until INTEGER NOT NULL DEFAULT 0,
    refresh_lock_until INTEGER NOT NULL DEFAULT 0,
    last_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
  )`).run();
  await db.prepare("INSERT OR IGNORE INTO forecast_cache (cache_key) VALUES (?)").bind(CACHE_KEY).run();
}

async function readDurableCache(db: D1DatabaseLike) {
  return db.prepare("SELECT payload, fetched_at, fresh_until, stale_until, refresh_lock_until, last_error FROM forecast_cache WHERE cache_key = ?")
    .bind(CACHE_KEY).first<CacheRow>();
}

function parseCachedPayload(row: CacheRow | null): Record<string, unknown> | null {
  if (!row?.payload) return null;
  try {
    const value = JSON.parse(row.payload);
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function cacheMeta(state: CacheState, storedAt: number, refreshError?: string): CacheMeta {
  return {
    state,
    storedAt: new Date(storedAt).toISOString(),
    ageSeconds: Math.max(0, Math.round((Date.now() - storedAt) / 1000)),
    ...(refreshError ? { refreshError } : {}),
  };
}

function payloadWithCache(payload: Record<string, unknown>, state: CacheState, storedAt: number, refreshError?: string) {
  return { ...payload, cache: cacheMeta(state, storedAt, refreshError) };
}

async function claimRefreshLease(db: D1DatabaseLike, now: number) {
  const result = await db.prepare("UPDATE forecast_cache SET refresh_lock_until = ?, last_attempt_at = ? WHERE cache_key = ? AND refresh_lock_until < ?")
    .bind(now + REFRESH_LEASE_MS, now, CACHE_KEY, now).run();
  return Number(result.meta?.changes ?? 0) > 0;
}

async function storeDurablePayload(db: D1DatabaseLike, payload: Record<string, unknown>, now: number) {
  await db.prepare("UPDATE forecast_cache SET payload = ?, fetched_at = ?, fresh_until = ?, stale_until = ?, refresh_lock_until = 0, last_error = NULL WHERE cache_key = ?")
    .bind(JSON.stringify(payload), now, now + FRESH_TTL_MS, now + STALE_TTL_MS, CACHE_KEY).run();
}

async function releaseRefreshLease(db: D1DatabaseLike, message: string) {
  await db.prepare("UPDATE forecast_cache SET refresh_lock_until = 0, last_error = ? WHERE cache_key = ?")
    .bind(message.slice(0, 240), CACHE_KEY).run();
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const hasNumericValues = (values: Array<number | null> | undefined, minimumLength: number) =>
  Boolean(values && values.length >= minimumLength && values.some((value) => typeof value === "number" && Number.isFinite(value)));

function hasUsableMarineForecast(hourly: HourlyData) {
  const length = hourly.time?.length ?? 0;
  if (length < 24) return false;
  const hasHeight = hasNumericValues(hourly.swell_wave_height, length) || hasNumericValues(hourly.wave_height, length);
  const hasDirection = hasNumericValues(hourly.swell_wave_direction, length) || hasNumericValues(hourly.wave_direction, length);
  const hasPeriod = hasNumericValues(hourly.swell_wave_period, length) || hasNumericValues(hourly.wave_period, length);
  return hasHeight && hasDirection && hasPeriod;
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
  const minimumCoverage = Math.min(24, marineTimes.length);
  const usable = windSpeed.slice(0, minimumCoverage).filter((value) => typeof value === "number" && Number.isFinite(value)).length >= minimumCoverage * .8
    && windDirection.slice(0, minimumCoverage).filter((value) => typeof value === "number" && Number.isFinite(value)).length >= minimumCoverage * .8;
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
  const key = localNowKey();
  const exact = times.indexOf(key);
  if (exact >= 0) return exact;
  const later = times.findIndex((time) => time > key);
  return later >= 0 ? later : 0;
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

function angularDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function cardinal(degrees: number) {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(((degrees % 360) / 22.5)) % 16];
}

function spotHeight(profile: Profile, offshoreMeters: number, swellDirection: number, nearshore = false) {
  const exposure = nearshore ? 1 : .42 + .58 * Math.max(0, Math.cos(angularDifference(swellDirection, profile.swellTarget) * Math.PI / 180));
  const faceFeet = Math.max(0, offshoreMeters * 3.28084 * profile.shoal * exposure);
  const low = Math.max(0, Math.round(faceFeet * .78));
  const high = Math.max(low + 1, Math.round(faceFeet * 1.22));
  return { low, high, label: `${low}–${high} ft` };
}

function scoreConditions(profile: Profile, period: number, windSpeed: number, windDirection: number, tide: number, faceFeet: number) {
  let score = 38;
  score += Math.min(24, Math.max(0, (period - 7) * 3));
  // Meteorological direction is where wind comes from. Project it onto the
  // seaward normal so direction matters less as wind speed approaches zero.
  const onshoreComponent = windSpeed * Math.cos(angularDifference(windDirection, profile.shoreNormal) * Math.PI / 180);
  score += Math.max(-18, Math.min(24, 12 - onshoreComponent * 2.3 - windSpeed * .8));
  score += tide >= profile.tideLow && tide <= profile.tideHigh ? 10 : -4;
  score += faceFeet >= 2 && faceFeet <= 8 ? 6 : faceFeet > 10 ? -5 : 0;
  return Math.max(18, Math.min(98, Math.round(score)));
}

function rating(score: number): Rating {
  if (score >= 86) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

function formatHour(time: string) {
  const hour = Number(time.slice(11, 13));
  const normalized = hour % 12 || 12;
  return `${normalized} ${hour >= 12 ? "PM" : "AM"}`;
}

function surfableIndexes(times: string[], start: number, count: number) {
  const startDate = times[start]?.slice(0, 10);
  const startHour = Number(times[start]?.slice(11, 13));
  return Array.from({ length: Math.min(36, times.length - start) }, (_, offset) => start + offset)
    .filter((index) => {
      const hour = Number(times[index]?.slice(11, 13));
      const rollsPastToday = startHour >= 19 && times[index]?.slice(0, 10) === startDate;
      return hour >= 5 && hour <= 19 && !rollsPastToday;
    }).slice(0, count);
}

function bestWindow(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], start: number, mop?: HourlyData) {
  const candidates = surfableIndexes(marine.time, start, 12);
  if (!candidates.length) return { label: "No daylight window", score: 0 };
  const scores = candidates.map((index) => {
    const wave = waveAt(marine, index, mop);
    const wind = n(weather.wind_speed_10m?.[index], 8);
    const windDirection = n(weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, wave.height, wave.direction, wave.nearshore);
    return scoreConditions(profile, wave.period, wind, windDirection, tide, (face.low + face.high) / 2);
  });
  let bestOffset = 0;
  let bestAverage = -1;
  for (let i = 0; i < Math.max(1, scores.length - 2); i++) {
    if (candidates[i + 2] != null && pseudoLocalMs(marine.time[candidates[i + 2]]) - pseudoLocalMs(marine.time[candidates[i]]) > 2.1 * 60 * 60 * 1000) continue;
    const slice = scores.slice(i, i + 3);
    const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    if (average > bestAverage) { bestAverage = average; bestOffset = i; }
  }
  const startTime = marine.time[candidates[bestOffset] ?? start];
  const endTime = marine.time[Math.min((candidates[bestOffset] ?? start) + 3, marine.time.length - 1)];
  return { label: `${formatHour(startTime)}–${formatHour(endTime)}`, score: Math.round(bestAverage) };
}

function buildSpotHourly(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], start: number, mop?: HourlyData) {
  return surfableIndexes(marine.time, start, 7).map((index) => {
    const wave = waveAt(marine, index, mop);
    const wind = n(weather.wind_speed_10m?.[index], 8);
    const windDirection = n(weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, wave.height, wave.direction, wave.nearshore);
    return {
      time: formatHour(marine.time[index]),
      height: (face.low + face.high) / 2,
      wind: Math.round(wind),
      score: scoreConditions(profile, wave.period, wind, windDirection, tide, (face.low + face.high) / 2),
    };
  });
}

function closestTide(predictions: TidePrediction[], time: string) {
  if (!predictions.length) return { value: 2.5, trend: "rising" };
  const normalized = time.replace("T", " ").slice(0, 16);
  let index = predictions.findIndex((prediction) => prediction.t >= normalized);
  if (index < 0) index = predictions.length - 1;
  const value = Number(predictions[index]?.v ?? 2.5);
  const next = Number(predictions[Math.min(index + 1, predictions.length - 1)]?.v ?? value);
  return { value, trend: next >= value ? "rising" : "falling" };
}

async function fetchJson<T>(provider: string, url: string): Promise<T> {
  let response: Response;
  try {
    // Cloudflare's runtime owns restricted headers such as User-Agent. Let it set
    // them instead of turning an otherwise healthy upstream request into a failure.
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    console.error(`[conditions] ${provider} fetch failed: ${detail}`);
    throw new Error(`${provider}: ${detail}`);
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 160).replace(/\s+/g, " ");
    console.error(`[conditions] ${provider} returned ${response.status}: ${detail}`);
    throw new Error(`${provider}: HTTP ${response.status}`);
  }

  try {
    return await response.json() as T;
  } catch {
    console.error(`[conditions] ${provider} returned invalid JSON`);
    throw new Error(`${provider}: invalid response`);
  }
}

async function fetchText(provider: string, url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "network request failed";
    console.error(`[conditions] ${provider} fetch failed: ${detail}`);
    throw new Error(`${provider}: ${detail}`);
  }
  if (!response.ok) throw new Error(`${provider}: HTTP ${response.status}`);
  return response.text();
}

function parseCsvRows(text: string) {
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(","));
}

function isFresh(date: Date, maxAgeMs: number, futureToleranceMs = 15 * 60 * 1000) {
  const age = Date.now() - date.getTime();
  return Number.isFinite(date.getTime()) && age >= -futureToleranceMs && age <= maxAgeMs;
}

function inRange(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

async function settledMapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      try {
        results[index] = { status: "fulfilled", value: await task(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }));
  return results;
}

async function fetchMopForecast(profile: Profile) {
  const url = new URL(`https://thredds.cdip.ucsd.edu/thredds/ncss/point/cdip/model/MOP_alongshore/${profile.mopId}_forecast.nc`);
  ["waveHs", "waveTp", "waveDp"].forEach((variable) => url.searchParams.append("var", variable));
  const start = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);
  url.searchParams.set("time_start", start.toISOString());
  url.searchParams.set("time_end", end.toISOString());
  url.searchParams.set("accept", "csv");
  const text = await fetchText(`CDIP MOP ${profile.mopId}`, url.toString());
  const rows = parseCsvRows(text);
  const header = rows[0]?.map((column) => column.replace(/\s*\[.*$/, "")) ?? [];
  const column = (name: string) => header.indexOf(name);
  const timeColumn = column("time");
  const heightColumn = column("waveHs");
  const periodColumn = column("waveTp");
  const directionColumn = column("waveDp");
  if (rows.length < 9 || [timeColumn, heightColumn, periodColumn, directionColumn].some((index) => index < 0)) throw new Error(`CDIP MOP ${profile.mopId}: empty or changed schema`);
  const values = rows.slice(1).map((row) => ({
    sourceTime: row[timeColumn],
    time: localKeyFromUtc(row[timeColumn]),
    height: Number(row[heightColumn]),
    period: Number(row[periodColumn]),
    direction: Number(row[directionColumn]),
  })).filter((row) => row.time && inRange(row.height, 0, 20) && inRange(row.period, 2, 35) && inRange(row.direction, 0, 360));
  if (values.length < 8) throw new Error(`CDIP MOP ${profile.mopId}: invalid forecast`);
  const nowKey = localNowKey();
  if (nearestTimeIndex(values.map((row) => row.time), nowKey, 3) < 0 || pseudoLocalMs(values.at(-1)!.time) - pseudoLocalMs(nowKey) < 4 * 24 * 60 * 60 * 1000) {
    throw new Error(`CDIP MOP ${profile.mopId}: insufficient current or forward coverage`);
  }
  return {
    time: values.map((row) => row.time),
    wave_height: values.map((row) => row.height),
    wave_period: values.map((row) => row.period),
    wave_direction: values.map((row) => row.direction),
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

function waveAt(marine: HourlyData, index: number, mop?: HourlyData) {
  const mopIndex = nearestTimeIndex(mop?.time, marine.time[index], 2);
  const nearshore = mopIndex >= 0;
  const height = nearshore ? n(mop?.wave_height?.[mopIndex], 1) : n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1));
  const direction = nearshore ? n(mop?.wave_direction?.[mopIndex], 260) : n(marine.swell_wave_direction?.[index], n(marine.wave_direction?.[index], 260));
  const period = nearshore ? n(mop?.wave_period?.[mopIndex], 10) : n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10));
  return { height, direction, period, nearshore };
}

function blendDirection(model: number, observed: number, weight: number) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const x = (1 - weight) * Math.cos(radians(model)) + weight * Math.cos(radians(observed));
  const y = (1 - weight) * Math.sin(radians(model)) + weight * Math.sin(radians(observed));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function correctWindForecast(weather: HourlyData, observation: CoastalWind, zone: Zone) {
  // La Jolla is a Central County station; do not imply county-wide correction.
  if (zone !== "Central") return weather;
  const observedKey = localKeyFromUtc(observation.observedAt);
  const observedIndex = nearestTimeIndex(weather.time, observedKey, 2);
  if (observedIndex < 0) return weather;
  const modeledObservedSpeed = n(weather.wind_speed_10m?.[observedIndex], observation.speed);
  const modeledObservedDirection = n(weather.wind_direction_10m?.[observedIndex], observation.direction);
  const ageHours = Math.max(0, (Date.now() - Date.parse(observation.observedAt)) / 3_600_000);
  const ageWeight = Math.exp(-ageHours / 3);
  return {
    ...weather,
    wind_speed_10m: weather.time.map((time, index) => {
      const modeled = n(weather.wind_speed_10m?.[index], modeledObservedSpeed);
      const lead = Math.max(0, (pseudoLocalMs(time) - pseudoLocalMs(observedKey)) / 3_600_000);
      const weight = ageWeight * Math.exp(-lead / 18);
      return Math.max(0, modeled + (observation.speed - modeledObservedSpeed) * weight);
    }),
    wind_direction_10m: weather.time.map((time, index) => {
      const modeled = n(weather.wind_direction_10m?.[index], modeledObservedDirection);
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

function secondarySwellAt(marine: HourlyData, index: number, spectrum?: CdipSpectrum) {
  const component = spectrum?.components?.[1];
  if (component) return `${cardinal(component.direction)} · ${Math.round(component.period)}s`;
  const height = marine.secondary_swell_wave_height?.[index];
  const direction = marine.secondary_swell_wave_direction?.[index];
  const period = marine.secondary_swell_wave_period?.[index];
  if (![height, direction, period].every((value) => typeof value === "number" && Number.isFinite(value)) || n(height) < .08) return "No distinct secondary";
  return `${cardinal(n(direction))} · ${Math.round(n(period))}s`;
}

function forecastConfidence({ nearshore, observation, windObserved, tidesLive, windLive, horizonHours, offshoreHeight, nearshoreHeight, modelPeriod, modelDirection }: {
  nearshore: boolean;
  observation: { item: CdipObservation; distance: number } | null;
  windObserved: boolean;
  tidesLive: boolean;
  windLive: boolean;
  horizonHours: number;
  offshoreHeight: number;
  nearshoreHeight: number;
  modelPeriod: number;
  modelDirection: number;
}): Confidence {
  let score = 32;
  const reasons: string[] = [];
  if (nearshore) { score += 27; reasons.push("CDIP nearshore model"); }
  const evidenceWeight = Math.exp(-Math.max(0, horizonHours) / 18);
  if (observation && observation.distance <= 35) {
    const heightResidual = Math.abs(observation.item.waveHeightM - offshoreHeight) / Math.max(.25, offshoreHeight);
    const periodResidual = Math.abs(observation.item.period - modelPeriod);
    const directionResidual = observation.item.direction == null ? 0 : angularDifference(observation.item.direction, modelDirection);
    const agrees = heightResidual <= .4 && periodResidual <= 4 && directionResidual <= 55;
    score += (agrees ? 10 : -8) * evidenceWeight;
    reasons.push(agrees ? "regional buoy broadly agrees" : "regional buoy differs");
  }
  if (windObserved && evidenceWeight >= .2) { score += 8 * evidenceWeight; reasons.push("La Jolla wind adjusted"); }
  if (tidesLive) score += 8;
  if (windLive) score += 6;
  if (nearshore && offshoreHeight > 0) {
    const ratio = Math.abs(nearshoreHeight - offshoreHeight) / offshoreHeight;
    score += ratio <= .35 ? 7 : ratio <= .7 ? 2 : -7;
  }
  score -= Math.min(42, Math.max(0, horizonHours) / 24 * 8);
  const horizonCap = horizonHours > 72 ? 55 : horizonHours > 36 ? 77 : 96;
  const rounded = Math.max(24, Math.min(horizonCap, Math.round(score)));
  return { label: rounded >= 78 ? "High" : rounded >= 56 ? "Medium" : "Low", score: rounded, reason: reasons.slice(0, 3).join(" · ") || "regional model estimate" };
}

function conditionSummary(profile: Profile, period: number, windSpeed: number, windDirection: number, tide: number) {
  const periodLabel = period >= 14 ? "Long-period" : period >= 10 ? "Mid-period" : "Short-period";
  const windDifference = angularDifference(windDirection, (profile.shoreNormal + 180) % 360);
  const windLabel = windDifference <= 55 && windSpeed <= 10 ? "clean offshore wind" : windSpeed <= 5 ? "light wind" : windDifference > 110 ? "onshore wind" : "cross-shore wind";
  const tideLabel = tide >= profile.tideLow && tide <= profile.tideHigh ? "tide in range" : "tide outside ideal range";
  return `${periodLabel} swell · ${windLabel} · ${tideLabel}`;
}

async function fetchZones() {
  const zones = Object.keys(zonePoints) as Zone[];
  const points = zones.map((zone) => zonePoints[zone]);
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude", points.map((point) => point.lat).join(","));
  marineUrl.searchParams.set("longitude", points.map((point) => point.lon).join(","));
  marineUrl.searchParams.set("hourly", "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period,secondary_swell_wave_height,secondary_swell_wave_direction,secondary_swell_wave_period");
  marineUrl.searchParams.set("timezone", zones.map(() => "America/Los_Angeles").join(","));
  marineUrl.searchParams.set("forecast_days", "6");
  marineUrl.searchParams.set("cell_selection", "sea");

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", points.map((point) => point.lat).join(","));
  weatherUrl.searchParams.set("longitude", points.map((point) => point.lon).join(","));
  weatherUrl.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  weatherUrl.searchParams.set("wind_speed_unit", "kn");
  weatherUrl.searchParams.set("timezone", zones.map(() => "America/Los_Angeles").join(","));
  weatherUrl.searchParams.set("forecast_days", "6");

  const [marineResult, weatherResult] = await Promise.allSettled([
    fetchJson<ForecastResponse[]>("Open-Meteo marine (3-zone batch)", marineUrl.toString()),
    fetchJson<ForecastResponse[]>("Open-Meteo wind (3-zone batch)", weatherUrl.toString()),
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
    });
  });
  return forecasts;
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
  const predictions = (data.predictions ?? []).filter((prediction) => prediction.t && Number.isFinite(Number(prediction.v)));
  if (!predictions.length) throw new Error(`NOAA tides ${station}: empty predictions`);
  return predictions;
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
  const observation = {
    observedAt: observedAt.toISOString(),
    waveHeightM: parse(8),
    dominantPeriod: parse(9),
    meanDirection: parse(11),
    waterC: parse(14),
  };
  if (observation.waveHeightM == null || observation.dominantPeriod == null || observation.meanDirection == null) {
    throw new Error("NDBC observation is incomplete");
  }
  return observation;
}

function buildZoneSeries(zone: Zone, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], mop?: HourlyData) {
  const profile = profiles.find((item) => item.name === zoneLeadSpot[zone])!;
  const start = currentIndex(marine.time);
  const hourly = buildSpotHourly(profile, marine, weather, tides, start, mop);

  const today = marine.time[start]?.slice(0, 10);
  const uniqueDates = [...new Set(marine.time.slice(start).map((time) => time.slice(0, 10)))].slice(0, 5);
  const days = uniqueDates.map((date) => {
    const indexes = marine.time.map((time, index) => time.startsWith(date) ? index : -1).filter((index) => index >= start);
    const midday = indexes[Math.min(12, indexes.length - 1)] ?? start;
    const dailyWaves = indexes.map((index) => waveAt(marine, index, mop));
    const highestWave = dailyWaves.reduce((best, wave) => wave.height > best.height ? wave : best, dailyWaves[0]);
    const direction = waveAt(marine, midday, mop).direction;
    const period = Math.max(...dailyWaves.map((wave) => wave.period));
    const face = spotHeight(profile, highestWave.height, direction, highestWave.nearshore);
    const bestScore = Math.max(...indexes.map((index) => {
      const wind = n(weather.wind_speed_10m?.[index], 8);
      const windDirection = n(weather.wind_direction_10m?.[index], 270);
      const tide = closestTide(tides, marine.time[index]).value;
      const hourWave = waveAt(marine, index, mop);
      const hourFace = spotHeight(profile, hourWave.height, hourWave.direction, hourWave.nearshore);
      return scoreConditions(profile, hourWave.period, wind, windDirection, tide, (hourFace.low + hourFace.high) / 2);
    }));
    const parsed = new Date(`${date}T12:00:00-07:00`);
    return {
      dateKey: date,
      day: date === today ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Los_Angeles" }).format(parsed),
      date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(parsed),
      height: face.label,
      rating: rating(bestScore),
      period: `${Math.round(period)}s`,
    };
  });
  return { hourly, days };
}

function buildDailySpot(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], date: string, waterF: number | null, context: {
  mop?: HourlyData;
  observation: { item: CdipObservation; distance: number } | null;
  spectrum?: CdipSpectrum;
  windObserved: boolean;
  tidesLive: boolean;
  windLive: boolean;
}) {
  const candidates = marine.time.map((time, index) => ({ time, index }))
    .filter(({ time }) => time.startsWith(date) && Number(time.slice(11, 13)) >= 5 && Number(time.slice(11, 13)) <= 19)
    .map(({ index }) => index);
  if (!candidates.length) return null;

  const scoreAt = (index: number) => {
    const wave = waveAt(marine, index, context.mop);
    const wind = n(weather.wind_speed_10m?.[index], 8);
    const windDirection = n(weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, wave.height, wave.direction, wave.nearshore);
    return scoreConditions(profile, wave.period, wind, windDirection, tide, (face.low + face.high) / 2);
  };

  const scores = candidates.map(scoreAt);
  let bestOffset = 0;
  let bestAverage = -1;
  for (let offset = 0; offset < Math.max(1, candidates.length - 2); offset++) {
    const slice = scores.slice(offset, offset + 3);
    const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    if (average > bestAverage) { bestAverage = average; bestOffset = offset; }
  }
  const index = candidates[Math.min(bestOffset + 1, candidates.length - 1)];
  const wave = waveAt(marine, index, context.mop);
  const windSpeed = n(weather.wind_speed_10m?.[index], 8);
  const windDirection = n(weather.wind_direction_10m?.[index], 270);
  const tide = closestTide(tides, marine.time[index]);
  const face = spotHeight(profile, wave.height, wave.direction, wave.nearshore);
  const endIndex = candidates[Math.min(bestOffset + 3, candidates.length - 1)];
  const chartIndexes = candidates.filter((_, position) => position % 2 === 0).slice(0, 7);
  const offshoreHeight = n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], wave.height));
  const horizonHours = Math.max(0, (pseudoLocalMs(marine.time[index]) - pseudoLocalMs(localNowKey())) / 3_600_000);
  const confidence = forecastConfidence({
    nearshore: wave.nearshore,
    observation: context.observation,
    windObserved: context.windObserved,
    tidesLive: context.tidesLive,
    windLive: context.windLive,
    horizonHours,
    offshoreHeight,
    nearshoreHeight: wave.height,
    modelPeriod: wave.period,
    modelDirection: wave.direction,
  });

  return {
    name: profile.name,
    height: face.label,
    rating: rating(Math.round(bestAverage)),
    score: Math.round(bestAverage),
    swell: cardinal(wave.direction),
    swellDegrees: Math.round(wave.direction),
    period: `${Math.round(wave.period)}s`,
    secondarySwell: secondarySwellAt(marine, index, context.spectrum),
    secondarySwellSource: "Regional forecast partition",
    wind: `${Math.round(windSpeed)} kt ${cardinal(windDirection)}`,
    tide: `${tide.value.toFixed(1)} ft ${tide.trend}`,
    water: waterF == null ? "—" : `${waterF}°`,
    best: `${formatHour(marine.time[candidates[bestOffset]])}–${formatHour(marine.time[endIndex])}`,
    confidence: confidence.label,
    confidenceScore: confidence.score,
    confidenceReason: confidence.reason,
    modelPoint: wave.nearshore ? profile.mopId : "Regional fallback",
    summary: conditionSummary(profile, wave.period, windSpeed, windDirection, tide.value),
    hourly: chartIndexes.map((hourIndex) => ({
      time: formatHour(marine.time[hourIndex]),
      height: (() => {
        const chartWave = waveAt(marine, hourIndex, context.mop);
        const chartFace = spotHeight(profile, chartWave.height, chartWave.direction, chartWave.nearshore);
        return (chartFace.low + chartFace.high) / 2;
      })(),
      wind: Math.round(n(weather.wind_speed_10m?.[hourIndex], 8)),
      score: scoreAt(hourIndex),
    })),
  };
}

async function buildPayload() {
  const zones = Object.keys(zonePoints) as Zone[];
  const [regionalForecastResult, laJollaTideResult, sanDiegoTideResult, buoyResult, cdipResult, spectrumResult, windObservationResult, mopResults] = await Promise.all([
    fetchZones().then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] Open-Meteo batch unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: new Map<Zone, ZoneForecast>() };
    }),
    fetchTides("9410230").then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: [] as TidePrediction[] })),
    fetchTides("9410170").then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: [] as TidePrediction[] })),
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
    settledMapWithConcurrency(profiles, 6, fetchMopForecast),
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
    const regional = regionalForecastResult.value.get(zone);
    if (regional) {
      zoneData.set(zone, windObservationResult.value && regional.windLive
        ? { ...regional, weather: correctWindForecast(regional.weather, windObservationResult.value, zone) }
        : regional);
      return;
    }
    const lead = profiles.find((profile) => profile.name === zoneLeadSpot[zone]);
    const mop = lead ? mopBySpot.get(lead.name) : undefined;
    if (mop?.time.length) {
      zoneData.set(zone, { marine: mop, weather: { time: mop.time }, windLive: false, regionalLive: false });
    }
  });
  const spectrumByZone = new Map<Zone, CdipSpectrum>();
  if (spectrumResult.value) {
    spectrumByZone.set("North County", spectrumResult.value);
    spectrumByZone.set("Central", spectrumResult.value);
  }

  const conditions = profiles.flatMap((profile) => {
    const data = zoneData.get(profile.zone);
    if (!data) return [];
    const tides = profile.zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const tidesLive = profile.zone === "South Bay" ? sanDiegoTideResult.ok : laJollaTideResult.ok;
    const index = currentIndex(data.marine.time);
    const mop = mopBySpot.get(profile.name);
    const wave = waveAt(data.marine, index, mop);
    const observation = nearestObservation(profile, cdipResult.value);
    const windSpeed = n(data.weather.wind_speed_10m?.[index], 8);
    const windDirection = n(data.weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, data.marine.time[index]);
    const face = spotHeight(profile, wave.height, wave.direction, wave.nearshore);
    const score = scoreConditions(profile, wave.period, windSpeed, windDirection, tide.value, (face.low + face.high) / 2);
    const window = bestWindow(profile, data.marine, data.weather, tides, index, mop);
    const waterC = observation?.item.waterC ?? buoyResult.value?.waterC ?? null;
    const waterF = waterC != null ? Math.round(waterC * 9 / 5 + 32) : null;
    const confidence = forecastConfidence({
      nearshore: wave.nearshore,
      observation,
      windObserved: windObservationResult.ok && data.windLive && profile.zone === "Central",
      tidesLive,
      windLive: data.windLive,
      horizonHours: 0,
      offshoreHeight: n(data.marine.swell_wave_height?.[index], n(data.marine.wave_height?.[index], wave.height)),
      nearshoreHeight: wave.height,
      modelPeriod: wave.period,
      modelDirection: wave.direction,
    });
    const observedSpectrum = spectrumByZone.get(profile.zone);
    return [{
      name: profile.name,
      height: face.label,
      rating: rating(score),
      currentScore: score,
      score: window.score,
      swell: cardinal(wave.direction),
      swellDegrees: Math.round(wave.direction),
      period: `${Math.round(wave.period)}s`,
      secondarySwell: secondarySwellAt(data.marine, index, observedSpectrum),
      secondarySwellSource: observedSpectrum?.components?.[1] ? "Torrey Pines Outer observed peak" : "Regional forecast partition",
      wind: `${Math.round(windSpeed)} kt ${cardinal(windDirection)}`,
      tide: `${tide.value.toFixed(1)} ft ${tide.trend}`,
      water: waterF == null ? "—" : `${waterF}°`,
      best: window.label,
      confidence: confidence.label,
      confidenceScore: confidence.score,
      confidenceReason: confidence.reason,
      modelPoint: wave.nearshore ? profile.mopId : "Regional fallback",
      summary: conditionSummary(profile, wave.period, windSpeed, windDirection, tide.value),
      hourly: buildSpotHourly(profile, data.marine, data.weather, tides, index, mop),
    }];
  });

  const series = Object.fromEntries(zones.flatMap((zone) => {
    const data = zoneData.get(zone);
    if (!data) return [];
    const tides = zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const lead = profiles.find((profile) => profile.name === zoneLeadSpot[zone]);
    return [[zone, buildZoneSeries(zone, data.marine, data.weather, tides, lead ? mopBySpot.get(lead.name) : undefined)]];
  }));

  const firstLiveZone = zones.find((zone) => zoneData.has(zone));
  const dailyDateKeys = firstLiveZone
    ? [...new Set(zoneData.get(firstLiveZone)!.marine.time.slice(currentIndex(zoneData.get(firstLiveZone)!.marine.time)).map((time) => time.slice(0, 10)))].slice(0, 5)
    : [];
  const dailyConditions = Object.fromEntries(dailyDateKeys.map((date) => [date, profiles.flatMap((profile) => {
    const data = zoneData.get(profile.zone);
    if (!data) return [];
    const tides = profile.zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const observation = nearestObservation(profile, cdipResult.value);
    const waterC = observation?.item.waterC ?? buoyResult.value?.waterC ?? null;
    const waterF = waterC != null ? Math.round(waterC * 9 / 5 + 32) : null;
    const forecast = buildDailySpot(profile, data.marine, data.weather, tides, date, waterF, {
      mop: mopBySpot.get(profile.name),
      observation,
      windObserved: windObservationResult.ok && data.windLive && profile.zone === "Central",
      tidesLive: profile.zone === "South Bay" ? sanDiegoTideResult.ok : laJollaTideResult.ok,
      windLive: data.windLive,
    });
    return forecast ? [forecast] : [];
  })]));

  const liveZones = zoneData.size;
  const regionalMarineLiveCount = [...zoneData.values()].filter((data) => data.regionalLive).length;
  const windLiveCount = [...zoneData.values()].filter((data) => data.windLive).length;
  const allWindLive = windLiveCount === zones.length;
  const mopLiveCount = mopBySpot.size;
  const allSupportingProvidersLive = laJollaTideResult.ok && sanDiegoTideResult.ok && cdipResult.ok && spectrumResult.ok && windObservationResult.ok && mopLiveCount === profiles.length;
  const generatedAt = new Date().toISOString();
  const mopValidThrough = [...mopBySpot.values()].map((value) => (value as HourlyData & { dataTimestamp?: string }).dataTimestamp).filter((value): value is string => Boolean(value)).sort()[0];
  const marineValidThrough = firstLiveZone ? localForecastTimeToIso(zoneData.get(firstLiveZone)?.marine.time.at(-1)) : undefined;
  const windValidThrough = firstLiveZone ? localForecastTimeToIso(zoneData.get(firstLiveZone)?.weather.time.at(-1)) : undefined;
  const tideValidThrough = localForecastTimeToIso([laJollaTides.at(-1)?.t, sanDiegoTides.at(-1)?.t].filter((value): value is string => Boolean(value)).sort()[0]);
  const centralWindAdjusted = Boolean(windObservationResult.ok && zoneData.get("Central")?.windLive);
  const providers: Record<string, ProviderStatus> = {
    mop: { ok: mopLiveCount === profiles.length, detail: `${mopLiveCount}/${profiles.length} break-adjacent CDIP model points live`, checkedAt: generatedAt, validThrough: mopValidThrough },
    cdip: { ok: cdipResult.ok, detail: cdipResult.ok ? `${cdipResult.value.length} fresh San Diego-area buoy observations` : "Nearshore observation feed unavailable", checkedAt: generatedAt, dataTimestamp: cdipResult.value[0]?.observedAt },
    spectra: { ok: spectrumResult.ok, detail: spectrumResult.ok ? "Torrey Pines Outer observed spectral peaks live; forecast partitions used for future days" : "Using regional forecast wave partitions", checkedAt: generatedAt, dataTimestamp: spectrumResult.value?.observedAt },
    marine: { ok: regionalMarineLiveCount === 3, detail: regionalMarineLiveCount === 3 ? "3/3 regional forecast zones live with secondary-swell components" : `${regionalMarineLiveCount}/3 regional zones live; CDIP nearshore forecasts cover ${liveZones}/3 zones`, checkedAt: generatedAt, validThrough: marineValidThrough },
    wind: { ok: allWindLive, detail: `${windLiveCount}/${zones.length} forecast zones live${allWindLive ? "" : "; conservative defaults used where unavailable"}`, checkedAt: generatedAt, validThrough: windValidThrough },
    windObservation: { ok: centralWindAdjusted, detail: centralWindAdjusted ? "La Jolla observation adjusts Central County wind only, with time decay" : "Using uncorrected forecast wind", checkedAt: generatedAt, dataTimestamp: windObservationResult.value?.observedAt },
    tides: { ok: laJollaTideResult.ok && sanDiegoTideResult.ok, detail: `${Number(laJollaTideResult.ok) + Number(sanDiegoTideResult.ok)}/2 stations live`, checkedAt: generatedAt, validThrough: tideValidThrough },
    buoy: { ok: buoyResult.ok, detail: buoyResult.ok ? "NDBC 46225 fallback observation live" : "CDIP observations are primary", checkedAt: generatedAt, dataTimestamp: buoyResult.value?.observedAt },
  };
  return {
    mode: regionalMarineLiveCount === 3 && allWindLive && allSupportingProvidersLive ? "live" : liveZones > 0 ? "partial" : "unavailable",
    generatedAt,
    buoy: buoyResult.value,
    conditions,
    dailyConditions,
    zones: series,
    liveZones: [...zoneData.keys()],
    providers,
    sources: [
      { name: "CDIP MOP", role: "Break-adjacent nearshore wave forecasts" },
      { name: "CDIP observations", role: "Regional buoy agreement checks and observed directional spectral peaks" },
      { name: "Open-Meteo", role: "Regional waves, secondary swell, and wind forecast" },
      { name: "NOAA CO-OPS", role: "Tide predictions and coastal wind observations" },
      { name: "NDBC 46225", role: "Fallback offshore observation" },
    ],
  };
}

export async function GET() {
  const now = Date.now();
  const cacheHeaders = (state: string, cacheControl = "public, s-maxage=900, stale-while-revalidate=86400") => ({
    "Cache-Control": cacheControl,
    "X-Data-Cache": state,
  });
  if (cached && cached.freshUntil > now) {
    return Response.json(payloadWithCache(cached.payload, "fresh-cache", cached.storedAt), { headers: cacheHeaders("MEMORY-HIT") });
  }
  if (negativeCache && negativeCache.expires > now && !cached) {
    return Response.json(negativeCache.payload, { headers: { "Cache-Control": "no-store", "X-Data-Cache": "NEGATIVE-HIT" } });
  }

  let db: D1DatabaseLike | null = null;
  let durableRow: CacheRow | null = null;
  try {
    db = await durableCacheDb();
    if (db) {
      await initializeCache(db);
      durableRow = await readDurableCache(db);
      const durablePayload = parseCachedPayload(durableRow);
      if (durablePayload && durableRow && durableRow.fresh_until > now) {
        cached = { freshUntil: durableRow.fresh_until, staleUntil: durableRow.stale_until, storedAt: durableRow.fetched_at, payload: durablePayload };
        return Response.json(payloadWithCache(durablePayload, "fresh-cache", durableRow.fetched_at), { headers: cacheHeaders("DURABLE-HIT") });
      }
    }
  } catch (error) {
    console.error(`[conditions] durable cache read failed: ${error instanceof Error ? error.message : "unknown error"}`);
    db = null;
  }

  const durableStale = durableRow && durableRow.stale_until > now ? parseCachedPayload(durableRow) : null;
  const memoryStale = cached && cached.staleUntil > now ? cached.payload : null;
  const stalePayload = durableStale ?? memoryStale;
  const staleStoredAt = durableStale && durableRow ? durableRow.fetched_at : cached?.storedAt ?? now;

  if (db) {
    try {
      const ownsRefresh = await claimRefreshLease(db, now);
      if (!ownsRefresh) {
        if (stalePayload) {
          return Response.json(payloadWithCache(stalePayload, "stale-cache", staleStoredAt, durableRow?.last_error ?? "Refresh already in progress"), { headers: cacheHeaders("STALE-WHILE-REFRESH") });
        }
        for (let attempt = 0; attempt < 16; attempt++) {
          await delay(500);
          const waitingRow = await readDurableCache(db);
          const waitingPayload = parseCachedPayload(waitingRow);
          if (waitingPayload && waitingRow) {
            const state: CacheState = waitingRow.fresh_until > Date.now() ? "fresh-cache" : "stale-cache";
            return Response.json(payloadWithCache(waitingPayload, state, waitingRow.fetched_at, waitingRow.last_error ?? undefined), { headers: cacheHeaders("DURABLE-WAIT-HIT") });
          }
        }
        const waitingPayload = { mode: "unavailable", generatedAt: new Date().toISOString(), conditions: [], zones: {}, providers: {}, sources: [], cache: { state: "origin", storedAt: new Date().toISOString(), ageSeconds: 0, refreshError: "Forecast refresh is still in progress" } };
        return Response.json(waitingPayload, { headers: cacheHeaders("REFRESH-IN-PROGRESS", "no-store") });
      }
    } catch (error) {
      console.error(`[conditions] durable refresh lease failed: ${error instanceof Error ? error.message : "unknown error"}`);
      db = null;
    }
  }

  try {
    inFlight ??= buildPayload().finally(() => { inFlight = undefined; });
    const payload = await inFlight;
    if (payload.mode !== "unavailable") {
      const storedAt = Date.now();
      const record = payload as unknown as Record<string, unknown>;
      cached = { freshUntil: storedAt + FRESH_TTL_MS, staleUntil: storedAt + STALE_TTL_MS, storedAt, payload: record };
      if (db) {
        try { await storeDurablePayload(db, record, storedAt); }
        catch (error) { console.error(`[conditions] durable cache write failed: ${error instanceof Error ? error.message : "unknown error"}`); }
      }
      negativeCache = undefined;
      return Response.json(payloadWithCache(record, "origin", storedAt), { headers: cacheHeaders("REFRESH") });
    } else {
      negativeCache = { expires: Date.now() + 20 * 1000, payload };
      const message = "No usable regional or CDIP nearshore forecast was available";
      if (db) {
        try { await releaseRefreshLease(db, message); }
        catch (error) { console.error(`[conditions] durable cache release failed: ${error instanceof Error ? error.message : "unknown error"}`); }
      }
      if (stalePayload) {
        return Response.json(payloadWithCache(stalePayload, "stale-cache", staleStoredAt, message), { headers: cacheHeaders("STALE-IF-ERROR") });
      }
      return Response.json(payload, { headers: cacheHeaders("MISS-UNAVAILABLE", "no-store") });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[conditions] payload build failed: ${message}`);
    if (db) {
      try { await releaseRefreshLease(db, message); }
      catch (releaseError) { console.error(`[conditions] durable cache release failed: ${releaseError instanceof Error ? releaseError.message : "unknown error"}`); }
    }
    if (stalePayload) {
      return Response.json(payloadWithCache(stalePayload, "stale-cache", staleStoredAt, message), { headers: cacheHeaders("STALE-IF-ERROR") });
    }
    return Response.json({ mode: "unavailable", generatedAt: new Date().toISOString(), conditions: [], zones: {}, providers: {}, sources: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
