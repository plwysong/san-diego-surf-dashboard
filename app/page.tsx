"use client";

import { useMemo, useState } from "react";

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
  x: number;
  y: number;
};

const spots: Spot[] = [
  { name: "Trestles", zone: "North County", height: "3–5 ft", rating: "Good", swell: "SSW", period: "14s", wind: "2 kt E", tide: "2.4 ft rising", water: "70°", crowd: "Busy", best: "6:10–8:45 AM", x: 36, y: 12 },
  { name: "Oceanside", zone: "North County", height: "2–4 ft", rating: "Fair", swell: "SSW", period: "13s", wind: "3 kt ESE", tide: "2.5 ft rising", water: "70°", crowd: "Moderate", best: "6:20–9:10 AM", x: 43, y: 27 },
  { name: "Swami’s", zone: "North County", height: "3–5 ft", rating: "Good", swell: "SSW", period: "14s", wind: "2 kt E", tide: "2.7 ft rising", water: "70°", crowd: "Busy", best: "6:15–9:00 AM", x: 48, y: 43 },
  { name: "Blacks", zone: "Central", height: "4–6 ft", rating: "Excellent", swell: "WNW", period: "15s", wind: "3 kt E", tide: "2.8 ft rising", water: "69°", crowd: "Moderate", best: "6:30–9:00 AM", x: 52, y: 52 },
  { name: "Windansea", zone: "Central", height: "2–4 ft", rating: "Fair", swell: "W", period: "13s", wind: "3 kt E", tide: "2.9 ft rising", water: "69°", crowd: "Light", best: "6:45–9:20 AM", x: 49, y: 60 },
  { name: "Tourmaline", zone: "Central", height: "2–3 ft", rating: "Good", swell: "W", period: "12s", wind: "2 kt ENE", tide: "3.0 ft rising", water: "70°", crowd: "Moderate", best: "6:25–9:15 AM", x: 50, y: 68 },
  { name: "Ocean Beach", zone: "Central", height: "2–4 ft", rating: "Fair", swell: "WSW", period: "13s", wind: "3 kt E", tide: "3.1 ft rising", water: "70°", crowd: "Light", best: "6:30–9:10 AM", x: 47, y: 76 },
  { name: "Coronado", zone: "South Bay", height: "1–3 ft", rating: "Fair", swell: "SW", period: "12s", wind: "4 kt E", tide: "3.2 ft rising", water: "71°", crowd: "Light", best: "6:40–9:30 AM", x: 52, y: 84 },
  { name: "Imperial Beach", zone: "South Bay", height: "2–3 ft", rating: "Poor", swell: "SW", period: "11s", wind: "4 kt ESE", tide: "3.3 ft rising", water: "71°", crowd: "Light", best: "6:30–8:40 AM", x: 49, y: 94 },
];

const zoneDefaults: Record<Zone, string> = {
  "North County": "Swami’s",
  Central: "Blacks",
  "South Bay": "Coronado",
};

const hourly = [
  { time: "6 AM", height: 3.8, wind: 2, score: 88 },
  { time: "7 AM", height: 4.4, wind: 3, score: 96 },
  { time: "8 AM", height: 4.7, wind: 3, score: 92 },
  { time: "9 AM", height: 4.3, wind: 4, score: 84 },
  { time: "10 AM", height: 3.9, wind: 6, score: 69 },
  { time: "11 AM", height: 3.5, wind: 8, score: 56 },
  { time: "12 PM", height: 3.2, wind: 10, score: 44 },
];

