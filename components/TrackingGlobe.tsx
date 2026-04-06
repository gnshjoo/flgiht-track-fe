"use client";

import { useEffect, useRef, useCallback } from "react";
import type { Map as LeafletMap, LayerGroup, TileLayer } from "leaflet";
import { AircraftState, TrackWaypoint } from "@/lib/types";
import { useTheme } from "@/lib/theme-context";

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
  departureAirport: string | null;
  arrivalAirport: string | null;
  arrivalCoords: { lat: number; lng: number } | null;
}

export default function TrackingMap({
  aircraft,
  trackPath,
  selectedIcao,
  onSelectAircraft,
  onBoundsChange,
  departureAirport,
  arrivalAirport,
  arrivalCoords,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const planeLayerRef = useRef<LayerGroup | null>(null);
  const trackLayerRef = useRef<LayerGroup | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const { theme } = useTheme();
  const onSelectRef = useRef(onSelectAircraft);
  onSelectRef.current = onSelectAircraft;
  const onBoundsRef = useRef(onBoundsChange);
  onBoundsRef.current = onBoundsChange;
  const isFlyingRef = useRef(false);
  const depAirportRef = useRef(departureAirport);
  depAirportRef.current = departureAirport;
  const arrAirportRef = useRef(arrivalAirport);
  arrAirportRef.current = arrivalAirport;
  const arrCoordsRef = useRef(arrivalCoords);
  arrCoordsRef.current = arrivalCoords;

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
          .leaflet-container{background:var(--bg-map)!important}
          .plane-tooltip{background:#fbbf24!important;color:#000!important;border:none!important;border-radius:6px!important;padding:4px 10px!important;font-size:12px!important;font-weight:700!important;font-family:monospace!important;box-shadow:0 2px 10px rgba(251,191,36,.5)!important}
          .plane-tooltip::before{border-top-color:#fbbf24!important}
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

      tileLayerRef.current = L.tileLayer(
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
      map.on("moveend", () => {
        if (!isFlyingRef.current) debouncedEmit();
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [emitBounds]);

  // --- Swap tile layer on theme change ---
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const url =
      theme === "dark"
        ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    tileLayerRef.current = L.tileLayer(url, {
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);
  }, [theme]);

  // --- Draw aircraft ---
  useEffect(() => {
    const L = LRef.current;
    const layer = planeLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    // 선택된 비행기가 있으면 해당 비행기만 표시
    const visible = selectedIcao
      ? aircraft.filter((ac) => ac.icao24 === selectedIcao)
      : aircraft;

    visible.forEach((ac) => {
      const sel = ac.icao24 === selectedIcao;
      const color = sel ? "#fbbf24" : "#22d3ee";
      const sz = sel ? 38 : 28;
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

      const total = sel ? 52 : sz;
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

      m.bindTooltip(ac.callsign?.trim() || ac.icao24, {
        direction: "top",
        offset: L.point(0, -total / 2),
        className: "plane-tooltip",
      });

      m.on("click", () => {
        // 이미 선택된 비행기를 다시 클릭하면 선택 해제
        if (ac.icao24 === selectedIcao) {
          onSelectRef.current(null);
        } else {
          onSelectRef.current(ac);
        }
      });
      layer.addLayer(m);
    });
  }, [aircraft, selectedIcao]);

  // --- Draw track + labels (single unified effect) ---
  useEffect(() => {
    const L = LRef.current;
    const layer = trackLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();

    // 시간순 정렬 + 중복 제거
    const airborne = trackPath
      .filter((wp) => !wp.onGround)
      .sort((a, b) => a.time - b.time)
      .filter((wp, i, arr) =>
        i === 0 || wp.latitude !== arr[i - 1].latitude || wp.longitude !== arr[i - 1].longitude
      );
    if (airborne.length < 2) return;

    // Unwrap longitudes across the antimeridian (e.g. ICN→LAX via Pacific)
    const unwrappedLngs: number[] = [];
    for (let i = 0; i < airborne.length; i++) {
      if (i === 0) {
        unwrappedLngs.push(airborne[i].longitude);
      } else {
        const prev = unwrappedLngs[i - 1];
        let cur = airborne[i].longitude;
        let diff = cur - prev;
        while (diff > 180) { cur -= 360; diff = cur - prev; }
        while (diff < -180) { cur += 360; diff = cur - prev; }
        unwrappedLngs.push(cur);
      }
    }

    const latlngs = airborne.map(
      (wp, i) => L.latLng(wp.latitude, unwrappedLngs[i])
    );

    // Traveled path - Glow
    L.polyline(latlngs, {
      color: "#fbbf24",
      weight: 7,
      opacity: 0.2,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Traveled path - Main dashed line
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
        iconSize: [120, 30],
        iconAnchor: [60, 40],
        html: `<div style="background:#f59e0b;color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(245,158,11,.5);text-align:center">▲ Departure${departureAirport ? ` (${departureAirport})` : ""}</div>`,
      }),
      interactive: false,
      zIndexOffset: 900,
    }).addTo(layer);

    // 현재 위치 → 도착 공항 예상 경로 (연하게)
    const cur = airborne[airborne.length - 1];
    if (arrivalCoords) {
      const lastUnwrappedLng = unwrappedLngs[unwrappedLngs.length - 1];
      let arrLng = arrivalCoords.lng;
      let diff = arrLng - lastUnwrappedLng;
      while (diff > 180) { arrLng -= 360; diff = arrLng - lastUnwrappedLng; }
      while (diff < -180) { arrLng += 360; diff = arrLng - lastUnwrappedLng; }

      const projectedLatLngs = [
        L.latLng(cur.latitude, lastUnwrappedLng),
        L.latLng(arrivalCoords.lat, arrLng),
      ];

      // Projected route - Glow (faint)
      L.polyline(projectedLatLngs, {
        color: "#06b6d4",
        weight: 5,
        opacity: 0.1,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      // Projected route - Dashed line (faint)
      L.polyline(projectedLatLngs, {
        color: "#06b6d4",
        weight: 2,
        opacity: 0.4,
        dashArray: "6 8",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      // Arrival airport marker
      L.marker([arrivalCoords.lat, arrLng], {
        icon: L.divIcon({
          className: "",
          iconSize: [120, 30],
          iconAnchor: [60, 40],
          html: `<div style="background:#06b6d4;color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(6,182,212,.5);text-align:center">● Arrival${arrivalAirport ? ` (${arrivalAirport})` : ""}</div>`,
        }),
        interactive: false,
        zIndexOffset: 900,
      }).addTo(layer);
    } else {
      // 도착 좌표 없을 때 현재 위치 마커
      L.marker([cur.latitude, cur.longitude], {
        icon: L.divIcon({
          className: "",
          iconSize: [120, 30],
          iconAnchor: [60, 40],
          html: `<div style="background:#06b6d4;color:#000;font-size:11px;font-weight:700;padding:4px 12px;border-radius:14px;white-space:nowrap;box-shadow:0 2px 8px rgba(6,182,212,.5);text-align:center">● Current${arrivalAirport ? ` (→${arrivalAirport})` : ""}</div>`,
        }),
        interactive: false,
        zIndexOffset: 900,
      }).addTo(layer);
    }

    // Fly map to track bounds
    isFlyingRef.current = true;
    const allLatLngs = arrivalCoords
      ? [...latlngs, L.latLng(arrivalCoords.lat, arrivalCoords.lng)]
      : latlngs;
    const bounds = L.latLngBounds(allLatLngs);
    const map = mapRef.current;
    if (map) {
      map.flyToBounds(bounds, {
        padding: [80, 80],
        maxZoom: 8,
        duration: 1,
      });
      setTimeout(() => { isFlyingRef.current = false; }, 1200);
    }
  }, [trackPath, arrivalCoords, departureAirport, arrivalAirport]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0"
      style={{ background: "var(--bg-map)" }}
    />
  );
}
