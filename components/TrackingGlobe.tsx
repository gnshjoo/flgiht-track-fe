"use client";

import { useEffect, useRef, useCallback } from "react";
import type { DivIcon, Map as LeafletMap, LayerGroup, Marker, TileLayer } from "leaflet";
import { AircraftState, Bounds, Route } from "@/lib/types";
import { positionAt, type MotionMap } from "@/lib/motion";
import { trackLine, unwrapLng, type LatLng } from "@/lib/track";

type L = typeof import("leaflet");

const FRAME_MS = 100;

const glyphSize = (sel: boolean, isMobile: boolean) => (sel ? 28 : isMobile ? 26 : 20);
const iconBox = (sel: boolean, isMobile: boolean) =>
  glyphSize(sel, isMobile) + (sel || isMobile ? 12 : 0);

// FR24-style top-down plane silhouette (nose up → heading 0° = north)
function planeIcon(L: L, heading: number | null, sel: boolean, isMobile: boolean): DivIcon {
  const color = sel ? "#FF7A00" : "#FBD200";
  const sz = glyphSize(sel, isMobile);
  const glow = sel
    ? "drop-shadow(0 0 4px rgba(255,122,0,.9)) drop-shadow(0 0 2px rgba(0,0,0,.7))"
    : "drop-shadow(0 0 2px rgba(0,0,0,.8))";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${sz}" viewBox="0 0 32 32" fill="${color}" style="transform:rotate(${heading ?? 0}deg);filter:${glow}"><path d="M16 2 C 15.4 2 14.8 2.7 14.6 4 L 14 10 L 2 15.5 L 2 17.5 L 14 15 L 13.7 22 L 9.5 24 L 9.5 25.5 L 16 24 L 22.5 25.5 L 22.5 24 L 18.3 22 L 18 15 L 30 17.5 L 30 15.5 L 18 10 L 17.4 4 C 17.2 2.7 16.6 2 16 2 Z"/></svg>`;

  // Wrap in a larger touch target on mobile; pulse halo on selected
  let html: string;
  if (sel) {
    html = `<div style="width:${sz + 12}px;height:${sz + 12}px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;animation:plane-pulse 1.8s ease-in-out infinite">${svg}</div>`;
  } else if (isMobile) {
    html = `<div style="padding:6px;display:inline-flex;align-items:center;justify-content:center">${svg}</div>`;
  } else {
    html = svg;
  }

  const total = iconBox(sel, isMobile);
  return L.divIcon({
    className: "",
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
    html,
  });
}

interface Props {
  /** Changes once per poll; the marker set itself comes from `motionRef`. */
  aircraft: AircraftState[];
  motionRef: React.RefObject<MotionMap>;
  selected: AircraftState | null;
  route: Route | null;
  onSelectAircraft: (aircraft: AircraftState | null) => void;
  onBoundsChange: (bounds: Bounds) => void;
}

