export type ForecastVerificationSample = {
  spot: string;
  issuedAt: string;
  validAt: string;
  horizonHours: number;
  predictedLow: number;
  predictedHigh: number;
  observedLow: number;
  observedHigh: number;
  predictedWindSpeed?: number | null;
  observedWindSpeed?: number | null;
  predictedWindDirection?: number | null;
  observedWindDirection?: number | null;
  observationSource: string;
};

export type ForecastSkill = {
  samples: number;
  exactBandRate: number | null;
  withinOneFootRate: number | null;
  midpointMae: number | null;
  underforecastRate: number | null;
  windSpeedMae: number | null;
  windDirectionMae: number | null;
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function angularError(a: number, b: number) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

export function evaluateForecastSkill(samples: ForecastVerificationSample[]): ForecastSkill {
  const valid = samples.filter((sample) => [sample.predictedLow, sample.predictedHigh, sample.observedLow, sample.observedHigh]
    .every((value) => Number.isFinite(value))
    && sample.predictedLow <= sample.predictedHigh
    && sample.observedLow <= sample.observedHigh);
  const exact = valid.filter((sample) => sample.predictedLow === sample.observedLow && sample.predictedHigh === sample.observedHigh).length;
  const withinOneFoot = valid.filter((sample) => Math.abs(sample.predictedLow - sample.observedLow) <= 1
    && Math.abs(sample.predictedHigh - sample.observedHigh) <= 1).length;
  const midpointErrors = valid.map((sample) => Math.abs((sample.predictedLow + sample.predictedHigh - sample.observedLow - sample.observedHigh) / 2));
  const underforecasted = valid.filter((sample) => sample.predictedHigh < sample.observedHigh).length;
  const windSpeedErrors = valid.flatMap((sample) => sample.predictedWindSpeed != null && sample.observedWindSpeed != null
    ? [Math.abs(sample.predictedWindSpeed - sample.observedWindSpeed)] : []);
  const windDirectionErrors = valid.flatMap((sample) => sample.predictedWindDirection != null && sample.observedWindDirection != null
    ? [angularError(sample.predictedWindDirection, sample.observedWindDirection)] : []);

  return {
    samples: valid.length,
    exactBandRate: valid.length ? exact / valid.length : null,
    withinOneFootRate: valid.length ? withinOneFoot / valid.length : null,
    midpointMae: mean(midpointErrors),
    underforecastRate: valid.length ? underforecasted / valid.length : null,
    windSpeedMae: mean(windSpeedErrors),
    windDirectionMae: mean(windDirectionErrors),
  };
}

export function groupForecastSkill(samples: ForecastVerificationSample[]) {
  const groups = new Map<string, ForecastVerificationSample[]>();
  samples.forEach((sample) => groups.set(sample.spot, [...(groups.get(sample.spot) ?? []), sample]));
  return Object.fromEntries([...groups.entries()].map(([spot, spotSamples]) => [spot, evaluateForecastSkill(spotSamples)]));
}
