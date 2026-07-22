type Zone = "North County" | "Central" | "South Bay";
type Rating = "Excellent" | "Good" | "Fair" | "Poor";

type Profile = {
  name: string;
  zone: Zone;
  swellTarget: number;
  shoal: number;
  tideLow: number;
  tideHigh: number;
};

type HourlyData = {
  time: string[];
  wave_height?: Array<number | null>;
  wave_direction?: Array<number | null>;
  wave_period?: Array<number | null>;
  swell_wave_height?: Array<number | null>;
  swell_wave_direction?: Array<number | null>;
  swell_wave_period?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
};

type ForecastResponse = { hourly?: HourlyData; error?: boolean; reason?: string };
type TidePrediction = { t: string; v: string; type?: string };
type ProviderStatus = { ok: boolean; detail: string; checkedAt: string; dataTimestamp?: string };

const profiles: Profile[] = [
  { name: "Trestles", zone: "North County", swellTarget: 190, shoal: 1.12, tideLow: 1.0, tideHigh: 3.6 },
  { name: "Oceanside", zone: "North County", swellTarget: 225, shoal: 1.02, tideLow: 1.3, tideHigh: 4.0 },
  { name: "Tamarack", zone: "North County", swellTarget: 245, shoal: 1.02, tideLow: 1.1, tideHigh: 4.0 },
  { name: "Ponto", zone: "North County", swellTarget: 245, shoal: 1.08, tideLow: 1.3, tideHigh: 4.2 },
  { name: "Grandview", zone: "North County", swellTarget: 230, shoal: .95, tideLow: 1.5, tideHigh: 4.5 },
  { name: "Swami’s", zone: "North County", swellTarget: 225, shoal: 1.08, tideLow: 1.8, tideHigh: 4.4 },
  { name: "Cardiff Reef", zone: "North County", swellTarget: 225, shoal: 1.1, tideLow: 2.0, tideHigh: 4.8 },
  { name: "Del Mar", zone: "North County", swellTarget: 255, shoal: .95, tideLow: 1.0, tideHigh: 4.0 },
  { name: "Blacks", zone: "Central", swellTarget: 275, shoal: 1.32, tideLow: 1.5, tideHigh: 4.0 },
  { name: "La Jolla Shores", zone: "Central", swellTarget: 270, shoal: .65, tideLow: 1.4, tideHigh: 4.4 },
  { name: "Windansea", zone: "Central", swellTarget: 260, shoal: 1.02, tideLow: 1.8, tideHigh: 4.5 },
  { name: "Tourmaline", zone: "Central", swellTarget: 275, shoal: .72, tideLow: 2.0, tideHigh: 4.8 },
  { name: "Crystal Pier", zone: "Central", swellTarget: 270, shoal: .82, tideLow: 1.2, tideHigh: 4.0 },
  { name: "Ocean Beach", zone: "Central", swellTarget: 250, shoal: .98, tideLow: 1.2, tideHigh: 4.0 },
  { name: "Sunset Cliffs", zone: "Central", swellTarget: 255, shoal: 1.08, tideLow: 2.0, tideHigh: 4.8 },
  { name: "Coronado", zone: "South Bay", swellTarget: 225, shoal: .62, tideLow: 1.0, tideHigh: 3.8 },
  { name: "Imperial Beach", zone: "South Bay", swellTarget: 220, shoal: .88, tideLow: 1.2, tideHigh: 4.0 },
];

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

let cached: { expires: number; payload: unknown } | undefined;
let negativeCache: { expires: number; payload: unknown } | undefined;
let inFlight: ReturnType<typeof buildPayload> | undefined;

const n = (value: number | null | undefined, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

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

function angularDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function cardinal(degrees: number) {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(((degrees % 360) / 22.5)) % 16];
}

function spotHeight(profile: Profile, offshoreMeters: number, swellDirection: number) {
  const exposure = .42 + .58 * Math.max(0, Math.cos(angularDifference(swellDirection, profile.swellTarget) * Math.PI / 180));
  const faceFeet = Math.max(.5, offshoreMeters * 3.28084 * profile.shoal * exposure);
  const low = Math.max(1, Math.round(faceFeet * .78));
  const high = Math.max(low + 1, Math.round(faceFeet * 1.22));
  return { low, high, label: `${low}–${high} ft` };
}

