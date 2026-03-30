"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { AircraftState, TrackWaypoint } from "@/lib/types";

interface Props {
  aircraft: AircraftState[];
  trackPath: TrackWaypoint[];
  selectedIcao: string | null;
  onSelectAircraft: (aircraft: AircraftState | null) => void;
  onBoundsChange: (bounds: {
    lamin: number;
    lomin: number;
    lamax: number;
    lomax: number;
  }) => void;
}

export default function TrackingMap({
  aircraft,
  trackPath,
  selectedIcao,
  onSelectAircraft,
  onBoundsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const planeLayerRef = useRef<LayerGroup | null>(null);
  const trackLayerRef = useRef<LayerGroup | null>(null);
  const onSelectRef = useRef(onSelectAircraft);
  onSelectRef.current = onSelectAircraft;
  const onBoundsRef = useRef(onBoundsChange);
  onBoundsRef.current = onBoundsChange;

  // Emit current bounds
  const emitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    onBoundsRef.current({
      lamin: Math.max(b.getSouth(), -90),
      lomin: Math.max(b.getWest(), -180),
      lamax: Math.min(b.getNorth(), 90),
      lomax: Math.min(b.getEast(), 180),
    });
  }, []);

  // Init map (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cancelled = false;

    (async () => {
      const L = await import("leaflet");

      // CSS
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
        // Wait for CSS to load
        await new Promise((r) => {
          link.onload = r;
          setTimeout(r, 1000);
        });
      }

      // Pulse animation
      if (!document.getElementById("plane-pulse-css")) {
        const s = document.createElement("style");
        s.id = "plane-pulse-css";
        s.textContent = `
          @keyframes plane-pulse{0%,100%{box-shadow:0 0 0 0 rgba(251,191,36,.45)}50%{box-shadow:0 0 0 10px rgba(251,191,36,0)}}
          .leaflet-container{background:#0a0e1a!important}
        `;
        document.head.appendChild(s);
      }

      if (cancelled || !containerRef.current) return;

      LRef.current = L;

      const map = L.map(containerRef.current, {
        center: [36, 128],
        zoom: 5,
        minZoom: 3,
        maxZoom: 14,
        zoomControl: false,
        worldCopyJump: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);

      planeLayerRef.current = L.layerGroup().addTo(map);
      trackLayerRef.current = L.layerGroup().addTo(map);

      mapRef.current = map;

      // Single debounced emitter — prevents double-fire on init
      let moveTimer: ReturnType<typeof setTimeout>;
      const debouncedEmit = () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(emitBounds, 2000);
      };

      map.whenReady(() => debouncedEmit());
      map.on("moveend", () => debouncedEmit());
    })();

    return () => {
      cancelled = true;
    };
  }, [emitBounds]);

  // --- Draw aircraft ---
  useEffect(() => {
    const L = LRef.current;
    const layer = planeLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    aircraft.forEach((ac) => {
      const sel = ac.icao24 === selectedIcao;
      const color = sel ? "#fbbf24" : "#22d3ee";
      const sz = sel ? 26 : 16;
      const glow = sel
        ? "drop-shadow(0 0 4px #fbbf24) drop-shadow(0 0 10px #fbbf24)"
        : "drop-shadow(0 0 2px #22d3ee)";

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="${color}" style="transform:rotate(${ac.heading ?? 0}deg);filter:${glow}"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>`;

      let html: string;
      if (sel) {
        html = `<div style="border:2px solid #fbbf24;border-radius:50%;padding:4px;background:rgba(251,191,36,.15);display:inline-flex;align-items:center;justify-content:center;animation:plane-pulse 1.5s ease-in-out infinite">${svg}</div>`;
      } else {
        html = svg;
      }

      const total = sel ? 38 : sz;
      const icon = L.divIcon({
        className: "",
        iconSize: [total, total],
        iconAnchor: [total / 2, total / 2],
        html,
      });

      const m = L.marker([ac.latitude, ac.longitude], {
        icon,
        zIndexOffset: sel ? 1000 : 0,
      });

      m.on("click", () => onSelectRef.current(ac));
      layer.addLayer(m);
    });
  }, [aircraft, selectedIcao]);

  // --- Draw track + labels ---
  useEffect(() => {
    const L = LRef.current;
    const layer = trackLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    const airborne = trackPath.filter((wp) => !wp.onGround);
    if (airborne.length < 2) return;

    const latlngs = airborne.map(
      (wp) => L.latLng(wp.latitude, wp.longitude)
    );

    // Glow
    L.polyline(latlngs, {
      color: "#fbbf24",
      weight: 7,
      opacity: 0.2,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Main dashed line
    L.polyline(latlngs, {
      color: "#fbbf24",
      weight: 3,
      opacity: 0.85,
      dashArray: "10 5",
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Departure marker
    const dep = airborne[0];
    L.marker([dep.latitude, dep.longitude], {
      icon: L.divIcon({
        className: "",
        iconSize: [100, 30],
        iconAnchor: [50, 40],
        html: `<div style="background:#f59e0b;color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(245,158,11,.5);text-align:center">▲ Departed</div>`,
      }),
      interactive: false,
      zIndexOffset: 900,
    }).addTo(layer);

    // Current marker
    const cur = airborne[airborne.length - 1];
    L.marker([cur.latitude, cur.longitude], {
      icon: L.divIcon({
        className: "",
        iconSize: [90, 30],
        iconAnchor: [45, 40],
        html: `<div style="background:#06b6d4;color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(6,182,212,.5);text-align:center">● Current</div>`,
      }),
      interactive: false,
      zIndexOffset: 900,
    }).addTo(layer);

    // Fly map to track bounds
    const bounds = L.latLngBounds(latlngs);
    mapRef.current?.flyToBounds(bounds, {
      padding: [80, 80],
      maxZoom: 8,
      duration: 1,
    });
  }, [trackPath]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0"
      style={{ background: "#0a0e1a" }}
    />
  );
}
