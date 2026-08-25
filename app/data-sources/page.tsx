"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProviderStatus = {
  ok: boolean;
  detail: string;
  checkedAt: string;
  dataTimestamp?: string;
  validThrough?: string;
};

type Payload = {
  mode: "live" | "partial" | "unavailable";
  generatedAt: string;
  cache?: { state: "origin" | "fresh-cache" | "stale-cache"; storedAt: string; ageSeconds: number; refreshError?: string };
  providers?: Record<string, ProviderStatus>;
  buoy?: { observedAt?: string | null } | null;
};

const providerInfo = {
  mop: {
    name: "CDIP MOP Nearshore",
    role: "A break-adjacent wave forecast at a mapped 10-meter-depth model point for each of the dashboard’s 17 breaks.",
    href: "https://cdip.ucsd.edu/m/documents/data_access.html",
    link: "CDIP model data documentation",
  },
  cdip: {
    name: "CDIP Local Buoys",
    role: "Fresh San Diego-area observations used for a regional model-agreement check and the latest water temperature.",
    href: "https://cdip.ucsd.edu/m/stn_table/",
    link: "CDIP recent observations",
  },
  spectra: {
    name: "CDIP Spectral Components",
    role: "Break-adjacent forecast energy is separated into long-, mid-, and short-period components so a long-period swell is not hidden by a larger short-period peak. The Torrey Pines observed spectrum is source monitoring only.",
    href: "https://cdip.ucsd.edu/m/documents/data_access.html",
    link: "CDIP spectral access",
  },
  marine: {
    name: "Open-Meteo Marine",
    role: "Regional wave guidance and secondary-swell components used as an independent reference and fallback.",
    href: "https://open-meteo.com/en/docs/marine-weather-api",
    link: "Marine API documentation",
  },
  wind: {
    name: "Open-Meteo + NWS Wind",
    role: "10-meter wind is requested at all 17 breaks and aligned hour-by-hour. An isolated zone or National Weather Service forecast is used when spot-scale guidance is unavailable.",
    href: "https://www.weather.gov/documentation/services-web-api",
    link: "NWS API documentation",
  },
  windObservation: {
    name: "NOAA Coastal Wind",
    role: "Latest La Jolla coastal wind observation adjusts Central County’s near-term forecast only, with the adjustment decaying over time.",
    href: "https://tidesandcurrents.noaa.gov/met.html?id=9410230",
    link: "La Jolla meteorological observations",
  },
  waterLevel: {
    name: "NOAA Observed Water Level",
    role: "Measured water level compared against the harmonic prediction. The difference is storm surge, pressure and seasonal effects, and is carried forward onto the tide forecast with decay rather than being ignored.",
    href: "https://tidesandcurrents.noaa.gov/waterlevels.html?id=9410230",
    link: "La Jolla water levels",
  },
  daylight: {
    name: "Daylight Window",
    role: "Surfable hours are bounded by actual sunrise and sunset for each day rather than a fixed range, so a best window is never recommended after dark. In San Diego the usable window varies by more than three hours between summer and winter.",
    href: "https://open-meteo.com/en/docs",
    link: "Open-Meteo daily variables",
  },
  tides: {
    name: "NOAA CO-OPS",
    role: "Hourly tide predictions from La Jolla and San Diego, validated across all five displayed days and interpolated only between nearby source hours.",
    href: "https://tidesandcurrents.noaa.gov/",
    link: "NOAA Tides & Currents",
  },
  buoy: {
    name: "NDBC 46225 Fallback",
    role: "Offshore wave and water-temperature observation retained as a fallback if richer local CDIP observations are unavailable.",
    href: "https://www.ndbc.noaa.gov/station_page.php?station=46225",
    link: "Buoy 46225 station page",
  },
} as const;

