"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SurfMap from "./SurfMap";
import { isFutureForecastDate, sanDiegoDateKey } from "../lib/forecast/dates";

type Zone = "North County" | "Central" | "South Bay";
type Rating = "Excellent" | "Good" | "Fair" | "Poor" | "Unavailable";

type Spot = {
  name: string;
  zone: Zone;
  height: string;
  sets?: string;
  rating: Rating;
  swell: string;
  period: string;
  wind: string;
  tide: string;
  water: string;
  crowd: string;
  best: string;
  score: number;
  swellDegrees: number | null;
  lat: number;
  lon: number;
  secondarySwell?: string;
  secondarySwellSource?: string;
  confidence?: "High" | "Medium" | "Low";
  confidenceScore?: number;
  confidenceReason?: string;
  modelPoint?: string;
  windSource?: "Open-Meteo" | "NWS" | "Unavailable";
  summary?: string;
  hourly?: HourlyPoint[];
};

type SpotDefinition = Pick<Spot, "name" | "zone" | "lat" | "lon">;

const spotDefinitions: SpotDefinition[] = [
  { name: "Trestles", zone: "North County", lat: 33.3833, lon: -117.5937 },
  { name: "Oceanside", zone: "North County", lat: 33.1937, lon: -117.3831 },
  { name: "Tamarack", zone: "North County", lat: 33.1477, lon: -117.3508 },
  { name: "Ponto", zone: "North County", lat: 33.0916, lon: -117.3160 },
  { name: "Grandview", zone: "North County", lat: 33.0774, lon: -117.3086 },
  { name: "Swami’s", zone: "North County", lat: 33.0344, lon: -117.2926 },
  { name: "Cardiff Reef", zone: "North County", lat: 33.0134, lon: -117.2850 },
  { name: "Del Mar", zone: "North County", lat: 32.9595, lon: -117.2686 },
  { name: "Blacks", zone: "Central", lat: 32.8875, lon: -117.2533 },
  { name: "La Jolla Shores", zone: "Central", lat: 32.8570, lon: -117.2571 },
  { name: "Windansea", zone: "Central", lat: 32.8313, lon: -117.2818 },
  { name: "Tourmaline", zone: "Central", lat: 32.8057, lon: -117.2610 },
  { name: "Crystal Pier", zone: "Central", lat: 32.7976, lon: -117.2574 },
  { name: "Ocean Beach", zone: "Central", lat: 32.7495, lon: -117.2526 },
  { name: "Sunset Cliffs", zone: "Central", lat: 32.7202, lon: -117.2572 },
  { name: "Coronado", zone: "South Bay", lat: 32.6800, lon: -117.1835 },
  { name: "Imperial Beach", zone: "South Bay", lat: 32.5791, lon: -117.1324 },
];

const zoneDefaults: Record<Zone, string> = {
  "North County": "Swami’s",
  Central: "Blacks",
  "South Bay": "Coronado",
};

type HourlyPoint = { time: string; height: number; wind: number | null; score: number };
type DailyCondition = Partial<Spot> & { name: string; hourly?: HourlyPoint[] };
type ZoneSeries = Record<string, {
  hourly?: HourlyPoint[];
  days?: Array<{ dateKey: string; day: string; date: string; height: string; sets?: string; rating: Rating; period: string }>;
}>;

type ConditionsPayload = {
  mode: "live" | "partial" | "unavailable";
  generatedAt: string;
  cache?: { state: "origin" | "fresh-cache" | "stale-cache"; storedAt: string; ageSeconds: number; refreshError?: string };
  conditions?: Array<Partial<Spot> & { name: string }>;
  dailyConditions?: Record<string, DailyCondition[]>;
  zones?: ZoneSeries;
  buoy?: { observedAt?: string | null } | null;
  liveZones?: Zone[];
  providers?: Record<string, { ok: boolean; detail: string; checkedAt: string; dataTimestamp?: string }>;
};

function unavailableSpot(spot: SpotDefinition): Spot {
  return {
    ...spot,
    height: "—",
    rating: "Unavailable",
    swell: "—",
    period: "—",
    wind: "—",
    tide: "—",
    water: "—",
    crowd: "—",
    best: "Data unavailable",
    score: 0,
    swellDegrees: null,
    secondarySwell: "—",
    confidence: "Low",
    confidenceScore: 0,
    confidenceReason: "Live forecast unavailable",
    modelPoint: "Unavailable",
    summary: "Waiting for live source data",
    hourly: [],
  };
}

