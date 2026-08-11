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

function mopSpectralCsv(station) {
  const rows = times.filter((_, index) => index % 3 === 0).map((time, index) => {
    const utc = new Date(`${time}:00-07:00`).toISOString();
    const futurePulse = index >= 8;
    const energy = Array.from({ length: 28 }, (_, band) => {
      if (futurePulse) return band <= 6 ? 1.8 : .025;
      return band >= 13 ? .7 : .035;
    });
    const directions = Array.from({ length: 28 }, (_, band) => band <= 6 ? 220 : band < 13 ? 250 : 280);
    return `${utc},${futurePulse ? 220 : 280},${station},${futurePulse ? "1.300" : ".900"},32.88,${futurePulse ? 20 : 8},-117.26,${energy.join(" ")},${directions.join(" ")}`;
  });
  return `time,waveDp[unit="degreeT"],station,waveHs[unit="meter"],latitude[unit="degrees_north"],waveTp[unit="second"],longitude[unit="degrees_east"],waveEnergyDensity[unit="meter^2 second"],waveMeanDirection[unit="degreeT"]\n${rows.join("\n")}`;
}

function gappyMopCsv(station) {
  const offsets = [0, 3, 6, 9, 120, 123, 126, 129];
  const rows = offsets.map((offset) => {
    const time = localHour(offset);
    return `${new Date(`${time}:00-07:00`).toISOString()},255,${station},0.8,32.88,14,-117.26`;
  });
  return `time,waveDp[unit="degreeT"],station,waveHs[unit="meter"],latitude[unit="degrees_north"],waveTp[unit="second"],longitude[unit="degrees_east"]\n${rows.join("\n")}`;
}

function nwsPeriods() {
  return times.map((time) => ({
    startTime: new Date(`${time}:00-07:00`).toISOString(),
    windSpeed: "5 mph",
    windDirection: "E",
  }));
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

function tideRows(value = 2.5) {
  return times.map((time) => ({ t: time.replace("T", " "), v: String(value) }));
}

function tideScenarioFetch(failedStations = new Set(), predictionOverrides = new Map()) {
  return async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "marine-api.open-meteo.com") {
      const forecast = { hourly: {
        time: times,
        wave_height: filled(1.2),
        wave_direction: filled(230),
        wave_period: filled(12),
        swell_wave_height: filled(1.0),
        swell_wave_direction: filled(225),
        swell_wave_period: filled(13),
        secondary_swell_wave_height: filled(.3),
        secondary_swell_wave_direction: filled(285),
        secondary_swell_wave_period: filled(8),
      } };
      return Response.json([forecast, forecast, forecast]);
    }
    if (url.hostname === "api.open-meteo.com") {
      const weather = { hourly: { time: times, wind_speed_10m: filled(4), wind_direction_10m: filled(80) } };
      return Response.json([weather, weather, weather]);
    }
    if (url.hostname === "api.tidesandcurrents.noaa.gov") {
      if (url.searchParams.get("product") === "wind") {
        return Response.json({ data: [{ t: new Date().toISOString().slice(0, 16).replace("T", " "), s: "4.0", d: "80" }] });
      }
      const station = url.searchParams.get("station");
      if (failedStations.has(station)) throw new Error(`tide station ${station} offline`);
      return Response.json({ predictions: predictionOverrides.get(station) ?? tideRows() });
    }
    if (url.hostname === "cdip.ucsd.edu" && url.pathname.endsWith("sccoos.cdip")) {
      return new Response(`<pre>${utcStamp()}\t100\tTORREY PINES OUTER, CA\t32.93\t-117.392\t57196\t1.2\t13.0\t225\t20.0</pre>`);
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
    assert.ok(Object.values(partial.dailyConditions).every((day) => day.every((spot) => spot.dayHeight && spot.daySets && spot.dayPeak && spot.daySource)));
    assert.equal(partial.providers.mop.ok, true);
    assert.equal(partial.providers.cdip.ok, true);
    assert.equal(partial.providers.spectra.ok, false);
    assert.match(partial.providers.spectra.detail, /monitoring only/);
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
    assert.match(partial.providers.wind.detail, /^10\/17 break forecasts have wind/);

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
    conditions: [{ name: "Blacks", height: "3–5 ft", confidence: "High", confidenceScore: 92, confidenceReason: "CDIP nearshore model" }],
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
    assert.ok(fresh.conditions[0].confidenceScore < 92);
    assert.match(fresh.conditions[0].confidenceReason, /stored forecast <1h old/);
    assert.equal(freshResponse.headers.get("x-data-cache"), "DURABLE-HIT");
    assert.equal(freshResponse.headers.get("cache-control"), "private, no-store");
    assert.equal(providerCalls, 0);

    row.fresh_until = Date.now() - 1;
    row.fetched_at = Date.now() - 30 * 60 * 60 * 1000;
    row.refresh_lock_until = Date.now() + 60_000;
    row.last_error = "Open-Meteo HTTP 429";
    const staleRoute = await import(`../app/api/conditions/route.ts?durable-stale=${Date.now()}`);
    const staleResponse = await staleRoute.GET();
    const stale = await staleResponse.json();
    assert.equal(stale.cache.state, "stale-cache");
    assert.match(stale.cache.refreshError, /429/);
    assert.equal(stale.conditions[0].confidence, "Low");
    assert.ok(stale.conditions[0].confidenceScore <= 52);
    assert.match(stale.conditions[0].confidenceReason, /stored forecast 30h old/);
    assert.equal(staleResponse.headers.get("x-data-cache"), "STALE-WHILE-REFRESH");
    assert.equal(staleResponse.headers.get("cache-control"), "private, no-store");
    assert.equal(providerCalls, 0);
  } finally {
    delete globalThis.__FORECAST_CACHE_DB__;
    globalThis.fetch = originalFetch;
  }
});

