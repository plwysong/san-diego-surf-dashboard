export type Zone = "North County" | "Central" | "South Bay";
export type Rating = "Excellent" | "Good" | "Fair" | "Poor";

export type Profile = {
  name: string;
  zone: Zone;
  swellTarget: number;
  shoal: number;
  response?: Partial<Record<WaveComponent["band"], number>>;
  regionalPlanningGuide?: boolean;
  tideLow: number;
  tideHigh: number;
  mopId: string;
  shoreNormal: number;
};

export type WaveComponent = {
  height: number;
  direction: number;
  period: number;
  band: "long" | "mid" | "short" | "bulk";
  /**
   * Directional coherence r1 = hypot(a1, b1), the mean resultant length of the
   * directional distribution. 1 is a single ray, lower is more spread.
   *
   * For any directional distribution the energy-weighted mean of
   * cos(theta - target) is exactly r1 * cos(mean - target), so this multiplies
   * the alignment term rather than approximating it. Undefined when the
   * spectrum is unavailable, which leaves the single-ray behaviour unchanged.
   */
  coherence?: number;
};

export type WaveEstimate = {
  height: number;
  direction: number;
  period: number;
  nearshore: boolean;
  /** CDIP's own per-bin input coverage at this hour, averaged. Undefined off the nearshore model. */
  inputCoverage?: number;
  averagePeriod?: number;
  radiationStressXx?: number;
  radiationStressXy?: number;
  components: WaveComponent[];
  componentSource: "CDIP spectrum" | "Regional partitions" | "Bulk peak";
};

export type HourlyData = {
  time: string[];
  /** Mean period. Tp/Ta indicates spectral width; archived, not yet scored. */
  wave_period_average?: Array<number | null>;
  /** Radiation stress. Drives setup and longshore current; archived, not yet scored. */
  radiation_stress_xx?: Array<number | null>;
  radiation_stress_xy?: Array<number | null>;
  /** Fraction of the spectrum CDIP constrained with real buoy input, 0-1. */
  model_input_coverage?: Array<number | null>;
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
  spectral_components?: WaveComponent[][];
};

export type CdipObservation = {
  observedAt: string;
  station: string;
  name: string;
  lat: number;
  lon: number;
  depthM: number;
  waveHeightM: number;
  period: number;
  direction: number | null;
  waterC: number | null;
};

export type Confidence = { label: "High" | "Medium" | "Low"; score: number; reason: string };

export const profiles: Profile[] = [
  { name: "Trestles", zone: "North County", swellTarget: 190, shoal: 1.12, tideLow: 1.0, tideHigh: 3.6, mopId: "D1207", shoreNormal: 209.49 },
  { name: "Oceanside", zone: "North County", swellTarget: 225, shoal: 1.02, tideLow: 1.3, tideHigh: 4.0, mopId: "D0903", shoreNormal: 231.02 },
  { name: "Tamarack", zone: "North County", swellTarget: 245, shoal: 1.02, response: { mid: 1.12, bulk: 1.12 }, tideLow: 1.1, tideHigh: 4.0, mopId: "D0845", shoreNormal: 238.01 },
  { name: "Ponto", zone: "North County", swellTarget: 245, shoal: 1.08, tideLow: 1.3, tideHigh: 4.2, mopId: "D0775", shoreNormal: 248.53 },
  { name: "Grandview", zone: "North County", swellTarget: 230, shoal: .95, tideLow: 1.5, tideHigh: 4.5, mopId: "D0757", shoreNormal: 256.52 },
  { name: "Swami’s", zone: "North County", swellTarget: 225, shoal: 1.08, tideLow: 1.8, tideHigh: 4.4, mopId: "D0708", shoreNormal: 219.51 },
  { name: "Cardiff Reef", zone: "North County", swellTarget: 225, shoal: 1.1, response: { mid: 1.08 }, tideLow: 2.0, tideHigh: 4.8, mopId: "D0680", shoreNormal: 252.55 },
  { name: "Del Mar", zone: "North County", swellTarget: 255, shoal: .95, response: { mid: 1.12, bulk: 1.12 }, tideLow: 1.0, tideHigh: 4.0, mopId: "D0620", shoreNormal: 264.49 },
  { name: "Blacks", zone: "Central", swellTarget: 275, shoal: 1.32, response: { long: 1.18 }, regionalPlanningGuide: true, tideLow: 1.5, tideHigh: 4.0, mopId: "D0537", shoreNormal: 270 },
  { name: "La Jolla Shores", zone: "Central", swellTarget: 270, shoal: .65, tideLow: 1.4, tideHigh: 4.4, mopId: "D0500", shoreNormal: 299.45 },
  { name: "Windansea", zone: "Central", swellTarget: 260, shoal: 1.02, response: { long: 1.12 }, tideLow: 1.8, tideHigh: 4.5, mopId: "D0457", shoreNormal: 267.47 },
  { name: "Tourmaline", zone: "Central", swellTarget: 275, shoal: .72, tideLow: 2.0, tideHigh: 4.8, mopId: "D0416", shoreNormal: 226.29 },
  { name: "Crystal Pier", zone: "Central", swellTarget: 270, shoal: .82, tideLow: 1.2, tideHigh: 4.0, mopId: "D0406", shoreNormal: 250.84 },
  { name: "Ocean Beach", zone: "Central", swellTarget: 250, shoal: .98, response: { long: 1.1 }, tideLow: 1.2, tideHigh: 4.0, mopId: "D0348", shoreNormal: 296.97 },
  { name: "Sunset Cliffs", zone: "Central", swellTarget: 255, shoal: 1.08, tideLow: 2.0, tideHigh: 4.8, mopId: "D0318", shoreNormal: 267 },
  { name: "Coronado", zone: "South Bay", swellTarget: 225, shoal: .62, response: { long: 1.4 }, regionalPlanningGuide: true, tideLow: 1.0, tideHigh: 3.8, mopId: "D0178", shoreNormal: 221.17 },
  { name: "Imperial Beach", zone: "South Bay", swellTarget: 220, shoal: .88, response: { long: 1.3 }, regionalPlanningGuide: true, tideLow: 1.2, tideHigh: 4.0, mopId: "D0053", shoreNormal: 267.47 },
];

