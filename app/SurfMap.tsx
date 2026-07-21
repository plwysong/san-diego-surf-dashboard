"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup as LeafletLayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";

type Zone = "North County" | "Central" | "South Bay";

type MapSpot = {
  name: string;
  zone: Zone;
  height: string;
  rating: "Excellent" | "Good" | "Fair" | "Poor";
  lat: number;
  lon: number;
};

const coastBounds: [[number, number], [number, number]] = [
  [32.50, -117.72],
  [33.46, -116.82],
];

const zoneBounds: Record<Zone, [[number, number], [number, number]]> = {
  "North County": [[32.96, -117.54], [33.46, -117.08]],
  Central: [[32.69, -117.43], [33.02, -117.06]],
  "South Bay": [[32.50, -117.36], [32.79, -116.98]],
};

const colors = {
  Excellent: "#0a63ee",
  Good: "#168054",
  Fair: "#c8821b",
  Poor: "#b4514e",
};

export default function SurfMap({
  spots,
  zone,
  selectedName,
  units,
  swellLabel,
  onSelect,
}: {
  spots: MapSpot[];
  zone: Zone;
  selectedName: string;
  units: "FT" | "M";
  swellLabel: string;
  onSelect: (spot: MapSpot) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletLayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void import("leaflet").then((module) => {
      if (!active || !containerRef.current || mapRef.current) return;
      const L = module.default;
      leafletRef.current = module;
      const map = L.map(containerRef.current, {
        zoomControl: true,
        minZoom: 8,
        maxZoom: 16,
        scrollWheelZoom: true,
      });
      map.fitBounds(coastBounds, { padding: [24, 24] });
      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);
      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current?.default;
    const map = mapRef.current;
    const group = markerLayerRef.current;
    if (!ready || !L || !map || !group) return;

    group.clearLayers();
    const formatHeight = (height: string) => {
      if (units === "FT") return height;
      const nums = height.match(/\d+/g)?.map(Number) ?? [];
      return nums.length === 2 ? `${(nums[0] * .3048).toFixed(1)}–${(nums[1] * .3048).toFixed(1)} m` : height;
    };

    spots.forEach((spot) => {
      const selected = spot.name === selectedName;
      const activeZone = spot.zone === zone;
      const marker = L.circleMarker([spot.lat, spot.lon], {
        radius: selected ? 9 : activeZone ? 6 : 4,
        color: "#fff",
        weight: selected ? 4 : 3,
        fillColor: colors[spot.rating],
        fillOpacity: activeZone || selected ? 1 : .52,
      });
      marker.on("click", () => onSelect(spot));
      if (activeZone || selected) {
        marker.bindTooltip(`<b>${spot.name}</b><span>${formatHeight(spot.height)}</span>`, {
          permanent: true,
          direction: "right",
          offset: [9, 0],
          className: selected ? "surf-tooltip selected" : "surf-tooltip",
        });
      }
      marker.addTo(group);
    });
  }, [onSelect, ready, selectedName, spots, units, zone]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.flyToBounds(zoneBounds[zone], { padding: [34, 34], duration: .7, maxZoom: 11 });
  }, [ready, zone]);

  return (
    <div className="real-map-wrap">
      <div ref={containerRef} className="real-map" />

      <div className="map-legend real-map-legend">
        <span><i className="legend-dot excellent" /> Excellent</span>
        <span><i className="legend-dot good" /> Good</span>
        <span><i className="legend-dot fair" /> Fair</span>
      </div>

      <div className="map-reference-card">
        <span>Coastal reference</span>
        <b>San Diego County</b>
        <small>Orange County line to Mexico</small>
      </div>

      <div className="map-swell-card">
        <span className="swell-arrow">↗</span>
        <span><b>{swellLabel}</b><small>Primary swell</small></span>
      </div>
    </div>
  );
}
