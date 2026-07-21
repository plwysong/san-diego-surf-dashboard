"use client";

import { useEffect, useMemo, useState } from "react";
import SurfMap from "./SurfMap";

type Zone = "North County" | "Central" | "South Bay";
type Rating = "Excellent" | "Good" | "Fair" | "Poor";

type Spot = {
  name: string;
  zone: Zone;
  height: string;
  rating: Rating;
  swell: string;
  period: string;
  wind: string;
  tide: string;
  water: string;
  crowd: string;
  best: string;
  score: number;
  swellDegrees: number;
  lat: number;
  lon: number;
};

const initialSpots: Spot[] = [
  { name: "Trestles", zone: "North County", height: "3–5 ft", rating: "Good", swell: "SSW", swellDegrees: 195, period: "14s", wind: "2 kt E", tide: "2.4 ft rising", water: "70°", crowd: "Busy", best: "6 AM–9 AM", score: 82, lat: 33.3833, lon: -117.5937 },
  { name: "Oceanside", zone: "North County", height: "2–4 ft", rating: "Fair", swell: "SSW", swellDegrees: 195, period: "13s", wind: "3 kt ESE", tide: "2.5 ft rising", water: "70°", crowd: "Moderate", best: "6 AM–9 AM", score: 66, lat: 33.1937, lon: -117.3831 },
  { name: "Swami’s", zone: "North County", height: "3–5 ft", rating: "Good", swell: "SSW", swellDegrees: 195, period: "14s", wind: "2 kt E", tide: "2.7 ft rising", water: "70°", crowd: "Busy", best: "6 AM–9 AM", score: 81, lat: 33.0344, lon: -117.2926 },
  { name: "Blacks", zone: "Central", height: "4–6 ft", rating: "Excellent", swell: "WNW", swellDegrees: 285, period: "15s", wind: "3 kt E", tide: "2.8 ft rising", water: "69°", crowd: "Moderate", best: "6 AM–9 AM", score: 94, lat: 32.8875, lon: -117.2533 },
  { name: "Windansea", zone: "Central", height: "2–4 ft", rating: "Fair", swell: "W", swellDegrees: 270, period: "13s", wind: "3 kt E", tide: "2.9 ft rising", water: "69°", crowd: "Light", best: "6 AM–9 AM", score: 64, lat: 32.8313, lon: -117.2818 },
  { name: "Tourmaline", zone: "Central", height: "2–3 ft", rating: "Good", swell: "W", swellDegrees: 270, period: "12s", wind: "2 kt ENE", tide: "3.0 ft rising", water: "70°", crowd: "Moderate", best: "6 AM–9 AM", score: 72, lat: 32.8057, lon: -117.2610 },
  { name: "Ocean Beach", zone: "Central", height: "2–4 ft", rating: "Fair", swell: "WSW", swellDegrees: 248, period: "13s", wind: "3 kt E", tide: "3.1 ft rising", water: "70°", crowd: "Light", best: "6 AM–9 AM", score: 63, lat: 32.7495, lon: -117.2526 },
  { name: "Coronado", zone: "South Bay", height: "1–3 ft", rating: "Fair", swell: "SW", swellDegrees: 225, period: "12s", wind: "4 kt E", tide: "3.2 ft rising", water: "71°", crowd: "Light", best: "6 AM–9 AM", score: 59, lat: 32.6800, lon: -117.1835 },
  { name: "Imperial Beach", zone: "South Bay", height: "2–3 ft", rating: "Poor", swell: "SW", swellDegrees: 225, period: "11s", wind: "4 kt ESE", tide: "3.3 ft rising", water: "71°", crowd: "Light", best: "6 AM–9 AM", score: 43, lat: 32.5791, lon: -117.1324 },
];

const zoneDefaults: Record<Zone, string> = {
  "North County": "Swami’s",
  Central: "Blacks",
  "South Bay": "Coronado",
};

