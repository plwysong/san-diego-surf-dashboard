import assert from "node:assert/strict";
import test from "node:test";

function localHour(offset = 0) {
  const date = new Date(Date.now() + offset * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:00`;
}

const times = Array.from({ length: 144 }, (_, index) => localHour(index));
const filled = (value) => times.map(() => value);

function ndbcRow() {
  const now = new Date();
  const values = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
    String(now.getUTCHours()).padStart(2, "0"),
    String(now.getUTCMinutes()).padStart(2, "0"),
    200, 5, 6, 1.2, 12, 8, 220, 1015, 15, 20,
  ];
  return `#YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP\n${values.join(" ")}\n`;
}

test("provider degradation is explicit and outages are briefly coalesced", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        return Response.json({ hourly: {
          time: times,
          wave_height: filled(1.2),
          wave_direction: filled(220),
          wave_period: filled(12),
          swell_wave_height: filled(1.1),
          swell_wave_direction: filled(215),
          swell_wave_period: filled(13),
        } });
      }
      if (url.hostname === "api.open-meteo.com") {
        const central = url.searchParams.get("latitude") === "32.89";
        return Response.json({ hourly: central ? { time: times } : {
          time: times,
          wind_speed_10m: filled(5),
          wind_direction_10m: filled(90),
        } });
      }
      if (url.hostname === "api.tidesandcurrents.noaa.gov") {
        return Response.json({ predictions: [{ t: localHour().replace("T", " "), v: "2.4" }] });
      }
      if (url.hostname === "www.ndbc.noaa.gov") return new Response(ndbcRow());
      throw new Error(`Unexpected URL ${url}`);
    };

    const partialRoute = await import(`../app/api/conditions/route.ts?partial=${Date.now()}`);
    const partialResponse = await partialRoute.GET();
    const partial = await partialResponse.json();
    assert.equal(partial.mode, "partial");
    assert.deepEqual(partial.liveZones, ["North County", "Central", "South Bay"]);
    assert.equal(partial.conditions.length, 17);
    assert.equal(partial.providers.wind.ok, false);
    assert.match(partial.providers.wind.detail, /^2\/3 forecast zones live/);

    let outageCalls = 0;
    globalThis.fetch = async () => {
      outageCalls += 1;
      throw new Error("simulated outage");
    };
    const outageRoute = await import(`../app/api/conditions/route.ts?outage=${Date.now()}`);
    const first = await outageRoute.GET();
    const callsAfterFirst = outageCalls;
    const second = await outageRoute.GET();
    assert.equal((await first.json()).mode, "unavailable");
    assert.equal((await second.json()).mode, "unavailable");
    assert.equal(second.headers.get("x-data-cache"), "NEGATIVE-HIT");
    assert.equal(outageCalls, callsAfterFirst);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
