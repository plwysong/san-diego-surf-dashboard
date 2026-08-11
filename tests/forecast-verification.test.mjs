import assert from "node:assert/strict";
import test from "node:test";

import { componentFaceFeet, profiles } from "../lib/forecast/model.ts";
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