function scoreConditions(profile: Profile, period: number, windSpeed: number, windDirection: number, tide: number, faceFeet: number) {
  let score = 38;
  score += Math.min(24, Math.max(0, (period - 7) * 3));
  score += windSpeed <= 4 ? 18 : windSpeed <= 8 ? 11 : windSpeed <= 12 ? 2 : -12;
  const offshoreDifference = angularDifference(windDirection, 90);
  score += offshoreDifference <= 55 ? 14 : offshoreDifference <= 100 ? 4 : -9;
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

function bestWindow(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], start: number) {
  const candidates = Array.from({ length: Math.min(12, marine.time.length - start) }, (_, offset) => start + offset);
  const scores = candidates.map((index) => {
    const swellHeight = n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1));
    const direction = n(marine.swell_wave_direction?.[index], n(marine.wave_direction?.[index], 260));
    const period = n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10));
    const wind = n(weather.wind_speed_10m?.[index], 8);
    const windDirection = n(weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, swellHeight, direction);
    return scoreConditions(profile, period, wind, windDirection, tide, (face.low + face.high) / 2);
  });
  let bestOffset = 0;
  let bestAverage = -1;
  for (let i = 0; i < Math.max(1, scores.length - 2); i++) {
    const slice = scores.slice(i, i + 3);
    const average = slice.reduce((sum, value) => sum + value, 0) / slice.length;
    if (average > bestAverage) { bestAverage = average; bestOffset = i; }
  }
  const startTime = marine.time[candidates[bestOffset] ?? start];
  const endTime = marine.time[candidates[Math.min(bestOffset + 3, candidates.length - 1)] ?? start];
  return { label: `${formatHour(startTime)}–${formatHour(endTime)}`, score: Math.round(bestAverage) };
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

