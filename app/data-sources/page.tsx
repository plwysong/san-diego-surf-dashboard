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
    role: "Break-adjacent forecast energy is separated into long-, mid-, and short-period components so a long-period swell is not hidden by a larger short-period peak.",
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
    role: "10-meter wind is aligned hour-by-hour from Open-Meteo, with the National Weather Service used automatically if that feed is rate-limited.",
    href: "https://www.weather.gov/documentation/services-web-api",
    link: "NWS API documentation",
  },
  windObservation: {
    name: "NOAA Coastal Wind",
    role: "Latest La Jolla coastal wind observation adjusts Central County’s near-term forecast only, with the adjustment decaying over time.",
    href: "https://tidesandcurrents.noaa.gov/met.html?id=9410230",
    link: "La Jolla meteorological observations",
  },
  tides: {
    name: "NOAA CO-OPS",
    role: "Hourly tide predictions from La Jolla station 9410230 and San Diego station 9410170.",
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
    fetch("/api/conditions?rev=12&view=sources", { cache: "no-store", signal: controller.signal })
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

  const overall = error ? "Unavailable" : !payload ? "Checking" : payload.cache?.state === "stale-cache" ? "Last successful forecast" : payload.mode === "live" ? "All systems live" : payload.mode === "partial" ? "Partial live data" : "Live feed unavailable";

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
        <div className={`sources-overall ${payload?.mode ?? (error ? "unavailable" : "loading")}`}>
          <i />
          <div><small>Current pipeline status</small><b>{overall}</b></div>
          <time>{payload ? `${payload.cache?.state === "stale-cache" ? "Forecast stored" : "Dashboard generated"} ${formatTimestamp(payload.generatedAt)}` : error ? "Automatic retry occurs on the next request" : "Contacting providers…"}</time>
        </div>
        {payload?.cache?.state === "stale-cache" && <p className="sources-cache-note">A provider refresh is delayed, so the dashboard is serving the most recent successful real forecast instead of sample data. {payload.cache.refreshError ?? "Refresh will retry automatically."}</p>}
      </section>

      <section className="provider-grid" aria-label="Live data provider status">
        {Object.entries(providerInfo).map(([key, info]) => {
          const status = payload?.providers?.[key];
          const state = !status ? "loading" : status.ok ? "ok" : "down";
          return (
            <article className={`provider-card ${state}`} key={key}>
              <div className="provider-card-heading">
                <div><span className={`provider-dot ${status?.ok ? "ok" : status ? "down" : "loading"}`} /><h2>{info.name}</h2></div>
                <b>{status ? status.ok ? "Live" : "Degraded" : "Checking"}</b>
              </div>
              <p>{info.role}</p>
              <dl>
                <div><dt>Status detail</dt><dd>{status?.detail ?? "Waiting for response"}</dd></div>
                <div><dt>Last checked</dt><dd>{formatTimestamp(status?.checkedAt ?? payload?.generatedAt)}</dd></div>
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
        <div><span className="eyebrow">How Forecast v3 works</span><h2>Nearshore spectral guidance, checked against what the ocean is doing now.</h2></div>
        <p>Each break is paired with its nearest CDIP MOP point, shoreline orientation, tide range, and an empirical break-response multiplier. Long-, mid-, and short-period energy is transformed separately using direction and period, then recombined into typical modeled faces and a larger-set range. Tide values are interpolated to the forecast time; missing wind is labeled instead of invented. Regional buoy agreement affects confidence, and the La Jolla wind observation adjusts only Central County’s near-term wind. Future-day confidence is capped as the horizon grows. These are guidance—not lifeguard reports or a substitute for observing local conditions.</p>
      </section>
    </main>
  );
}