const days = [
  { day: "Today", date: "Jul 21", height: "4–6 ft", rating: "Good", period: "15s" },
  { day: "Wed", date: "Jul 22", height: "3–5 ft", rating: "Good", period: "14s" },
  { day: "Thu", date: "Jul 23", height: "2–4 ft", rating: "Fair", period: "12s" },
  { day: "Fri", date: "Jul 24", height: "3–4 ft", rating: "Fair", period: "13s" },
  { day: "Sat", date: "Jul 25", height: "4–6 ft", rating: "Good", period: "16s" },
];

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

  const zoneSpots = useMemo(() => spots.filter((spot) => spot.zone === zone), [zone]);
  const selected = spots.find((spot) => spot.name === selectedName) ?? spots[3];

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
          <span className="updated"><i /> Updated 5:42 AM</span>
          <button className="unit-toggle" onClick={() => setUnits(units === "FT" ? "M" : "FT")} aria-label="Toggle wave height units">
            <b>{units}</b><span>{units === "FT" ? "M" : "FT"}</span>
          </button>
        </div>
      </header>

      <div className="dashboard" id="top">
        <section className="map-panel" aria-label="San Diego County surf spot map">
          <div className="ocean-glow" />
          <div className="map-label pacific">PACIFIC OCEAN</div>
          <div className="map-label county">SAN DIEGO COUNTY</div>
          <div className="map-label mexico">MEXICO</div>
          <div className="map-label city encinitas">ENCINITAS</div>
          <div className="map-label city lajolla">LA JOLLA</div>
          <div className="map-label city downtown">SAN DIEGO</div>

          <svg className="coast-art" viewBox="0 0 720 900" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="land" x1="0" x2="1">
                <stop offset="0" stopColor="#dcefe6" />
                <stop offset="1" stopColor="#f4f3e9" />
              </linearGradient>
            </defs>
            <path className="land" d="M370 0C365 72 405 99 402 157c-4 74-27 112-13 174 13 54 53 89 33 152-14 45-64 58-61 112 3 61 59 82 35 139-23 56-4 104 25 166H720V0Z" />
            <path className="coastline" d="M370 0C365 72 405 99 402 157c-4 74-27 112-13 174 13 54 53 89 33 152-14 45-64 58-61 112 3 61 59 82 35 139-23 56-4 104 25 166" />
            <path className="border-line" d="M421 900h299" />
            {[0,1,2,3,4].map((n) => <path key={n} className={`bathymetry b${n}`} d={`M${320-n*44} 0C${310-n*43} 100 ${353-n*45} 180 ${339-n*46} 280c-13 76 45 116 18 193-20 57-58 80-48 141 9 59 48 105 24 176-14 41-5 77 12 110`} />)}
            <path className="terrain" d="M475 22c78 49 50 94 125 132M446 203c56 31 96 10 161 67M475 362c72-19 111 29 186 22M458 520c45 43 112 12 187 68M468 697c65-23 110 18 179 24" />
            <path className="terrain faint" d="M527 8c52 62 30 102 104 155M511 246c78-10 101 48 173 55M502 456c62 21 86-13 154 35M525 611c51 34 84 20 137 64" />
          </svg>

          <div className="swell-direction">
            <Icon name="arrow" />
            <span><b>WNW 285°</b><small>Primary swell</small></span>
          </div>

          <div className="map-legend">
            <span><i className="legend-dot excellent" /> Excellent</span>
            <span><i className="legend-dot good" /> Good</span>
            <span><i className="legend-dot fair" /> Fair</span>
          </div>

          {spots.map((spot) => (
            <button
              key={spot.name}
              className={`spot-marker ${selected.name === spot.name ? "selected" : ""} ${spot.zone === zone ? "in-zone" : "out-zone"}`}
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              onClick={() => { setZone(spot.zone); setSelectedName(spot.name); }}
              aria-label={`Select ${spot.name}, ${spot.height}, ${spot.rating}`}
            >
              <i data-rating={spot.rating.toLowerCase()} />
              <span>{spot.name}<small>{displayHeight(spot.height)}</small></span>
            </button>
          ))}
        </section>

        <aside className="conditions-panel">
          <section className="window-card">
            <div>
              <span className="eyebrow"><Icon name="spark" /> Best window</span>
              <strong>{selected.best}</strong>
            </div>
            <div className="window-score"><b>94</b><span>out of 100</span></div>
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
              <div className="forecast-labels"><span>6 AM</span><span>Now</span><span>Noon</span></div>
              <div className="forecast-track">
                {hourly.map((hour) => <i key={hour.time} style={{ height: `${Math.max(22, hour.score)}%` }} title={`${hour.time}: ${hour.score}/100`} />)}
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
          <h2>A fresh pulse builds into Saturday.</h2>
          <p>Morning winds remain favorable through Wednesday. Expect smaller surf Thursday before a longer-period WNW swell arrives this weekend.</p>
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
        <span>Forecast prototype · Sample conditions</span>
      </footer>
    </main>
  );
}
