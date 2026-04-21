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

      // Pulse animation (orange halo for selected aircraft — FR24 classic)
      if (!document.getElementById("plane-pulse-css")) {
        const s = document.createElement("style");
        s.id = "plane-pulse-css";
        s.textContent = `
          @keyframes plane-pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,122,0,.5)}50%{box-shadow:0 0 0 12px rgba(255,122,0,0)}}
          .leaflet-container{background:var(--bg-map)!important}
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

    const isMobile = window.matchMedia("(max-width: 768px)").matches;

    visible.forEach((ac) => {
      const sel = ac.icao24 === selectedIcao;
      const color = sel ? "#FF7A00" : "#FBD200";
      const sz = sel ? 28 : isMobile ? 26 : 20;
      const glow = sel
        ? "drop-shadow(0 0 4px rgba(255,122,0,.9)) drop-shadow(0 0 2px rgba(0,0,0,.7))"
        : "drop-shadow(0 0 2px rgba(0,0,0,.8))";

      // FR24-style top-down plane silhouette (nose up → heading 0° = north)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 32 32" fill="${color}" style="transform:rotate(${ac.heading ?? 0}deg);filter:${glow}"><path d="M16 2 C 15.4 2 14.8 2.7 14.6 4 L 14 10 L 2 15.5 L 2 17.5 L 14 15 L 13.7 22 L 9.5 24 L 9.5 25.5 L 16 24 L 22.5 25.5 L 22.5 24 L 18.3 22 L 18 15 L 30 17.5 L 30 15.5 L 18 10 L 17.4 4 C 17.2 2.7 16.6 2 16 2 Z"/></svg>`;

      // Wrap in a larger touch target on mobile; pulse halo on selected
      let html: string;
      if (sel) {
        html = `<div style="width:${sz + 12}px;height:${sz + 12}px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;animation:plane-pulse 1.8s ease-in-out infinite">${svg}</div>`;
      } else if (isMobile) {
        html = `<div style="padding:6px;display:inline-flex;align-items:center;justify-content:center">${svg}</div>`;
      } else {
        html = svg;
      }

      const total = sel ? sz + 12 : isMobile ? sz + 12 : sz;
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

      if (!isMobile) {
        m.bindTooltip(ac.callsign?.trim() || ac.icao24, {
          direction: "top",
          offset: L.point(0, -total / 2),
          className: "plane-tooltip",
        });
      }

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

    // Traveled path - Glow (FR24 yellow halo)
    L.polyline(latlngs, {
      color: "#FBD200",
      weight: 6,
      opacity: 0.18,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Traveled path - Main solid line
    L.polyline(latlngs, {
      color: "#FBD200",
      weight: 2.5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(layer);

    // Departure airport marker — FR24 classic: yellow dot + label chip
    const dep = airborne[0];
    const depLabel = departureAirport || "DEP";
    L.marker([dep.latitude, dep.longitude], {
      icon: L.divIcon({
        className: "",
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        html: `<div style="position:relative"><div style="width:10px;height:10px;border:2px solid #fff;background:#FBD200;border-radius:2px;box-shadow:0 0 0 2px rgba(0,0,0,.6)"></div><div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#FBD200;font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;white-space:nowrap;letter-spacing:0.04em">${depLabel}</div></div>`,
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

      // Projected route - dashed FR24 orange, faint
      L.polyline(projectedLatLngs, {
        color: "#FF7A00",
        weight: 2,
        opacity: 0.5,
        dashArray: "6 6",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      // Arrival airport marker — FR24 orange
      const arrLabel = arrivalAirport || "ARR";
      L.marker([arrivalCoords.lat, arrLng], {
        icon: L.divIcon({
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          html: `<div style="position:relative"><div style="width:10px;height:10px;border:2px solid #fff;background:#FF7A00;border-radius:2px;box-shadow:0 0 0 2px rgba(0,0,0,.6)"></div><div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#FF7A00;font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;white-space:nowrap;letter-spacing:0.04em">${arrLabel}</div></div>`,
        }),
        interactive: false,
        zIndexOffset: 900,
      }).addTo(layer);
    } else {
      // No arrival coords — show current position marker in orange
      L.marker([cur.latitude, cur.longitude], {
        icon: L.divIcon({
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          html: `<div style="position:relative"><div style="width:10px;height:10px;border:2px solid #fff;background:#FF7A00;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.6)"></div><div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#FF7A00;font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;white-space:nowrap;letter-spacing:0.04em">${arrivalAirport ? `→ ${arrivalAirport}` : "Current"}</div></div>`,
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
      const isMobileFly = window.matchMedia("(max-width: 768px)").matches;
      // Account for fixed overlays: desktop left panel (~360px) + top bar (~60px);
      // mobile bottom sheet covers ~60vh.
      map.flyToBounds(bounds, {
        paddingTopLeft: isMobileFly ? [40, 80] : [390, 90],
        paddingBottomRight: isMobileFly
          ? [40, Math.round(window.innerHeight * 0.6)]
          : [80, 80],
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