function normalizeDayLabel<T extends { dateKey: string; day: string; date: string }>(day: T): T {
  const parsed = new Date(`${day.dateKey}T12:00:00-07:00`);
  if (!Number.isFinite(parsed.getTime())) return day;
  return {
    ...day,
    day: day.dateKey === sanDiegoDateKey() ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Los_Angeles" }).format(parsed),
    date: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(parsed),
  };
}

function Icon({ name }: { name: "wave" | "wind" | "tide" | "temp" | "clock" | "arrow" | "spark" }) {
  const paths = {
    wave: <path d="M3 16c3.5 0 3.5-8 7-8s3.5 8 7 8c2 0 3-1.6 4-3.2M3 20c4 0 4-3 8-3s4 3 8 3" />,
    wind: <path d="M3 8h10c3.5 0 3.5-5 0-5-1.4 0-2.4.7-2.8 1.7M3 12h15c3.5 0 3.5 5 0 5-1.4 0-2.4-.7-2.8-1.7M3 16h7" />,
    tide: <path d="M4 16c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2M12 3v8m-3-3 3 3 3-3" />,
    temp: <path d="M9 14.8V5a3 3 0 0 1 6 0v9.8a5 5 0 1 1-6 0Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M5 19 19 5" /><path d="M10 5h9v9" /></>,
    spark: <path d="m12 2 1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2Zm7 14 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Logo() {
  return (
    <div className="logo-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function QualityTrend({ hours, future = false }: { hours: Array<{ time: string; score: number }>; future?: boolean }) {
  if (!hours.length) return <p className="forecast-unavailable">Regional forecast temporarily unavailable.</p>;
  const width = 600;
  const baseline = 82;
  const top = 15;
  const points = hours.map((hour, index) => ({
    ...hour,
    x: hours.length === 1 ? width / 2 : 12 + index * ((width - 24) / (hours.length - 1)),
    y: baseline - (Math.max(0, Math.min(100, hour.score)) / 100) * (baseline - top),
  }));
  const line = points.map((point, index) => `${index ? "L" : "M"} ${point.x} ${point.y}`).join(" ");
  const area = `${line} L ${points.at(-1)?.x ?? width - 12} ${baseline} L ${points[0].x} ${baseline} Z`;
  const peak = points.reduce((best, point) => point.score > best.score ? point : best, points[0]);

  return (
    <div className="quality-trend" role="img" aria-label={`${future ? "Daylight" : "Next six hours"} quality trend, peaking at ${peak.score} out of 100 around ${peak.time}`}>
      <div className="trend-heading">
        <span><small>{future ? "Daylight outlook" : "Next 6 hours"}</small><b>Quality trend</b></span>
        <strong>Peak {peak.score} <i>·</i> {peak.time}</strong>
      </div>
      <svg viewBox={`0 0 ${width} 96`} role="img" aria-hidden="true" preserveAspectRatio="none">
        <defs>
          <linearGradient id="qualityArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a63ee" stopOpacity=".26" />
            <stop offset="1" stopColor="#0a63ee" stopOpacity=".015" />
          </linearGradient>
          <linearGradient id="qualityLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#55c7d6" />
            <stop offset=".65" stopColor="#0a63ee" />
            <stop offset="1" stopColor="#174aaf" />
          </linearGradient>
        </defs>
        <path className="trend-grid" d={`M 12 32 H ${width - 12} M 12 57 H ${width - 12} M 12 ${baseline} H ${width - 12}`} />
        <path className="trend-area" d={area} />
        <path className="trend-line" d={line} />
        {points.map((point, index) => <circle key={`${point.time}-${index}`} className={point === peak ? "peak" : index === 0 ? "now" : ""} cx={point.x} cy={point.y} r={point === peak ? 5 : index === 0 ? 4 : 2.5}><title>{point.time}: {point.score}/100</title></circle>)}
      </svg>
      <div className="trend-axis"><span>{future ? hours[0].time : `Now · ${hours[0].time}`}</span><span>{hours[Math.floor(hours.length / 2)]?.time}</span><span>{hours.at(-1)?.time}</span></div>
    </div>
  );
}

export default function Home() {
  const [zone, setZone] = useState<Zone>("Central");
  const [selectedName, setSelectedName] = useState("Blacks");
  const [units, setUnits] = useState<"FT" | "M">("FT");
  const [spots, setSpots] = useState(() => spotDefinitions.map(unavailableSpot));
  const [series, setSeries] = useState<ZoneSeries>({});
  const [dailyConditions, setDailyConditions] = useState<Record<string, DailyCondition[]>>({});
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [dataMode, setDataMode] = useState<"loading" | "live" | "partial" | "cached" | "unavailable">("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [providerSummary, setProviderSummary] = useState("Forecast data refreshes every 15 minutes.");
  const spotlightRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controllers = new Set<AbortController>();
    let disposed = false;

    const loadConditions = () => {
      const controller = new AbortController();
      controllers.add(controller);
      fetch("/api/conditions?rev=13", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Conditions request returned ${response.status}`);
        return response.json() as Promise<ConditionsPayload>;
      })
      .then((payload) => {
        if (disposed || !payload.generatedAt || !Number.isFinite(new Date(payload.generatedAt).getTime())) throw new Error("Invalid conditions response");
        if ((payload.mode === "live" || payload.mode === "partial") && payload.conditions?.length) {
          const liveZones = new Set(payload.liveZones ?? []);
          setSpots(spotDefinitions.map((spot) => {
            const condition = payload.conditions?.find((item) => item.name === spot.name);
            return condition && liveZones.has(spot.zone) ? { ...unavailableSpot(spot), ...condition } : unavailableSpot(spot);
          }));
          setSeries(payload.zones ?? {});
          setDailyConditions(payload.dailyConditions ?? {});
          setSelectedDateKey((current) => current && payload.dailyConditions?.[current] ? current : null);
          setDataMode(payload.cache?.state && payload.cache.state !== "origin" ? "cached" : payload.mode);
          const providers = Object.entries(payload.providers ?? {});
          const liveCount = providers.filter(([, status]) => status.ok).length;
          const cacheNote = payload.cache?.state === "stale-cache"
            ? `Showing the last successful forecast while sources refresh${payload.cache.refreshError ? `: ${payload.cache.refreshError}` : "."} `
            : payload.cache?.state === "fresh-cache"
              ? "Showing a stored forecast; provider status reflects its generation time. "
              : "";
          setProviderSummary(providers.length ? `${cacheNote}${liveCount}/${providers.length} live data services at the stored forecast time. ${providers.map(([name, status]) => `${name}: ${status.detail}`).join(" · ")}` : "Live forecast data.");
        } else {
          setSpots(spotDefinitions.map(unavailableSpot));
          setSeries({});
          setDailyConditions({});
          setSelectedDateKey(null);
          setDataMode("unavailable");
          setProviderSummary("The live marine forecast could not be reached. No forecast values are being shown; retrying automatically.");
        }
        setUpdatedAt(new Date(payload.generatedAt));
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError" && !disposed) {
          setSpots(spotDefinitions.map(unavailableSpot));
          setSeries({});
          setDailyConditions({});
          setSelectedDateKey(null);
          setDataMode("unavailable");
          setProviderSummary("The live forecast request failed. No forecast values are being shown; retrying automatically.");
          setUpdatedAt(new Date());
        }
      })
      .finally(() => {
        controllers.delete(controller);
      });
    };

    loadConditions();
    const interval = window.setInterval(loadConditions, 15 * 60 * 1000);
    const handleVisibility = () => { if (document.visibilityState === "visible") loadConditions(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      controllers.forEach((controller) => controller.abort());
    };
  }, []);

  const todayDateKey = sanDiegoDateKey();
  const dayMetadata = series[zone]?.days?.length ? series[zone].days.map(normalizeDayLabel).filter((day) => day.dateKey >= todayDateKey) : [];
  const days = dayMetadata.map((day) => {
    const forecast = dailyConditions[day.dateKey]?.find((item) => item.name === selectedName);
    return forecast ? {
      ...day,
      height: forecast.height ?? day.height,
      rating: forecast.rating ?? day.rating,
      period: forecast.period ?? day.period,
    } : { ...day, height: "—", sets: undefined, rating: "Unavailable" as const, period: "—" };
  });
  const activeDateKey = selectedDateKey ?? days[0]?.dateKey ?? null;
  const isFuture = isFutureForecastDate(activeDateKey);
  const activeDay = days.find((day) => day.dateKey === activeDateKey) ?? days[0];
  const displayedSpots = (() => {
    if (!isFuture || !activeDateKey) return spots;
    const forecast = dailyConditions[activeDateKey] ?? [];
    return spots.map((spot) => {
      const condition = forecast.find((item) => item.name === spot.name);
      return condition ? { ...unavailableSpot(spot), ...condition } : unavailableSpot(spot);
    });
  })();
  const zoneSpots = displayedSpots.filter((spot) => spot.zone === zone);
  const selected = displayedSpots.find((spot) => spot.name === selectedName) ?? displayedSpots.find((spot) => spot.name === "Blacks") ?? displayedSpots[0];
  const hourly = selected.hourly?.length ? selected.hourly : [];
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(updatedAt)
    : "Connecting…";

  function selectZone(next: Zone) {
    setZone(next);
    setSelectedName(zoneDefaults[next]);
  }

  function focusSpot(spot: { name: string; zone: Zone }) {
    setZone(spot.zone);
    setSelectedName(spot.name);
    window.requestAnimationFrame(() => {
      if (window.innerWidth <= 1040) spotlightRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const displayHeight = (height: string) => {
    if (units === "FT") return height;
    const nums = height.match(/\d+/g)?.map(Number) ?? [];
    return nums.length === 2 ? `${(nums[0] * .3048).toFixed(1)}–${(nums[1] * .3048).toFixed(1)} m` : height;
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="San Diego Surf home">
          <Logo />
          <span>San Diego Surf</span>
          <em>County conditions</em>
        </a>

        <nav className="zone-tabs" aria-label="Surf regions">
          {(["North County", "Central", "South Bay"] as Zone[]).map((item) => (
            <button key={item} className={zone === item ? "active" : ""} aria-pressed={zone === item} onClick={() => selectZone(item)}>{item}</button>
          ))}
        </nav>

        <div className="header-tools">
          <Link className="source-link" href="/data-sources">Data sources</Link>
          <span className={`updated ${dataMode}`} title={providerSummary}>
            <i /> {dataMode === "loading" ? "Connecting live data…" : dataMode === "unavailable" ? `Forecast unavailable · ${updatedLabel}` : dataMode === "cached" ? `Cached forecast · ${updatedLabel}` : `${dataMode === "partial" ? "Partial live" : "Live"} · ${updatedLabel}`}
          </span>
          <button className="unit-toggle" onClick={() => setUnits(units === "FT" ? "M" : "FT")} aria-label="Toggle wave height units">
            <b>{units}</b><span>{units === "FT" ? "M" : "FT"}</span>
          </button>
        </div>
      </header>

      <div className="dashboard" id="top">
        <section className="map-panel" aria-label="Geographic San Diego County surf map">
          <SurfMap
            spots={displayedSpots}
            zone={zone}
            selectedName={selected.name}
            units={units}
            swellLabel={selected.swellDegrees == null ? "Swell unavailable" : `${selected.swell} ${selected.swellDegrees}°`}
            onSelect={focusSpot}
          />
        </section>

        <aside className="conditions-panel">
          <section className="forecast-strip" aria-label={`${selectedName} five-day forecast`}>
            <div className="forecast-strip-heading">
              <b>{selectedName} · 5-day forecast</b>
              <span>Best-window estimate · select a day</span>
            </div>
            <div className="day-grid">
              {days.map((day) => (
                <button
                  key={day.dateKey}
                  className={`day-card ${day.dateKey === activeDateKey ? "selected" : ""}`}
                  onClick={() => setSelectedDateKey(day.dateKey)}
                  aria-pressed={day.dateKey === activeDateKey}
                  aria-label={`${day.day}, ${day.date}: ${day.height}, ${day.period} period, ${day.rating}`}
                  title={`${day.period} period · ${day.rating}`}
                >
                  <span><b>{day.day}</b><small>{day.date}</small></span>
                  <strong>{displayHeight(day.height)}</strong>
                  <i className={day.rating.toLowerCase()} aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          <section className="primary-card spotlight-card" ref={spotlightRef} key={selected.name}>
            <div className="spotlight-best">
              <div>
                <span className="eyebrow"><Icon name="spark" /> {isFuture && activeDay ? `${activeDay.day}, ${activeDay.date} · ` : ""}Best window</span>
                <strong>{selected.best}</strong>
              </div>
              <div className="window-score"><b>{selected.score}</b><span>quality / 100</span></div>
            </div>

            <div className="spot-heading">
              <div>
                <span className="location-label">{selected.zone} · California</span>
                <h1>{selected.name}</h1>
              </div>
              <div className="spot-badges">
                {selected.confidence && <span className={`confidence ${selected.confidence.toLowerCase()}`}>Model confidence: {selected.confidence} · {selected.confidenceScore}/100</span>}
                <span className={`rating ${selected.rating.toLowerCase()}`}>{selected.rating}</span>
              </div>
            </div>

            <div className="wave-reading">
              <strong>{displayHeight(selected.height)}</strong>
              <span><b>{selected.rating === "Unavailable" ? "Awaiting forecast" : "Typical modeled faces"}</b><small>{selected.rating === "Unavailable" ? "This zone is temporarily offline" : selected.sets ? `Larger sets ${displayHeight(selected.sets)}` : selected.modelPoint?.startsWith("D") ? `CDIP ${selected.modelPoint} + break response` : "regional fallback estimate"}</small></span>
            </div>

            <div className="metrics-grid">
              <div><Icon name="wave" /><span><small>{selected.modelPoint?.startsWith("D") ? "Nearshore peak waves" : "Dominant waves"}</small><b>{selected.swell} · {selected.period}</b><em>{selected.secondarySwellSource ?? "Regional forecast partition"}: {selected.secondarySwell ?? "not resolved"}</em></span></div>
              <div><Icon name="wind" /><span><small>Wind · {selected.windSource ?? "forecast"}</small><b>{selected.wind}</b></span></div>
              <div><Icon name="tide" /><span><small>Tide</small><b>{selected.tide}</b></span></div>
              <div><Icon name="temp" /><span><small>{isFuture ? "Latest water" : "Water"}</small><b>{selected.water}</b></span></div>
            </div>

            {selected.summary && <p className="forecast-summary">{selected.summary}<span>Confidence inputs: {selected.confidenceReason}. Coverage/agreement score—not measured accuracy or probability.</span></p>}

            <QualityTrend hours={hourly} future={isFuture} />
          </section>

          <section className="nearby-card">
            <div className="section-heading"><h2>{zone} spots</h2><span>{zoneSpots.length} modeled spots</span></div>
            <div className="spot-list">
              {zoneSpots.map((spot) => (
                <button key={spot.name} className={spot.name === selected.name ? "current" : ""} aria-current={spot.name === selected.name ? "true" : undefined} onClick={() => focusSpot(spot)} title={`${spot.confidence ?? "Low"} confidence${spot.confidenceReason ? ` · ${spot.confidenceReason}` : ""}`}>
                  <span className={`quality-dot ${spot.rating.toLowerCase()}`} />
                  <span className="list-name"><b>{spot.name}</b><small>{spot.swell} · {spot.period}</small></span>
                  <strong>{displayHeight(spot.height)}</strong>
                  <span className={`compact-rating ${spot.rating.toLowerCase()}`}>{spot.rating}</span>
                  <span className="chevron">›</span>
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <footer>
        <div><Logo /><b>San Diego Surf</b></div>
        <p>One clear read on the county’s coastline.</p>
        <Link className="source-line" href="/data-sources">
          {dataMode === "loading" ? "Connecting to forecast sources" : dataMode === "unavailable" ? "Forecast unavailable—no values shown" : dataMode === "cached" ? "Last successful forecast" : dataMode === "partial" ? "Partial live estimates" : "Live estimates"} · CDIP MOP + spectra · Open-Meteo · NOAA CO-OPS
          <b>Source status & timestamps →</b>
        </Link>
      </footer>

    </main>
  );
}