test("an expired durable row is not replayed while another worker refreshes", async () => {
  const originalFetch = globalThis.fetch;
  const expiredPayload = { mode: "partial", generatedAt: new Date().toISOString(), conditions: [{ name: "Expired" }], dailyConditions: {}, zones: {}, providers: {}, sources: [] };
  const freshPayload = { ...expiredPayload, conditions: [{ name: "Fresh" }] };
  const expiredRow = { payload: JSON.stringify(expiredPayload), fetched_at: Date.now() - 40 * 60 * 60 * 1000, fresh_until: Date.now() - 39 * 60 * 60 * 1000, stale_until: Date.now() - 4 * 60 * 60 * 1000, refresh_lock_until: Date.now() + 60_000, last_error: null };
  const freshRow = { payload: JSON.stringify(freshPayload), fetched_at: Date.now(), fresh_until: Date.now() + 60_000, stale_until: Date.now() + 36 * 60 * 60 * 1000, refresh_lock_until: 0, last_error: null };
  let reads = 0;
  globalThis.__FORECAST_CACHE_DB__ = {
    prepare(query) {
      return {
        bind() { return this; },
        async first() { reads += 1; return reads < 3 ? expiredRow : freshRow; },
        async run() { return { meta: { changes: query.startsWith("UPDATE forecast_cache SET refresh_lock_until") ? 0 : 1 } }; },
      };
    },
  };
  try {
    globalThis.fetch = async () => { throw new Error("provider should not be called"); };
    const route = await import(`../app/api/conditions/route.ts?expired-wait=${Date.now()}`);
    const response = await route.GET();
    const payload = await response.json();
    assert.equal(payload.conditions[0].name, "Fresh");
    assert.equal(payload.cache.state, "fresh-cache");
  } finally {
    delete globalThis.__FORECAST_CACHE_DB__;
    globalThis.fetch = originalFetch;
  }
});