const initialHourly = [
  { time: "6 AM", height: 3.8, wind: 2, score: 88 },
  { time: "7 AM", height: 4.4, wind: 3, score: 96 },
  { time: "8 AM", height: 4.7, wind: 3, score: 92 },
  { time: "9 AM", height: 4.3, wind: 4, score: 84 },
  { time: "10 AM", height: 3.9, wind: 6, score: 69 },
  { time: "11 AM", height: 3.5, wind: 8, score: 56 },
  { time: "12 PM", height: 3.2, wind: 10, score: 44 },
];

const initialDays = [
  { day: "Today", date: "Jul 21", height: "4–6 ft", rating: "Good", period: "15s" },
  { day: "Wed", date: "Jul 22", height: "3–5 ft", rating: "Good", period: "14s" },
  { day: "Thu", date: "Jul 23", height: "2–4 ft", rating: "Fair", period: "12s" },
  { day: "Fri", date: "Jul 24", height: "3–4 ft", rating: "Fair", period: "13s" },
  { day: "Sat", date: "Jul 25", height: "4–6 ft", rating: "Good", period: "16s" },
];

type ZoneSeries = Record<string, {
  hourly?: Array<{ time: string; height: number; wind: number; score: number }>;
  days?: Array<{ day: string; date: string; height: string; rating: Rating; period: string }>;
}>;

type ConditionsPayload = {
  mode: "live" | "partial" | "unavailable";
  generatedAt: string;
  conditions?: Array<Partial<Spot> & { name: string }>;
  zones?: ZoneSeries;
  buoy?: { observedAt?: string | null } | null;
};

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

