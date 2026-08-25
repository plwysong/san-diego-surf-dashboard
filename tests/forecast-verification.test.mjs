import assert from "node:assert/strict";
import test from "node:test";

import { componentFaceFeet, conditionSummary, forecastConfidence, profiles } from "../lib/forecast/model.ts";
import { evaluateForecastSkill, groupForecastSkill } from "../lib/forecast/verification.ts";

const sample = (overrides = {}) => ({
  spot: "Blacks",
  issuedAt: "2026-08-10T12:00:00Z",
  validAt: "2026-08-11T12:00:00Z",
  horizonHours: 24,
  predictedLow: 2,
  predictedHigh: 3,
  observedLow: 2,
  observedHigh: 3,
  predictedWindSpeed: 5,
  observedWindSpeed: 7,
  predictedWindDirection: 350,
  observedWindDirection: 10,
  observationSource: "verified manual check",
  ...overrides,
});

test("forecast skill reports band agreement, bias, and circular wind error", () => {
  const skill = evaluateForecastSkill([
    sample(),
    sample({ validAt: "2026-08-12T12:00:00Z", predictedLow: 1, predictedHigh: 2, observedLow: 2, observedHigh: 3 }),
  ]);
  assert.equal(skill.samples, 2);
  assert.equal(skill.exactBandRate, .5);
  assert.equal(skill.withinOneFootRate, 1);
  assert.equal(skill.midpointMae, .5);
  assert.equal(skill.underforecastRate, .5);
  assert.equal(skill.windSpeedMae, 2);
  assert.equal(skill.windDirectionMae, 20);
});

test("forecast skill remains explicitly unavailable without verified samples", () => {
  assert.deepEqual(evaluateForecastSkill([]), {
    samples: 0,
    exactBandRate: null,
    withinOneFootRate: null,
    midpointMae: null,
    underforecastRate: null,
    windSpeedMae: null,
    windDirectionMae: null,
  });
});

test("skill can be grouped per break without mixing calibration histories", () => {
  const grouped = groupForecastSkill([sample(), sample({ spot: "Coronado", predictedHigh: 2, observedHigh: 3 })]);
  assert.equal(grouped.Blacks.exactBandRate, 1);
  assert.equal(grouped.Coronado.underforecastRate, 1);
});

test("targeted response calibration only changes the configured swell band", () => {
  const blacks = profiles.find((profile) => profile.name === "Blacks");
  const long = { height: 1, direction: 240, period: 17, band: "long" };
  const mid = { height: 1, direction: 240, period: 13, band: "mid" };
  const uncalibrated = { ...blacks, response: undefined };
  assert.ok(componentFaceFeet(blacks, long, true) > componentFaceFeet(uncalibrated, long, true));
  assert.equal(componentFaceFeet(blacks, mid, true), componentFaceFeet(uncalibrated, mid, true));
});

test("confidence tracks how much of the spectrum CDIP actually observed", () => {
  const base = {
    nearshore: true, observation: null, windObserved: false, tidesLive: true, windLive: true,
    horizonHours: 0, offshoreHeight: null, nearshoreHeight: 1.2, modelPeriod: 16, modelDirection: 255,
  };

  const full = forecastConfidence({ ...base, inputCoverage: 1 });
  const absent = forecastConfidence(base);
  const degraded = forecastConfidence({ ...base, inputCoverage: 0.6 });

  // An unreported coverage must not silently penalise the regional-free path.
  assert.equal(absent.score, full.score);

  // The nearshore credit is worth what the model was constrained by.
  assert.ok(degraded.score < full.score, "partial observation must reduce confidence");
  assert.match(degraded.reason, /60% observed/);
  assert.match(full.reason, /CDIP nearshore model/);
  assert.doesNotMatch(full.reason, /% observed/);

  // Scaling the existing credit, not inventing a separate penalty: the drop is
  // exactly the unobserved fraction of that credit.
  assert.ok(Math.abs((full.score - degraded.score) - Math.round(27 * 0.4)) <= 1);

  // Off the nearshore model there is no credit to scale.
  const regional = forecastConfidence({ ...base, nearshore: false, inputCoverage: 0.6 });
  assert.equal(regional.score, forecastConfidence({ ...base, nearshore: false }).score);
});

test("the summary names spectral width and gustiness only at the tails", () => {
  const blacks = profiles.find((profile) => profile.name === "Blacks");
  const offshore = (blacks.shoreNormal + 180) % 360;
  // `in` rather than `??` so an explicit null is passed through, not defaulted.
  const pick = (options, key, fallback) => key in options ? options[key] : fallback;
  const summary = (options = {}) => conditionSummary(
    blacks, pick(options, "period", 16), pick(options, "wind", 4), pick(options, "direction", offshore),
    pick(options, "tide", 2.5), pick(options, "gust", null), pick(options, "averagePeriod", null),
  );

  // Spectral width: narrow and broad are named, the middle stays silent.
  assert.match(summary({ period: 16, averagePeriod: 13 }), /^Clean long-period swell/);
  assert.match(summary({ period: 16, averagePeriod: 8 }), /^Long-period swell in a mixed sea/);
  assert.match(summary({ period: 16, averagePeriod: 10.7 }), /^Long-period swell ·/);
  // Absent Ta the wording is unchanged from before it was available.
  assert.match(summary({ period: 16 }), /^Long-period swell ·/);

  // Gustiness needs both an unsteady ratio and enough absolute wind to matter.
  assert.match(summary({ wind: 6, gust: 11 }), /gusty offshore wind/);
  assert.doesNotMatch(summary({ wind: 1, gust: 5 }), /gusty/, "5 kt gusts on a 1 kt mean leave the water glassy");
  assert.doesNotMatch(summary({ wind: 9, gust: 10 }), /gusty/, "a steady wind is not gusty however strong");
  assert.doesNotMatch(summary({ wind: 6 }), /gusty/, "no gust data means no claim");

  // Direction survives the gusty branch rather than being replaced by it.
  assert.match(summary({ wind: 6, gust: 11, direction: blacks.shoreNormal }), /gusty onshore wind/);

  // Unavailable inputs still say so.
  assert.match(summary({ wind: null }), /wind forecast unavailable/);
  assert.match(summary({ tide: null }), /tide forecast unavailable/);
});