test("spectral forecasts preserve long-period swell, publish sets, and use NWS wind fallback", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        const forecast = { hourly: {
          time: times,
          wave_height: filled(1.1), wave_direction: filled(265), wave_period: filled(10),
          swell_wave_height: filled(.9), swell_wave_direction: filled(250), swell_wave_period: filled(13),
          secondary_swell_wave_height: filled(.4), secondary_swell_wave_direction: filled(220), secondary_swell_wave_period: filled(20),
        } };
        return Response.json([forecast, forecast, forecast]);
      }
      if (url.hostname === "api.open-meteo.com") return Response.json([{ hourly: { time: times } }, { hourly: { time: times } }, { hourly: { time: times } }]);
      if (url.hostname === "api.weather.gov" && url.pathname.startsWith("/points/")) return Response.json({ properties: { forecastHourly: "https://api.weather.gov/gridpoints/SGX/1,1/forecast/hourly" } });
      if (url.hostname === "api.weather.gov") return Response.json({ properties: { periods: nwsPeriods() } });
      if (url.hostname === "api.tidesandcurrents.noaa.gov") {
        if (url.searchParams.get("product") === "wind") return Response.json({ data: [] });
        return Response.json({ predictions: [
          { t: localHour(-1).replace("T", " "), v: "1.0" },
          ...times.map((time, index) => ({ t: time.replace("T", " "), v: String(2 + index * .01) })),
        ] });
      }
      if (url.hostname === "cdip.ucsd.edu" && url.pathname.endsWith("sccoos.cdip")) return new Response(`<pre>${utcStamp()}\t100\tTORREY PINES OUTER, CA\t32.93\t-117.392\t57196\t1.1\t13.0\t235\t20.0</pre>`);
      if (url.hostname === "cdip.ucsd.edu" && url.pathname.endsWith("ndar.cdip")) return new Response(`<pre>${compactUtc()} 20 210 40 215 80 220 120 225 160 230 210 235 260 240 40 250 20 270</pre>`);
      if (url.hostname === "thredds.cdip.ucsd.edu") {
        const station = url.pathname.match(/(D\d{4})_forecast/)?.[1] ?? "D0000";
        return new Response(mopSpectralCsv(station));
      }
      if (url.hostname === "www.ndbc.noaa.gov") return new Response(ndbcRow());
      throw new Error(`Unexpected URL ${url}`);
    };

    const route = await import(`../app/api/conditions/route.ts?spectral=${Date.now()}`);
    const payload = await (await route.GET()).json();
    assert.equal(payload.mode, "live");
    assert.match(payload.providers.mop.detail, /7 include forecast spectral partitions/);
    assert.match(payload.providers.wind.detail, /North County: NWS/);
    const currentOb = payload.conditions.find((spot) => spot.name === "Ocean Beach");
    assert.equal(currentOb.windSource, "NWS");
    assert.match(currentOb.wind, /^4 kt E$/);
    assert.match(currentOb.tide, /^2\.0 ft rising$/);
    const tomorrowKey = Object.keys(payload.dailyConditions)[1];
    const futureOb = payload.dailyConditions[tomorrowKey].find((spot) => spot.name === "Ocean Beach");
    assert.ok(Number.parseInt(futureOb.period) >= 14);
    assert.match(futureOb.swell, /S|SW/);
    const typicalHigh = Number(futureOb.height.match(/\d+/g).at(-1));
    const setHigh = Number(futureOb.sets.match(/\d+/g).at(-1));
    assert.ok(setHigh > typicalHigh);
    assert.equal(futureOb.secondarySwellSource, "CDIP spectrum");
    assert.match(futureOb.dayHeight, /^\d+–\d+ ft$/);
    assert.match(futureOb.daySets, /^\d+–\d+ ft$/);
    assert.match(futureOb.dayPeak, /AM|PM/);
    assert.match(futureOb.daySource, /Nearshore model|Regional planning guide/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("each MOP spot survives independently and missing wind is never fabricated", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com" || url.hostname === "api.open-meteo.com" || url.hostname === "api.weather.gov") throw new Error("forecast provider offline");
      if (url.hostname === "api.tidesandcurrents.noaa.gov") {
        if (url.searchParams.get("product") === "wind") return Response.json({ data: [] });
        return Response.json({ predictions: [
          { t: localHour(-1).replace("T", " "), v: "1.0" },
          { t: localHour(1).replace("T", " "), v: "3.0" },
        ] });
      }
      if (url.hostname === "thredds.cdip.ucsd.edu") {
        const station = url.pathname.match(/(D\d{4})_forecast/)?.[1] ?? "D0000";
        if (station === "D0708") throw new Error("Swami's point unavailable");
        return new Response(mopCsv(station));
      }
      if (url.hostname === "www.ndbc.noaa.gov") return new Response(ndbcRow());
      throw new Error("supporting observation unavailable");
    };

    const route = await import(`../app/api/conditions/route.ts?per-spot=${Date.now()}`);
    const payload = await (await route.GET()).json();
    assert.equal(payload.mode, "partial");
    assert.equal(payload.conditions.length, 16);
    assert.ok(payload.conditions.some((spot) => spot.name === "Trestles"));
    assert.ok(!payload.conditions.some((spot) => spot.name === "Swami’s"));
    const trestles = payload.conditions.find((spot) => spot.name === "Trestles");
    assert.equal(trestles.wind, "Forecast unavailable");
    assert.ok(trestles.confidenceScore <= 59);
    assert.ok(trestles.score >= 18);
    assert.doesNotMatch(trestles.best, /No daylight|9 PM|10 PM|11 PM/);
    assert.match(payload.providers.wind.detail, /missing wind is shown as unavailable, never fabricated/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing tide stations never fabricate values or receive an ideal-tide score", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = tideScenarioFetch();
    const healthyRoute = await import(`../app/api/conditions/route.ts?tides-healthy=${Date.now()}`);
    const healthy = await (await healthyRoute.GET()).json();
    const healthyCoronado = healthy.conditions.find((spot) => spot.name === "Coronado");
    assert.match(healthyCoronado.tide, /^2\.5 ft/);

    globalThis.fetch = tideScenarioFetch(new Set(["9410170"]));
    const partialRoute = await import(`../app/api/conditions/route.ts?tides-partial=${Date.now()}`);
    const partial = await (await partialRoute.GET()).json();
    const partialCoronado = partial.conditions.find((spot) => spot.name === "Coronado");
    const partialBlacks = partial.conditions.find((spot) => spot.name === "Blacks");
    assert.equal(partial.mode, "partial");
    assert.equal(partial.providers.tides.ok, false);
    assert.match(partial.providers.tides.detail, /^1\/2 stations have complete five-day coverage/);
    assert.equal(partialCoronado.tide, "Forecast unavailable");
    assert.match(partialCoronado.summary, /tide forecast unavailable/);
    assert.match(partialBlacks.tide, /^2\.5 ft/);
    assert.equal(healthyCoronado.currentScore - partialCoronado.currentScore, 10);
    assert.ok(partialCoronado.confidenceScore < healthyCoronado.confidenceScore);
    const southBayNames = new Set(["Coronado", "Imperial Beach"]);
    assert.ok(Object.values(partial.dailyConditions).every((day) => day
      .filter((spot) => southBayNames.has(spot.name))
      .every((spot) => spot.tide === "Forecast unavailable")));

    globalThis.fetch = tideScenarioFetch(new Set(["9410230", "9410170"]));
    const outageRoute = await import(`../app/api/conditions/route.ts?tides-outage=${Date.now()}`);
    const outage = await (await outageRoute.GET()).json();
    assert.equal(outage.providers.tides.ok, false);
    assert.match(outage.providers.tides.detail, /^0\/2 stations have complete five-day coverage/);
    assert.ok(outage.conditions.every((spot) => spot.tide === "Forecast unavailable"));
    assert.ok(outage.conditions.every((spot) => /tide forecast unavailable/.test(spot.summary)));
    assert.ok(Object.values(outage.dailyConditions).every((day) => day.every((spot) => spot.tide === "Forecast unavailable")));

    globalThis.fetch = tideScenarioFetch(new Set(), new Map([["9410170", [
      { t: localHour().replace("T", " "), v: " " },
      { t: localHour(1).replace("T", " "), v: null },
    ]]]));
    const malformedRoute = await import(`../app/api/conditions/route.ts?tides-malformed=${Date.now()}`);
    const malformed = await (await malformedRoute.GET()).json();
    assert.equal(malformed.providers.tides.ok, false);
    assert.equal(malformed.conditions.find((spot) => spot.name === "Coronado").tide, "Forecast unavailable");

    globalThis.fetch = tideScenarioFetch(new Set(), new Map([["9410170", [
      { t: localHour().replace("T", " "), v: "2.5" },
      { t: localHour(120).replace("T", " "), v: "2.7" },
    ]]]));
    const gappyRoute = await import(`../app/api/conditions/route.ts?tides-gappy=${Date.now()}`);
    const gappy = await (await gappyRoute.GET()).json();
    assert.equal(gappy.providers.tides.ok, false);
    assert.match(gappy.conditions.find((spot) => spot.name === "Coronado").tide, /^2\.5 ft$/);
    assert.ok(Object.values(gappy.dailyConditions).slice(1).every((day) => day
      .filter((spot) => southBayNames.has(spot.name))
      .every((spot) => spot.tide === "Forecast unavailable")));

    const currentLocalHour = Number(localHour().slice(11, 13));
    const hoursToFinalDisplayedDaylight = 4 * 24 + 19 - currentLocalHour;
    const almostComplete = tideRows().slice(0, hoursToFinalDisplayedDaylight);
    globalThis.fetch = tideScenarioFetch(new Set(), new Map([["9410170", almostComplete]]));
    const shortHorizonRoute = await import(`../app/api/conditions/route.ts?tides-short-horizon=${Date.now()}`);
    const shortHorizon = await (await shortHorizonRoute.GET()).json();
    assert.equal(shortHorizon.providers.tides.ok, false);
    assert.match(shortHorizon.providers.tides.detail, /^1\/2 stations have complete five-day coverage/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a missing wave component at the current hour is unavailable rather than defaulted", async () => {
  const originalFetch = globalThis.fetch;
  const baseFetch = tideScenarioFetch();
  const centralMopIds = new Set(["D0537", "D0500", "D0457", "D0416", "D0406", "D0348", "D0318"]);
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        const forecast = { hourly: {
          time: times,
          wave_height: filled(1.2), wave_direction: filled(230), wave_period: filled(12),
          swell_wave_height: filled(1.0), swell_wave_direction: filled(225), swell_wave_period: filled(13),
          secondary_swell_wave_height: filled(.3), secondary_swell_wave_direction: filled(285), secondary_swell_wave_period: filled(8),
        } };
        const central = structuredClone(forecast);
        for (const key of ["wave_height", "wave_direction", "wave_period", "swell_wave_height", "swell_wave_direction", "swell_wave_period", "secondary_swell_wave_height", "secondary_swell_wave_direction", "secondary_swell_wave_period"]) {
          central.hourly[key][0] = null;
        }
        return Response.json([forecast, central, forecast]);
      }
      if (url.hostname === "thredds.cdip.ucsd.edu") {
        const station = url.pathname.match(/(D\d{4})_forecast/)?.[1] ?? "D0000";
        if (centralMopIds.has(station)) throw new Error(`current ${station} data unavailable`);
      }
      return baseFetch(input);
    };

    const route = await import(`../app/api/conditions/route.ts?missing-current-wave=${Date.now()}`);
    const payload = await (await route.GET()).json();
    assert.equal(payload.mode, "partial");
    assert.deepEqual(payload.liveZones, ["North County", "South Bay"]);
    assert.equal(payload.conditions.length, 10);
    const centralNames = new Set(["Blacks", "La Jolla Shores", "Windansea", "Tourmaline", "Crystal Pier", "Ocean Beach", "Sunset Cliffs"]);
    assert.ok(payload.conditions.every((spot) => !centralNames.has(spot.name)));
    assert.ok(Object.values(payload.dailyConditions).every((day) => day.every((spot) => spot.name !== "Blacks")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("future-only regional feeds cannot pose as current forecasts", async () => {
  const originalFetch = globalThis.fetch;
  const baseFetch = tideScenarioFetch();
  const futureTimes = Array.from({ length: 144 }, (_, index) => localHour(index + 24));
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        const forecast = { hourly: {
          time: futureTimes,
          wave_height: futureTimes.map(() => 1.2), wave_direction: futureTimes.map(() => 230), wave_period: futureTimes.map(() => 12),
          swell_wave_height: futureTimes.map(() => 1), swell_wave_direction: futureTimes.map(() => 225), swell_wave_period: futureTimes.map(() => 13),
        } };
        return Response.json([forecast, forecast, forecast]);
      }
      if (url.hostname === "api.open-meteo.com") {
        const weather = { hourly: { time: futureTimes, wind_speed_10m: futureTimes.map(() => 4), wind_direction_10m: futureTimes.map(() => 80) } };
        return Response.json([weather, weather, weather]);
      }
      if (url.hostname === "thredds.cdip.ucsd.edu" || url.hostname === "api.weather.gov") throw new Error("fallback unavailable");
      return baseFetch(input);
    };

    const route = await import(`../app/api/conditions/route.ts?future-only=${Date.now()}`);
    const payload = await (await route.GET()).json();
    assert.equal(payload.mode, "unavailable");
    assert.equal(payload.providers.marine.ok, false);
    assert.equal(payload.conditions.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a sparse current wind hour remains unavailable despite a live coastal observation", async () => {
  const originalFetch = globalThis.fetch;
  const baseFetch = tideScenarioFetch();
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.open-meteo.com") {
        const healthy = { hourly: { time: times, wind_speed_10m: filled(4), wind_direction_10m: filled(80) } };
        const central = structuredClone(healthy);
        central.hourly.wind_speed_10m[0] = null;
        central.hourly.wind_direction_10m[0] = null;
        return Response.json([healthy, central, healthy]);
      }
      return baseFetch(input);
    };

    const route = await import(`../app/api/conditions/route.ts?sparse-current-wind=${Date.now()}`);
    const payload = await (await route.GET()).json();
    const blacks = payload.conditions.find((spot) => spot.name === "Blacks");
    assert.equal(payload.mode, "partial");
    assert.equal(blacks.wind, "Forecast unavailable");
    assert.equal(payload.providers.wind.ok, false);
    assert.equal(payload.providers.windObservation.ok, false);
    assert.match(payload.providers.wind.detail, /never fabricated/);
    assert.doesNotMatch(blacks.confidenceReason, /La Jolla wind adjusted/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("null forecast tails and malformed timelines cannot claim five-day coverage", async () => {
  const originalFetch = globalThis.fetch;
  const baseFetch = tideScenarioFetch();
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        const forecast = { hourly: {
          time: times,
          wave_height: filled(1.2), wave_direction: filled(230), wave_period: filled(12),
          swell_wave_height: filled(1), swell_wave_direction: filled(225), swell_wave_period: filled(13),
        } };
        for (const key of ["wave_height", "wave_direction", "wave_period", "swell_wave_height", "swell_wave_direction", "swell_wave_period"]) {
          forecast.hourly[key].fill(null, 48);
        }
        return Response.json([forecast, forecast, forecast]);
      }
      if (url.hostname === "thredds.cdip.ucsd.edu" || url.hostname === "api.weather.gov") throw new Error("fallback unavailable");
      return baseFetch(input);
    };
    const nullTailRoute = await import(`../app/api/conditions/route.ts?null-wave-tail=${Date.now()}`);
    const nullTail = await (await nullTailRoute.GET()).json();
    assert.equal(nullTail.mode, "unavailable");
    assert.equal(nullTail.providers.marine.ok, false);

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com") {
        const malformedTimes = [...times];
        malformedTimes[malformedTimes.length - 1] = "not-a-time";
        const forecast = { hourly: { time: malformedTimes, wave_height: filled(1.2), wave_direction: filled(230), wave_period: filled(12) } };
        return Response.json([forecast, forecast, forecast]);
      }
      if (url.hostname === "thredds.cdip.ucsd.edu" || url.hostname === "api.weather.gov") throw new Error("fallback unavailable");
      return baseFetch(input);
    };
    const malformedRoute = await import(`../app/api/conditions/route.ts?malformed-wave-time=${Date.now()}`);
    const malformed = await (await malformedRoute.GET()).json();
    assert.equal(malformed.mode, "unavailable");
    assert.equal(malformed.providers.marine.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wind tail gaps remain unavailable on future days", async () => {
  const originalFetch = globalThis.fetch;
  const baseFetch = tideScenarioFetch();
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "api.open-meteo.com") {
        const weather = { hourly: { time: times, wind_speed_10m: filled(4), wind_direction_10m: filled(80) } };
        weather.hourly.wind_speed_10m.fill(null, 48);
        weather.hourly.wind_direction_10m.fill(null, 48);
        return Response.json([weather, weather, weather]);
      }
      if (url.hostname === "api.weather.gov") throw new Error("wind fallback unavailable");
      return baseFetch(input);
    };
    const route = await import(`../app/api/conditions/route.ts?null-wind-tail=${Date.now()}`);
    const payload = await (await route.GET()).json();
    assert.equal(payload.mode, "partial");
    assert.equal(payload.providers.wind.ok, false);
    assert.ok(Object.values(payload.dailyConditions).slice(2).every((day) => day.every((spot) => spot.wind === "Forecast unavailable")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("gappy MOP feeds and invalid NDBC values are rejected", async () => {
  const originalFetch = globalThis.fetch;
  const baseFetch = tideScenarioFetch();
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "marine-api.open-meteo.com" || url.hostname === "api.open-meteo.com" || url.hostname === "api.weather.gov") throw new Error("regional provider unavailable");
      if (url.hostname === "thredds.cdip.ucsd.edu") return new Response(gappyMopCsv(url.pathname.match(/(D\d{4})_forecast/)?.[1] ?? "D0000"));
      return baseFetch(input);
    };
    const gappyRoute = await import(`../app/api/conditions/route.ts?gappy-mop=${Date.now()}`);
    const gappy = await (await gappyRoute.GET()).json();
    assert.equal(gappy.mode, "unavailable");
    assert.equal(gappy.providers.mop.ok, false);

    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname === "cdip.ucsd.edu" && url.pathname.endsWith("sccoos.cdip")) throw new Error("local buoys unavailable");
      if (url.hostname === "www.ndbc.noaa.gov") return new Response(ndbcRow().replace(" 1.2 12 ", " 999 12 "));
      return baseFetch(input);
    };
    const buoyRoute = await import(`../app/api/conditions/route.ts?invalid-buoy=${Date.now()}`);
    const buoy = await (await buoyRoute.GET()).json();
    assert.equal(buoy.providers.buoy.ok, false);
    assert.ok(buoy.conditions.every((spot) => spot.water === "—"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