export const spotCoordinates: Record<string, [number, number]> = {
  Trestles: [33.3833, -117.5937], Oceanside: [33.1937, -117.3831], Tamarack: [33.1477, -117.3508], Ponto: [33.0916, -117.3160],
  Grandview: [33.0774, -117.3086], "Swami’s": [33.0344, -117.2926], "Cardiff Reef": [33.0134, -117.2850], "Del Mar": [32.9595, -117.2686],
  Blacks: [32.8875, -117.2533], "La Jolla Shores": [32.8570, -117.2571], Windansea: [32.8313, -117.2818], Tourmaline: [32.8057, -117.2610],
  "Crystal Pier": [32.7976, -117.2574], "Ocean Beach": [32.7495, -117.2526], "Sunset Cliffs": [32.7202, -117.2572], Coronado: [32.6800, -117.1835], "Imperial Beach": [32.5791, -117.1324],
};

export const zonePoints: Record<Zone, { lat: number; lon: number; tideStation: string }> = {
  "North County": { lat: 33.16, lon: -117.39, tideStation: "9410230" },
  Central: { lat: 32.89, lon: -117.30, tideStation: "9410230" },
  "South Bay": { lat: 32.63, lon: -117.22, tideStation: "9410170" },
};

export const nwsWindPoints: Record<Zone, { lat: number; lon: number }> = {
  "North County": { lat: 33.195, lon: -117.379 },
  Central: { lat: 32.84, lon: -117.27 },
  "South Bay": { lat: 32.58, lon: -117.12 },
};

export const zoneLeadSpot: Record<Zone, string> = {
  "North County": "Swami’s",
  Central: "Blacks",
  "South Bay": "Coronado",
};