function formatTimestamp(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

export default function DataSourcesPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/conditions?rev=14&view=sources", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<Payload>;
      })
      .then((data) => setPayload(data))
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setError(true);
      });
    return () => controller.abort();
  }, []);

  const isCached = payload?.cache?.state === "fresh-cache" || payload?.cache?.state === "stale-cache";
  const overall = error ? "Unavailable" : !payload ? "Checking" : isCached ? "Stored forecast" : payload.mode === "live" ? "Core forecast live" : payload.mode === "partial" ? "Partial live data" : "Live feed unavailable";

  return (
    <main className="sources-page">
      <header className="sources-nav">
        <Link href="/" className="sources-brand"><span>≋</span> San Diego Surf</Link>
        <Link href="/">← Back to dashboard</Link>
      </header>

      <section className="sources-hero">
        <span className="eyebrow">Data provenance</span>
        <h1>Source status & timestamps</h1>
        <p>Every surf estimate is derived from these public feeds. “Checked” is when the dashboard requested the provider, “observation time” comes from a measured feed, and “forecast valid through” is the end of the model or prediction coverage used.</p>
        <div className={`sources-overall ${isCached ? "cached" : payload?.mode ?? (error ? "unavailable" : "loading")}`}>
          <i />
          <div><small>Current pipeline status</small><b>{overall}</b></div>
          <time>{payload ? `Forecast generated ${formatTimestamp(payload.generatedAt)}` : error ? "Automatic retry occurs on the next request" : "Contacting providers…"}</time>
        </div>
        {isCached && <p className="sources-cache-note">This is a stored real forecast, not a current provider check. {payload?.cache?.state === "stale-cache" ? payload.cache.refreshError ?? "A refresh is delayed and will retry automatically." : "Provider status below reflects the forecast generation time."}</p>}
      </section>

      <section className="provider-grid" aria-label="Forecast data provider status">
        {Object.entries(providerInfo).map(([key, info]) => {
          const status = payload?.providers?.[key];
          const state = !status ? "loading" : status.ok ? "ok" : "down";
          return (
            <article className={`provider-card ${state}`} key={key}>
              <div className="provider-card-heading">
                <div><span className={`provider-dot ${status?.ok ? "ok" : status ? "down" : "loading"}`} /><h2>{info.name}</h2></div>
                <b>{status ? isCached ? status.ok ? "Stored OK" : "Stored issue" : status.ok ? "Live" : "Degraded" : "Checking"}</b>
              </div>
              <p>{info.role}</p>
              <dl>
                <div><dt>Status detail</dt><dd>{status?.detail ?? "Waiting for response"}</dd></div>
                <div><dt>{isCached ? "Checked for stored forecast" : "Last checked"}</dt><dd>{formatTimestamp(status?.checkedAt ?? payload?.generatedAt)}</dd></div>
                {status?.dataTimestamp && <div><dt>Observation time</dt><dd>{formatTimestamp(status.dataTimestamp)}</dd></div>}
                {status?.validThrough && <div><dt>Forecast valid through</dt><dd>{formatTimestamp(status.validThrough)}</dd></div>}
                {key === "buoy" && !status?.dataTimestamp && <div><dt>Observation time</dt><dd>{formatTimestamp(payload?.buoy?.observedAt)}</dd></div>}
              </dl>
              <a href={info.href} target="_blank" rel="noreferrer">{info.link} ↗</a>
            </article>
          );
        })}
      </section>

      <section className="method-note">
        <div><span className="eyebrow">How Forecast v4 works</span><h2>Nearshore spectral guidance for now—and a clearer five-day planning outlook.</h2></div>
        <p>Each break is paired with its nearest CDIP MOP point, shoreline orientation, tide range, and period-aware break response. Long-, mid-, and short-period energy is transformed separately, then recombined into typical modeled faces and a distinct larger-set range. The five-day strip uses the largest coherent daytime response so an incoming build is not hidden by a cleaner morning window. Breaks explicitly calibrated for a regional upside check may also use the independent regional planning guide; the selected range always comes from one source and hour, and components from the two models are never mixed. Selecting a day shows the separate best-window estimate. Wind is requested at every break, with isolated fallbacks that never invent missing values. “Data confidence” measures freshness, coverage, horizon, and source agreement. Forecast skill—how closely past forecasts matched what actually happened—is not measured, so nothing here should be read as an accuracy figure. These are guidance—not lifeguard reports or a substitute for observing local conditions.</p>
      </section>
    </main>
  );
}