async function fetchZone(zone: Zone) {
  const point = zonePoints[zone];
  const marineUrl = new URL("https://marine-api.open-meteo.com/v1/marine");
  marineUrl.searchParams.set("latitude", String(point.lat));
  marineUrl.searchParams.set("longitude", String(point.lon));
  marineUrl.searchParams.set("hourly", "wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_direction,swell_wave_period");
  marineUrl.searchParams.set("timezone", "America/Los_Angeles");
  marineUrl.searchParams.set("forecast_days", "6");
  marineUrl.searchParams.set("cell_selection", "sea");

  const weatherUrl = new URL("https://api.open-meteo.com/v1/forecast");
  weatherUrl.searchParams.set("latitude", String(point.lat));
  weatherUrl.searchParams.set("longitude", String(point.lon));
  weatherUrl.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m");
  weatherUrl.searchParams.set("wind_speed_unit", "kn");
  weatherUrl.searchParams.set("timezone", "America/Los_Angeles");
  weatherUrl.searchParams.set("forecast_days", "6");

  const [marineResult, weatherResult] = await Promise.allSettled([
    fetchJson<ForecastResponse>(`Open-Meteo marine (${zone})`, marineUrl.toString()),
    fetchJson<ForecastResponse>(`Open-Meteo wind (${zone})`, weatherUrl.toString()),
  ]);

  if (marineResult.status === "rejected" || !marineResult.value.hourly || !hasUsableMarineForecast(marineResult.value.hourly)) {
    throw marineResult.status === "rejected" ? marineResult.reason : new Error(`Open-Meteo marine (${zone}): empty forecast`);
  }

  const marine = marineResult.value.hourly;
  const alignedWeather = weatherResult.status === "fulfilled" && weatherResult.value.hourly
    ? alignWeatherToMarine(marine.time, weatherResult.value.hourly)
    : null;
  const windLive = Boolean(alignedWeather?.usable);
  const weather = windLive ? alignedWeather!.hourly : { time: marine.time };
  return { marine, weather, windLive };
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
  if (!Number.isFinite(observedAt.getTime()) || Date.now() - observedAt.getTime() > 6 * 60 * 60 * 1000) {
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

function buildZoneSeries(zone: Zone, marine: HourlyData, weather: HourlyData, tides: TidePrediction[]) {
  const profile = profiles.find((item) => item.name === zoneLeadSpot[zone])!;
  const start = currentIndex(marine.time);
  const hourly = Array.from({ length: 7 }, (_, offset) => start + offset).filter((index) => index < marine.time.length).map((index) => {
    const swellHeight = n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1));
    const direction = n(marine.swell_wave_direction?.[index], n(marine.wave_direction?.[index], 260));
    const period = n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10));
    const wind = n(weather.wind_speed_10m?.[index], 8);
    const windDirection = n(weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, swellHeight, direction);
    return {
      time: formatHour(marine.time[index]),
      height: (face.low + face.high) / 2,
      wind: Math.round(wind),
      score: scoreConditions(profile, period, wind, windDirection, tide, (face.low + face.high) / 2),
    };
  });

  const today = marine.time[start]?.slice(0, 10);
  const uniqueDates = [...new Set(marine.time.slice(start).map((time) => time.slice(0, 10)))].slice(0, 5);
  const days = uniqueDates.map((date) => {
    const indexes = marine.time.map((time, index) => time.startsWith(date) ? index : -1).filter((index) => index >= start);
    const midday = indexes[Math.min(12, indexes.length - 1)] ?? start;
    const maxHeight = Math.max(...indexes.map((index) => n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1))));
    const direction = n(marine.swell_wave_direction?.[midday], n(marine.wave_direction?.[midday], 260));
    const period = Math.max(...indexes.map((index) => n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10))));
    const face = spotHeight(profile, maxHeight, direction);
    const bestScore = Math.max(...indexes.map((index) => {
      const wind = n(weather.wind_speed_10m?.[index], 8);
      const windDirection = n(weather.wind_direction_10m?.[index], 270);
      const tide = closestTide(tides, marine.time[index]).value;
      const hourHeight = n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1));
      const hourDirection = n(marine.swell_wave_direction?.[index], n(marine.wave_direction?.[index], 260));
      const hourPeriod = n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10));
      const hourFace = spotHeight(profile, hourHeight, hourDirection);
      return scoreConditions(profile, hourPeriod, wind, windDirection, tide, (hourFace.low + hourFace.high) / 2);
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

function buildDailySpot(profile: Profile, marine: HourlyData, weather: HourlyData, tides: TidePrediction[], date: string, waterF: number | null) {
  const candidates = marine.time.map((time, index) => ({ time, index }))
    .filter(({ time }) => time.startsWith(date) && Number(time.slice(11, 13)) >= 5 && Number(time.slice(11, 13)) <= 19)
    .map(({ index }) => index);
  if (!candidates.length) return null;

  const scoreAt = (index: number) => {
    const height = n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1));
    const direction = n(marine.swell_wave_direction?.[index], n(marine.wave_direction?.[index], 260));
    const period = n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10));
    const wind = n(weather.wind_speed_10m?.[index], 8);
    const windDirection = n(weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, marine.time[index]).value;
    const face = spotHeight(profile, height, direction);
    return scoreConditions(profile, period, wind, windDirection, tide, (face.low + face.high) / 2);
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
  const swellHeight = n(marine.swell_wave_height?.[index], n(marine.wave_height?.[index], 1));
  const swellDirection = n(marine.swell_wave_direction?.[index], n(marine.wave_direction?.[index], 260));
  const period = n(marine.swell_wave_period?.[index], n(marine.wave_period?.[index], 10));
  const windSpeed = n(weather.wind_speed_10m?.[index], 8);
  const windDirection = n(weather.wind_direction_10m?.[index], 270);
  const tide = closestTide(tides, marine.time[index]);
  const face = spotHeight(profile, swellHeight, swellDirection);
  const endIndex = candidates[Math.min(bestOffset + 3, candidates.length - 1)];
  const chartIndexes = candidates.filter((_, position) => position % 2 === 0).slice(0, 7);

  return {
    name: profile.name,
    height: face.label,
    rating: rating(Math.round(bestAverage)),
    score: Math.round(bestAverage),
    swell: cardinal(swellDirection),
    swellDegrees: Math.round(swellDirection),
    period: `${Math.round(period)}s`,
    wind: `${Math.round(windSpeed)} kt ${cardinal(windDirection)}`,
    tide: `${tide.value.toFixed(1)} ft ${tide.trend}`,
    water: waterF == null ? "—" : `${waterF}°`,
    best: `${formatHour(marine.time[candidates[bestOffset]])}–${formatHour(marine.time[endIndex])}`,
    hourly: chartIndexes.map((hourIndex) => ({
      time: formatHour(marine.time[hourIndex]),
      height: n(marine.swell_wave_height?.[hourIndex], n(marine.wave_height?.[hourIndex], 1)) * 3.28084,
      wind: Math.round(n(weather.wind_speed_10m?.[hourIndex], 8)),
      score: scoreAt(hourIndex),
    })),
  };
}