export const n = (value: number | null | undefined, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function angularDifference(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function cardinal(degrees: number) {
  const points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return points[Math.round(((degrees % 360) / 22.5)) % 16];
}

export function componentFaceFeet(profile: Profile, component: WaveComponent, nearshore: boolean) {
  // A broad sea delivers less energy to a shore of fixed orientation than a
  // focused swell of the same height, which a single mean direction cannot express.
  const alignment = Math.cos(angularDifference(component.direction, profile.swellTarget) * Math.PI / 180);
  const directionalFit = Math.max(0, alignment * (component.coherence ?? 1));
  const exposure = nearshore ? .82 + .18 * directionalFit : .42 + .58 * directionalFit;
  const periodResponse = Math.max(.85, Math.min(1.28, 1 + (component.period - 12) * .025));
  const calibratedResponse = profile.response?.[component.band] ?? 1;
  return Math.max(0, component.height * 3.28084 * profile.shoal * exposure * periodResponse * calibratedResponse);
}

export function spotHeight(profile: Profile, wave: WaveEstimate) {
  const contributions = wave.components.map((component) => componentFaceFeet(profile, component, wave.nearshore));
  const faceFeet = Math.sqrt(contributions.reduce((sum, value) => sum + value ** 2, 0));
  const typicalLow = Math.max(0, Math.round(faceFeet * .72));
  const typicalHigh = Math.max(typicalLow + 1, Math.round(faceFeet * 1.02));
  const setLow = Math.max(typicalHigh, Math.round(faceFeet * 1.08));
  const setHigh = Math.max(setLow + 1, Math.round(faceFeet * 1.42));
  return { low: typicalLow, high: typicalHigh, label: `${typicalLow}–${typicalHigh} ft`, sets: `${setLow}–${setHigh} ft`, faceFeet };
}

export function scoreConditions(profile: Profile, period: number, windSpeed: number | null, windDirection: number | null, tide: number | null, faceFeet: number) {
  let score = 38;
  const windUnavailable = windSpeed == null || windDirection == null;
  score += Math.min(24, Math.max(0, (period - 7) * 3));
  if (windSpeed != null && windDirection != null) {
    const onshoreComponent = windSpeed * Math.cos(angularDifference(windDirection, profile.shoreNormal) * Math.PI / 180);
    score += Math.max(-18, Math.min(24, 12 - onshoreComponent * 2.3 - windSpeed * .8));
  }
  if (tide != null) score += tide >= profile.tideLow && tide <= profile.tideHigh ? 10 : -4;
  score += faceFeet >= 2 && faceFeet <= 8 ? 6 : faceFeet > 10 ? -5 : 0;
  const bounded = Math.max(18, Math.min(98, Math.round(score)));
  return windUnavailable ? Math.min(69, bounded) : bounded;
}

export function rating(score: number): Rating {
  if (score >= 86) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

export function forecastConfidence({ nearshore, observation, windObserved, tidesLive, windLive, horizonHours, offshoreHeight, nearshoreHeight, modelPeriod, modelDirection, inputCoverage }: {
  nearshore: boolean;
  observation: { item: CdipObservation; distance: number } | null;
  windObserved: boolean;
  tidesLive: boolean;
  windLive: boolean;
  horizonHours: number;
  offshoreHeight: number | null;
  nearshoreHeight: number;
  modelPeriod: number;
  modelDirection: number;
  inputCoverage?: number;
}): Confidence {
  let score = 32;
  const reasons: string[] = [];
  if (nearshore) {
    // The nearshore credit is worth what the model was actually constrained by.
    // CDIP reports that per frequency bin, so scale the credit rather than
    // inventing a separate penalty. Full coverage leaves the credit unchanged.
    const coverage = inputCoverage == null ? 1 : Math.max(0, Math.min(1, inputCoverage));
    score += 27 * coverage;
    reasons.push(coverage >= .995 ? "CDIP nearshore model" : `CDIP nearshore model, ${Math.round(coverage * 100)}% observed`);
  }
  const evidenceWeight = Math.exp(-Math.max(0, horizonHours) / 18);
  if (observation && observation.distance <= 35 && offshoreHeight != null && offshoreHeight > 0) {
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
  if (nearshore && offshoreHeight != null && offshoreHeight > 0) {
    const ratio = Math.abs(nearshoreHeight - offshoreHeight) / offshoreHeight;
    score += ratio <= .35 ? 7 : ratio <= .7 ? 2 : -7;
  }
  score -= Math.min(42, Math.max(0, horizonHours) / 24 * 8);
  const horizonCap = horizonHours > 72 ? 55 : horizonHours > 36 ? 77 : 96;
  const rounded = Math.max(24, Math.min(horizonCap, Math.round(score)));
  return { label: rounded >= 78 ? "High" : rounded >= 56 ? "Medium" : "Low", score: rounded, reason: reasons.slice(0, 3).join(" · ") || "regional model estimate" };
}

export function conditionSummary(profile: Profile, period: number, windSpeed: number | null, windDirection: number | null, tide: number | null) {
  const periodLabel = period >= 14 ? "Long-period" : period >= 10 ? "Mid-period" : "Short-period";
  const windDifference = windDirection == null ? null : angularDifference(windDirection, (profile.shoreNormal + 180) % 360);
  const windLabel = windSpeed == null || windDifference == null ? "wind forecast unavailable" : windDifference <= 55 && windSpeed <= 10 ? "clean offshore wind" : windSpeed <= 5 ? "light wind" : windDifference > 110 ? "onshore wind" : "cross-shore wind";
  const tideLabel = tide == null ? "tide forecast unavailable" : tide >= profile.tideLow && tide <= profile.tideHigh ? "tide in range" : "tide outside ideal range";
  return `${periodLabel} swell · ${windLabel} · ${tideLabel}`;
}
