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

function utcStamp(date = new Date()) {
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(date.getUTCDate()).padStart(2, "0")}.${date.getUTCFullYear()}-${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:00`;
}

function compactUtc(date = new Date()) {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function mopCsv(station) {
  const rows = times.filter((_, index) => index % 3 === 0).map((time, index) => {
    const utc = new Date(`${time}:00-07:00`).toISOString();
    return `${utc},255,${station},${(0.75 + index * .002).toFixed(3)},32.88,14,-117.26`;
  });
  return `time,waveDp[unit="degreeT"],station,waveHs[unit="meter"],latitude[unit="degrees_north"],waveTp[unit="second"],longitude[unit="degrees_east"]\n${rows.join("\n")}`;
}

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
    let marineCalls = 0;
    let weatherCalls = 0;
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        marineCalls += 1;
        const forecast = { hourly: {
          time: times,
          wave_height: filled(1.2),
          wave_direction: filled(220),
          wave_period: filled(12),
          swell_wave_height: filled(1.1),
          swell_wave_direction: filled(215),
          swell_wave_period: filled(13),
          secondary_swell_wave_height: filled(.35),
          secondary_swell_wave_direction: filled(285),
          secondary_swell_wave_period: filled(8),
        } };
        return Response.json([forecast, forecast, forecast]);
      }
      if (url.hostname === "api.open-meteo.com") {
        weatherCalls += 1;
        const healthy = { hourly: {
          time: times,
          wind_speed_10m: filled(5),
          wind_direction_10m: filled(90),
        } };
        return Response.json([healthy, { hourly: { time: times } }, healthy]);
      }
      if (url.hostname === "api.tidesandcurrents.noaa.gov") {
        if (url.searchParams.get("product") === "wind") {
          return Response.json({ data: [{ t: new Date().toISOString().slice(0, 16).replace("T", " "), s: "5.0", d: "80" }] });
        }
        return Response.json({ predictions: [{ t: localHour().replace("T", " "), v: "2.4" }] });
      }
      if (url.hostname === "cdip.ucsd.edu" && url.pathname.endsWith("sccoos.cdip")) {
        return new Response(`<pre>${utcStamp()}\t100\tTORREY PINES OUTER, CA\t32.93\t-117.392\t57196\t1.2\t14.0\t220\t20.0\n${utcStamp()}\t201\tSCRIPPS NEARSHORE, CA\t32.86785\t-117.26667\t4100\t0.8\t12.0\t250\t21.0</pre>`);
      }
      if (url.hostname === "cdip.ucsd.edu" && url.pathname.endsWith("ndar.cdip")) {
        return new Response(`<pre>${compactUtc()} 20 210 40 215 80 220 120 225 160 230 210 235 260 240 40 250 20 270</pre>`);
      }
      if (url.hostname === "thredds.cdip.ucsd.edu") {
        const station = url.pathname.match(/(D\d{4})_forecast/)?.[1] ?? "D0000";
        return new Response(mopCsv(station));
      }
      if (url.hostname === "www.ndbc.noaa.gov") return new Response(ndbcRow());
      throw new Error(`Unexpected URL ${url}`);
    };

    const partialRoute = await import(`../app/api/conditions/route.ts?partial=${Date.now()}`);
    const partialResponse = await partialRoute.GET();
    const partial = await partialResponse.json();
    assert.equal(partial.mode, "partial");
    assert.equal(marineCalls, 1);
    assert.equal(weatherCalls, 1);
    assert.deepEqual(partial.liveZones, ["North County", "Central", "South Bay"]);
    assert.equal(partial.conditions.length, 17);
    assert.equal(Object.keys(partial.dailyConditions).length, 5);
    assert.ok(Object.values(partial.dailyConditions).every((day) => day.length === 17));
    assert.ok(Object.values(partial.dailyConditions)[1][0].hourly.length > 0);
    assert.equal(partial.providers.mop.ok, true);
    assert.equal(partial.providers.cdip.ok, true);
    assert.equal(partial.providers.spectra.ok, true);
    assert.equal(partial.providers.windObservation.ok, false);
    assert.equal(partial.providers.mop.validThrough != null, true);
    assert.equal(partial.providers.marine.validThrough != null, true);
    assert.match(partial.conditions[0].modelPoint, /^D\d{4}$/);
    assert.ok(partial.conditions[0].confidenceScore >= 70);
    assert.match(partial.conditions[0].secondarySwell, /·/);
    const futureDays = Object.values(partial.dailyConditions);
    assert.equal(futureDays[1][0].secondarySwell, "WNW · 8s");
    assert.equal(futureDays.at(-1)[0].confidence, "Low");
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

test("durable cache serves fresh and stale real forecasts without repeating provider calls", async () => {
  const originalFetch = globalThis.fetch;
  const storedPayload = {
    mode: "partial",
    generatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    conditions: [{ name: "Blacks", height: "3–5 ft" }],
    dailyConditions: {},
    zones: {},
    liveZones: ["Central"],
    providers: {},
    sources: [],
  };
  const row = {
    payload: JSON.stringify(storedPayload),
    fetched_at: Date.now() - 30 * 60 * 1000,
    fresh_until: Date.now() + 30 * 60 * 1000,
    stale_until: Date.now() + 24 * 60 * 60 * 1000,
    refresh_lock_until: 0,
    last_error: null,
  };
  const fakeDb = {
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) { this.values = values; return this; },
        async first() { return { ...row }; },
        async run() {
          if (query.startsWith("UPDATE forecast_cache SET refresh_lock_until")) {
            return { meta: { changes: row.refresh_lock_until < Date.now() ? 1 : 0 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  try {
    let providerCalls = 0;
    globalThis.fetch = async () => { providerCalls += 1; throw new Error("provider should not be called"); };
    globalThis.__FORECAST_CACHE_DB__ = fakeDb;

    const freshRoute = await import(`../app/api/conditions/route.ts?durable-fresh=${Date.now()}`);
    const freshResponse = await freshRoute.GET();
    const fresh = await freshResponse.json();
    assert.equal(fresh.cache.state, "fresh-cache");
    assert.equal(fresh.conditions[0].name, "Blacks");
    assert.equal(freshResponse.headers.get("x-data-cache"), "DURABLE-HIT");
    assert.equal(providerCalls, 0);

    row.fresh_until = Date.now() - 1;
    row.refresh_lock_until = Date.now() + 60_000;
    row.last_error = "Open-Meteo HTTP 429";
    const staleRoute = await import(`../app/api/conditions/route.ts?durable-stale=${Date.now()}`);
    const staleResponse = await staleRoute.GET();
    const stale = await staleResponse.json();
    assert.equal(stale.cache.state, "stale-cache");
    assert.match(stale.cache.refreshError, /429/);
    assert.equal(staleResponse.headers.get("x-data-cache"), "STALE-WHILE-REFRESH");
    assert.equal(providerCalls, 0);
  } finally {
    delete globalThis.__FORECAST_CACHE_DB__;
    globalThis.fetch = originalFetch;
  }
});