async function buildPayload() {
  const zones = Object.keys(zonePoints) as Zone[];
  const [zoneResults, laJollaTideResult, sanDiegoTideResult, buoyResult] = await Promise.all([
    Promise.allSettled(zones.map((zone) => fetchZone(zone))),
    fetchTides("9410230").then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: [] as TidePrediction[] })),
    fetchTides("9410170").then((value) => ({ ok: true as const, value })).catch(() => ({ ok: false as const, value: [] as TidePrediction[] })),
    fetchBuoy().then((value) => ({ ok: true as const, value })).catch((error) => {
      console.error(`[conditions] NDBC buoy fetch failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false as const, value: null };
    }),
  ]);

  const laJollaTides = laJollaTideResult.value;
  const sanDiegoTides = sanDiegoTideResult.value;

  const zoneData = new Map<Zone, Awaited<ReturnType<typeof fetchZone>>>();
  zoneResults.forEach((result, index) => {
    if (result.status === "fulfilled") zoneData.set(zones[index], result.value);
  });

  const conditions = profiles.flatMap((profile) => {
    const data = zoneData.get(profile.zone);
    if (!data) return [];
    const tides = profile.zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const index = currentIndex(data.marine.time);
    const useBuoy = buoyResult.value && profile.zone !== "South Bay";
    const swellHeight = useBuoy && buoyResult.value!.waveHeightM != null
      ? buoyResult.value!.waveHeightM
      : n(data.marine.swell_wave_height?.[index], n(data.marine.wave_height?.[index], 1));
    const swellDirection = useBuoy && buoyResult.value!.meanDirection != null
      ? buoyResult.value!.meanDirection
      : n(data.marine.swell_wave_direction?.[index], n(data.marine.wave_direction?.[index], 260));
    const period = useBuoy && buoyResult.value!.dominantPeriod != null
      ? buoyResult.value!.dominantPeriod
      : n(data.marine.swell_wave_period?.[index], n(data.marine.wave_period?.[index], 10));
    const windSpeed = n(data.weather.wind_speed_10m?.[index], 8);
    const windDirection = n(data.weather.wind_direction_10m?.[index], 270);
    const tide = closestTide(tides, data.marine.time[index]);
    const face = spotHeight(profile, swellHeight, swellDirection);
    const score = scoreConditions(profile, period, windSpeed, windDirection, tide.value, (face.low + face.high) / 2);
    const window = bestWindow(profile, data.marine, data.weather, tides, index);
    const waterF = buoyResult.value?.waterC != null ? Math.round(buoyResult.value.waterC * 9 / 5 + 32) : null;
    return [{
      name: profile.name,
      height: face.label,
      rating: rating(score),
      score,
      swell: cardinal(swellDirection),
      swellDegrees: Math.round(swellDirection),
      period: `${Math.round(period)}s`,
      wind: `${Math.round(windSpeed)} kt ${cardinal(windDirection)}`,
      tide: `${tide.value.toFixed(1)} ft ${tide.trend}`,
      water: waterF == null ? "—" : `${waterF}°`,
      best: window.label,
    }];
  });

  const series = Object.fromEntries(zones.flatMap((zone) => {
    const data = zoneData.get(zone);
    if (!data) return [];
    const tides = zone === "South Bay" ? sanDiegoTides : laJollaTides;
    return [[zone, buildZoneSeries(zone, data.marine, data.weather, tides)]];
  }));

  const firstLiveZone = zones.find((zone) => zoneData.has(zone));
  const dailyDateKeys = firstLiveZone
    ? [...new Set(zoneData.get(firstLiveZone)!.marine.time.slice(currentIndex(zoneData.get(firstLiveZone)!.marine.time)).map((time) => time.slice(0, 10)))].slice(0, 5)
    : [];
  const waterF = buoyResult.value?.waterC != null ? Math.round(buoyResult.value.waterC * 9 / 5 + 32) : null;
  const dailyConditions = Object.fromEntries(dailyDateKeys.map((date) => [date, profiles.flatMap((profile) => {
    const data = zoneData.get(profile.zone);
    if (!data) return [];
    const tides = profile.zone === "South Bay" ? sanDiegoTides : laJollaTides;
    const forecast = buildDailySpot(profile, data.marine, data.weather, tides, date, waterF);
    return forecast ? [forecast] : [];
  })]));

  const liveZones = zoneData.size;
  const windLiveCount = [...zoneData.values()].filter((data) => data.windLive).length;
  const allWindLive = windLiveCount === zones.length;
  const allSupportingProvidersLive = laJollaTideResult.ok && sanDiegoTideResult.ok && buoyResult.ok;
  const generatedAt = new Date().toISOString();
  const providers: Record<string, ProviderStatus> = {
    marine: { ok: liveZones === 3, detail: `${liveZones}/3 forecast zones live`, checkedAt: generatedAt },
    wind: { ok: allWindLive, detail: `${windLiveCount}/${zones.length} forecast zones live${allWindLive ? "" : "; conservative defaults used where unavailable"}`, checkedAt: generatedAt },
    tides: { ok: laJollaTideResult.ok && sanDiegoTideResult.ok, detail: `${Number(laJollaTideResult.ok) + Number(sanDiegoTideResult.ok)}/2 stations live`, checkedAt: generatedAt },
    buoy: { ok: buoyResult.ok, detail: buoyResult.ok ? "NDBC 46225 observation live" : "Using Open-Meteo wave forecast", checkedAt: generatedAt, dataTimestamp: buoyResult.value?.observedAt },
  };
  return {
    mode: liveZones === 3 && allWindLive && allSupportingProvidersLive ? "live" : liveZones > 0 ? "partial" : "unavailable",
    generatedAt,
    buoy: buoyResult.value,
    conditions,
    dailyConditions,
    zones: series,
    liveZones: [...zoneData.keys()],
    providers,
    sources: [
      { name: "Open-Meteo", role: "Marine and wind forecast" },
      { name: "CDIP / NDBC 46225", role: "Observed waves and water temperature" },
      { name: "NOAA CO-OPS", role: "Tide predictions" },
    ],
  };
}

export async function GET() {
  if (cached && cached.expires > Date.now()) {
    return Response.json(cached.payload, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800", "X-Data-Cache": "HIT" } });
  }
  if (negativeCache && negativeCache.expires > Date.now()) {
    return Response.json(negativeCache.payload, { headers: { "Cache-Control": "no-store", "X-Data-Cache": "NEGATIVE-HIT" } });
  }

  try {
    inFlight ??= buildPayload().finally(() => { inFlight = undefined; });
    const payload = await inFlight;
    if (payload.mode !== "unavailable") {
      cached = { expires: Date.now() + 15 * 60 * 1000, payload };
      negativeCache = undefined;
    } else {
      negativeCache = { expires: Date.now() + 20 * 1000, payload };
    }
    const cacheControl = payload.mode === "unavailable"
      ? "no-store"
      : "public, s-maxage=900, stale-while-revalidate=1800";
    return Response.json(payload, { headers: { "Cache-Control": cacheControl, "X-Data-Cache": "MISS" } });
  } catch (error) {
    console.error(`[conditions] payload build failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return Response.json({ mode: "unavailable", generatedAt: new Date().toISOString(), conditions: [], zones: {}, providers: {}, sources: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