export default function Home() {
  const [zone, setZone] = useState<Zone>("Central");
  const [selectedName, setSelectedName] = useState("Blacks");
  const [units, setUnits] = useState<"FT" | "M">("FT");
  const [spots, setSpots] = useState(initialSpots);
  const [series, setSeries] = useState<ZoneSeries>({});
  const [dataMode, setDataMode] = useState<"loading" | "live" | "partial" | "sample">("loading");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/conditions", { signal: controller.signal })
      .then((response) => response.json() as Promise<ConditionsPayload>)
      .then((payload) => {
        if ((payload.mode === "live" || payload.mode === "partial") && payload.conditions?.length) {
          setSpots(initialSpots.map((spot) => ({
            ...spot,
            ...(payload.conditions?.find((condition) => condition.name === spot.name) ?? {}),
          })));
          setSeries(payload.zones ?? {});
          setDataMode(payload.mode);
        } else {
          setDataMode("sample");
        }
        setUpdatedAt(new Date(payload.generatedAt));
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setDataMode("sample");
      });
    return () => controller.abort();
  }, []);

  const zoneSpots = useMemo(() => spots.filter((spot) => spot.zone === zone), [spots, zone]);
  const selected = spots.find((spot) => spot.name === selectedName) ?? spots[3];
  const hourly = series[zone]?.hourly?.length ? series[zone].hourly : initialHourly;
  const days = series[zone]?.days?.length ? series[zone].days : initialDays;
  const strongestDay = days.reduce((best, day) => {
    const bestHigh = Number(best.height.match(/\d+/g)?.at(-1) ?? 0);
    const dayHigh = Number(day.height.match(/\d+/g)?.at(-1) ?? 0);
    return dayHigh > bestHigh ? day : best;
  }, days[0]);
  const updatedLabel = updatedAt
    ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }).format(updatedAt)
    : "Connecting…";

  function selectZone(next: Zone) {
    setZone(next);
    setSelectedName(zoneDefaults[next]);
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
            <button key={item} className={zone === item ? "active" : ""} onClick={() => selectZone(item)}>{item}</button>
          ))}
        </nav>

        <div className="header-tools">
          <span className={`updated ${dataMode}`} title={dataMode === "sample" ? "Live providers are temporarily unavailable; showing sample fallback values." : "Forecast data refreshes every 15 minutes."}>
            <i /> {dataMode === "loading" ? "Connecting live data…" : dataMode === "sample" ? `Sample fallback · ${updatedLabel}` : `${dataMode === "partial" ? "Partial live" : "Live"} · ${updatedLabel}`}
          </span>
          <button className="unit-toggle" onClick={() => setUnits(units === "FT" ? "M" : "FT")} aria-label="Toggle wave height units">
            <b>{units}</b><span>{units === "FT" ? "M" : "FT"}</span>
          </button>
        </div>
      </header>

      <div className="dashboard" id="top">
        <section className="map-panel" aria-label="Geographic San Diego County surf map">
          <SurfMap
            spots={spots}
            zone={zone}
            selectedName={selected.name}
            units={units}
            swellLabel={`${selected.swell} ${selected.swellDegrees}°`}
            onSelect={(spot) => { setZone(spot.zone); setSelectedName(spot.name); }}
          />
        </section>

        <aside className="conditions-panel">
          <section className="window-card">
            <div>
              <span className="eyebrow"><Icon name="spark" /> Best window</span>
              <strong>{selected.best}</strong>
            </div>
            <div className="window-score"><b>{selected.score}</b><span>out of 100</span></div>
          </section>

          <section className="primary-card">
            <div className="spot-heading">
              <div>
                <span className="location-label">{selected.zone} · California</span>
                <h1>{selected.name}</h1>
              </div>
              <span className={`rating ${selected.rating.toLowerCase()}`}>{selected.rating}</span>
            </div>

            <div className="wave-reading">
              <strong>{displayHeight(selected.height)}</strong>
              <span><b>Clean faces</b><small>waist to head high+</small></span>
            </div>

            <div className="metrics-grid">
              <div><Icon name="wave" /><span><small>Primary swell</small><b>{selected.swell} · {selected.period}</b></span></div>
              <div><Icon name="wind" /><span><small>Wind</small><b>{selected.wind}</b></span></div>
              <div><Icon name="tide" /><span><small>Tide</small><b>{selected.tide}</b></span></div>
              <div><Icon name="temp" /><span><small>Water</small><b>{selected.water}</b></span></div>
            </div>

            <div className="mini-forecast" aria-label="Hourly quality forecast">
              <div className="forecast-labels"><span>{hourly[0]?.time ?? "Now"}</span><span>Now</span><span>{hourly.at(-1)?.time ?? "Later"}</span></div>
              <div className="forecast-track">
                {hourly.map((hour, index) => <i key={`${hour.time}-${index}`} style={{ height: `${Math.max(22, hour.score)}%` }} title={`${hour.time}: ${hour.score}/100`} />)}
              </div>
            </div>

            <button className="details-button">View {selected.name} details <span>→</span></button>
          </section>

          <section className="nearby-card">
            <div className="section-heading"><h2>{zone} spots</h2><span>{zoneSpots.length} reporting</span></div>
            <div className="spot-list">
              {zoneSpots.map((spot) => (
                <button key={spot.name} className={spot.name === selected.name ? "current" : ""} onClick={() => setSelectedName(spot.name)}>
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

      <section className="outlook-section">
        <div className="outlook-copy">
          <span className="eyebrow">5-day outlook</span>
          <h2>{strongestDay.day === "Today" ? "Today carries the strongest modeled pulse." : `${strongestDay.day} carries the strongest modeled pulse.`}</h2>
          <p>These break-level estimates combine modeled swell and wind with observed buoy conditions, local tide predictions, and each spot’s exposure profile.</p>
        </div>
        <div className="day-grid">
          {days.map((day, index) => (
            <article key={day.day} className={index === 0 ? "today" : ""}>
              <div><b>{day.day}</b><span>{day.date}</span></div>
              <Icon name="wave" />
              <strong>{displayHeight(day.height)}</strong>
              <span>{day.period} period</span>
              <i className={day.rating.toLowerCase()}>{day.rating}</i>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <div><Logo /><b>San Diego Surf</b></div>
        <p>One clear read on the county’s coastline.</p>
        <span className="source-line">
          {dataMode === "sample" ? "Sample fallback" : "Live estimates"} · Open-Meteo · CDIP/NDBC 46225 · NOAA CO-OPS
        </span>
      </footer>
    </main>
  );
}
