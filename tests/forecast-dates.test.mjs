import assert from "node:assert/strict";
import test from "node:test";

import { isFutureForecastDate, sanDiegoDateKey } from "../lib/forecast/dates.ts";
import { displayedDayIndexes } from "../app/api/conditions/route.ts";

test("tomorrow remains a future forecast after the current day's daylight window", () => {
  const afterSunset = new Date("2026-08-11T03:00:00.000Z"); // Aug 10, 8 PM in San Diego.
  assert.equal(sanDiegoDateKey(afterSunset), "2026-08-10");
  assert.equal(isFutureForecastDate("2026-08-09", afterSunset), false);
  assert.equal(isFutureForecastDate("2026-08-10", afterSunset), false);
  assert.equal(isFutureForecastDate("2026-08-11", afterSunset), true);
});

test("five displayed forecast days start tomorrow after sunset", () => {
  const times = Array.from({ length: 144 }, (_, offset) => {
    const date = new Date(Date.UTC(2026, 7, 11, 3 + offset));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:00`;
  });
  const days = displayedDayIndexes(times, 0).map(([date]) => date);
  assert.deepEqual(days, ["2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14", "2026-08-15"]);
});
