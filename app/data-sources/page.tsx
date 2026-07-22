"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProviderStatus = {
  ok: boolean;
  detail: string;
  checkedAt: string;
  dataTimestamp?: string;
};

type Payload = {
  mode: "live" | "partial" | "unavailable";
  generatedAt: string;
  providers?: Record<string, ProviderStatus>;
  buoy?: { observedAt?: string | null } | null;
};

const providerInfo = {
  marine: {
    name: "Open-Meteo Marine",
    role: "Offshore wave height, direction, period, and swell forecast for three county zones.",
    href: "https://open-meteo.com/en/docs/marine-weather-api",
    link: "Marine API documentation",
  },
  wind: {
    name: "Open-Meteo Weather",
    role: "10-meter wind speed and direction aligned hour-by-hour with the marine forecast.",
    href: "https://open-meteo.com/en/docs",
    link: "Weather API documentation",
  },
  tides: {
    name: "NOAA CO-OPS",
    role: "Hourly tide predictions from La Jolla station 9410230 and San Diego station 9410170.",
    href: "https://tidesandcurrents.noaa.gov/",
    link: "NOAA Tides & Currents",
  },
  buoy: {
    name: "CDIP / NDBC 46225",
    role: "Observed wave height, dominant period, mean wave direction, and water temperature.",
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
    fetch("/api/conditions?rev=6&view=sources", { cache: "no-store", signal: controller.signal })
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

  const overall = error ? "Unavailable" : !payload ? "Checking" : payload.mode === "live" ? "All systems live" : payload.mode === "partial" ? "Partial live data" : "Live feed unavailable";

  return (
    <main className="sources-page">
      <header className="sources-nav">
        <Link href="/" className="sources-brand"><span>≋</span> San Diego Surf</Link>
        <Link href="/">← Back to dashboard</Link>
      </header>

      <section className="sources-hero">
        <span className="eyebrow">Data provenance</span>
        <h1>Source status & timestamps</h1>
        <p>Every surf estimate is derived from these public feeds. “Checked” is when this dashboard successfully requested the provider; “observed” is the timestamp reported by the buoy itself.</p>
        <div className={`sources-overall ${payload?.mode ?? (error ? "unavailable" : "loading")}`}>
          <i />
          <div><small>Current pipeline status</small><b>{overall}</b></div>
          <time>{payload ? `Dashboard generated ${formatTimestamp(payload.generatedAt)}` : error ? "Automatic retry occurs on the next request" : "Contacting providers…"}</time>
        </div>
      </section>

      <section className="provider-grid" aria-label="Live data provider status">
        {Object.entries(providerInfo).map(([key, info]) => {
          const status = payload?.providers?.[key];
          return (
            <article className="provider-card" key={key}>
              <div className="provider-card-heading">
                <div><span className={`provider-dot ${status?.ok ? "ok" : status ? "down" : "loading"}`} /><h2>{info.name}</h2></div>
                <b>{status ? status.ok ? "Live" : "Degraded" : "Checking"}</b>
              </div>
              <p>{info.role}</p>
              <dl>
                <div><dt>Status detail</dt><dd>{status?.detail ?? "Waiting for response"}</dd></div>
                <div><dt>Last checked</dt><dd>{formatTimestamp(status?.checkedAt ?? payload?.generatedAt)}</dd></div>
                {key === "buoy" && <div><dt>Observation time</dt><dd>{formatTimestamp(status?.dataTimestamp ?? payload?.buoy?.observedAt)}</dd></div>}
              </dl>
              <a href={info.href} target="_blank" rel="noreferrer">{info.link} ↗</a>
            </article>
          );
        })}
      </section>

      <section className="method-note">
        <div><span className="eyebrow">How estimates are made</span><h2>Public offshore data, translated to individual breaks.</h2></div>
        <p>Wave and wind forecasts are sampled offshore in North County, Central San Diego, and South Bay. The dashboard applies each break’s swell exposure and shoaling profile, then combines that estimate with tide and wind. These are modeled estimates—not lifeguard reports or a substitute for observing local conditions.</p>
      </section>
    </main>
  );
}