export default function TrackingMap({
  aircraft,
  motionRef,
  selected,
  route,
  onSelectAircraft,
  onBoundsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const planeLayerRef = useRef<LayerGroup | null>(null);
  const trackLayerRef = useRef<LayerGroup | null>(null);
  const tileLayerRef = useRef<TileLayer | null>(null);
  const labelLayerRef = useRef<TileLayer | null>(null);
  const onSelectRef = useRef(onSelectAircraft);
  onSelectRef.current = onSelectAircraft;
  const onBoundsRef = useRef(onBoundsChange);
  onBoundsRef.current = onBoundsChange;
  const isFlyingRef = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const markersRef = useRef(new Map<string, { marker: Marker; key: string }>());

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

      // Esri Firefly Imagery Hybrid: Firefly imagery + boundaries/places labels
      tileLayerRef.current = L.tileLayer(
        "https://fly.maptiles.arcgis.com/arcgis/rest/services/World_Imagery_Firefly/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Esri, Maxar, Earthstar Geographics",
        }
      ).addTo(map);
      labelLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19 }
      ).addTo(map);

      planeLayerRef.current = L.layerGroup().addTo(map);
      trackLayerRef.current = L.layerGroup().addTo(map);

      mapRef.current = map;

      map.whenReady(emitBounds);

      let moveTimer: ReturnType<typeof setTimeout>;
      map.on("moveend", () => {
        if (isFlyingRef.current) return;
        clearTimeout(moveTimer);
        moveTimer = setTimeout(emitBounds, 2000);
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [emitBounds]);

  useEffect(() => {
    const L = LRef.current;
    const layer = planeLayerRef.current;
    if (!L || !layer) return;

    // 선택된 비행기가 있으면 해당 비행기만 표시
    const now = Date.now();
    const motion = motionRef.current;
    const visible: { ac: AircraftState; pos: LatLng }[] = [];
    if (selected) {
      const m = motion.get(selected.icao24);
      visible.push({
        ac: selected,
        pos: m ? positionAt(m, now) : { lat: selected.latitude, lng: selected.longitude },
      });
    } else {
      motion.forEach((m) => visible.push({ ac: m.state, pos: positionAt(m, now) }));
    }
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const markers = markersRef.current;
    const visibleIds = new Set<string>();

    for (const { ac, pos } of visible) {
      visibleIds.add(ac.icao24);
      const sel = ac.icao24 === selected?.icao24;
      const key = `${ac.heading ?? 0}|${sel}|${isMobile}`;
      const label = ac.callsign?.trim() || ac.icao24;
      const entry = markers.get(ac.icao24);

      if (!entry) {
        const icon = planeIcon(L, ac.heading, sel, isMobile);
        const marker = L.marker([pos.lat, pos.lng], {
          icon,
          zIndexOffset: sel ? 1000 : 0,
        });
        if (!isMobile) {
          marker.bindTooltip(label, {
            direction: "top",
            offset: L.point(0, -iconBox(sel, isMobile) / 2),
            className: "plane-tooltip",
          });
        }
        marker.on("click", () => {
          // 이미 선택된 비행기를 다시 클릭하면 선택 해제
          if (selectedRef.current?.icao24 === ac.icao24) {
            onSelectRef.current(null);
          } else {
            const live = motionRef.current.get(ac.icao24);
            if (live) onSelectRef.current(live.state);
          }
        });
        marker.addTo(layer);
        markers.set(ac.icao24, { marker, key });
        continue;
      }

      const { marker } = entry;
      marker.setLatLng([pos.lat, pos.lng]);
      if (entry.key !== key) {
        const icon = planeIcon(L, ac.heading, sel, isMobile);
        marker.setIcon(icon);
        marker.setZIndexOffset(sel ? 1000 : 0);
        const tooltip = marker.getTooltip();
        if (tooltip) tooltip.options.offset = L.point(0, -iconBox(sel, isMobile) / 2);
        entry.key = key;
      }
      if (marker.getTooltip()?.getContent() !== label) marker.setTooltipContent(label);
    }

    markers.forEach(({ marker }, id) => {
      if (visibleIds.has(id)) return;
      layer.removeLayer(marker);
      markers.delete(id);
    });
  }, [aircraft, selected, motionRef]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < FRAME_MS) return;
      last = t;
      const map = mapRef.current;
      if (!map) return;
      const now = Date.now();
      const view = map.getBounds().pad(0.2);
      const motion = motionRef.current;
      markersRef.current.forEach(({ marker }, id) => {
        const m = motion.get(id);
        if (!m || !view.contains(marker.getLatLng())) return;
        const p = positionAt(m, now);
        marker.setLatLng([p.lat, p.lng]);
      });
    };
    // Positions come from the wall clock, so resuming after a hidden tab needs no catch-up.
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [motionRef]);

  useEffect(() => {
    const L = LRef.current;
    const layer = trackLayerRef.current;
    if (!L || !layer) return;

    layer.clearLayers();
    if (!route) return;

    const sel = selectedRef.current;
    const live =
      sel && sel.icao24 === route.icao24 ? { lat: sel.latitude, lng: sel.longitude } : null;
    const line = trackLine(route.path, live);
    if (line.length < 2) return;
    const latlngs = line.map((p) => L.latLng(p.lat, p.lng));

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
    const dep = line[0];
    const depLabel = route.departure ?? "DEP";
    L.marker([dep.lat, dep.lng], {
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
    if (route.arrivalCoords) {
      const cur = line[line.length - 1];
      const arrLng = unwrapLng(route.arrivalCoords.lng, cur.lng);

      // Projected route - dashed FR24 orange, faint
      L.polyline([L.latLng(cur.lat, cur.lng), L.latLng(route.arrivalCoords.lat, arrLng)], {
        color: "#FF7A00",
        weight: 2,
        opacity: 0.5,
        dashArray: "6 6",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(layer);

      // Arrival airport marker — FR24 orange
      const arrLabel = route.arrival ?? "ARR";
      L.marker([route.arrivalCoords.lat, arrLng], {
        icon: L.divIcon({
          className: "",
          iconSize: [12, 12],
          iconAnchor: [6, 6],
          html: `<div style="position:relative"><div style="width:10px;height:10px;border:2px solid #fff;background:#FF7A00;border-radius:2px;box-shadow:0 0 0 2px rgba(0,0,0,.6)"></div><div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#FF7A00;font-size:10px;font-weight:600;padding:2px 6px;border-radius:3px;white-space:nowrap;letter-spacing:0.04em">${arrLabel}</div></div>`,
        }),
        interactive: false,
        zIndexOffset: 900,
      }).addTo(layer);
    }
  }, [route, selected?.latitude, selected?.longitude]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || route?.status !== "ready") return;

    const sel = selectedRef.current;
    const live =
      sel && sel.icao24 === route.icao24 ? { lat: sel.latitude, lng: sel.longitude } : null;
    const line = trackLine(route.path, live);
    if (line.length < 2) return;
    const points = line.map((p) => L.latLng(p.lat, p.lng));
    if (route.arrivalCoords) {
      points.push(
        L.latLng(route.arrivalCoords.lat, unwrapLng(route.arrivalCoords.lng, line[line.length - 1].lng))
      );
    }

    isFlyingRef.current = true;
    const isMobileFly = window.matchMedia("(max-width: 768px)").matches;
    // Account for fixed overlays: desktop left panel (~360px) + top bar (~60px);
    // mobile bottom sheet covers ~60vh.
    map.flyToBounds(L.latLngBounds(points), {
      paddingTopLeft: isMobileFly ? [40, 80] : [390, 90],
      paddingBottomRight: isMobileFly ? [40, Math.round(window.innerHeight * 0.6)] : [80, 80],
      maxZoom: 8,
      duration: 1,
    });
    setTimeout(() => { isFlyingRef.current = false; }, 1200);
  }, [route]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full absolute inset-0"
      style={{ background: "var(--bg-map)" }}
    />
  );
}
