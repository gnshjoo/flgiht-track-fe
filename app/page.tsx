"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { AircraftInfo, AircraftResponse, AircraftState, Bounds, Feed, Route } from "@/lib/types";
import { PLANE_PATH } from "@/lib/plane";
import {
  fetchAircraft,
  fetchAircraftByCallsign,
  fetchAircraftInfo,
  fetchTrack,
  fetchAirport,
} from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";
import FirstLoadOverlay from "@/components/FirstLoadOverlay";

const TrackingMap = dynamic(() => import("@/components/TrackingGlobe"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-[#0a0c10]">
      <div className="text-fr24-yellow text-sm animate-pulse">Loading map…</div>
    </div>
  ),
});

type Selection = { icao24: string; snapshot: AircraftState } | null;

const NO_AIRCRAFT: AircraftState[] = [];
// A cold backend can take 20 s; past this the request is a failure, not a wait.
const FETCH_TIMEOUT_MS = 45_000;

export default function TrackingPage() {
  const [feed, setFeed] = useState<Feed>(() => ({ status: "waking", startedAt: Date.now() }));
  const [selection, setSelection] = useState<Selection>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [aircraftInfo, setAircraftInfo] = useState<AircraftInfo | null | undefined>(undefined);

  const fetchRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boundsRef = useRef<Bounds | null>(null);
  const selectedIcaoRef = useRef<string | null>(null);

  // The only writer of `feed`. A newer request supersedes the previous one silently.
  const loadFeed = useCallback(
    async (request: (signal: AbortSignal) => Promise<AircraftResponse>, failMessage: string) => {
      fetchRef.current?.abort();
      const ctrl = new AbortController();
      fetchRef.current = ctrl;
      const timer = setTimeout(
        () => ctrl.abort(new DOMException("timeout", "TimeoutError")),
        FETCH_TIMEOUT_MS
      );
      setFeed((f) => (f.status === "live" ? { ...f, refreshing: true } : f));
      try {
        const data = await request(ctrl.signal);
        setFeed({
          status: "live",
          aircraft: data.aircraft,
          updatedAt: new Date(),
          refreshing: false,
          staleError: null,
        });
      } catch {
        if (ctrl.signal.aborted && ctrl.signal.reason?.name !== "TimeoutError") return;
        setFeed((f) =>
          f.status === "live"
            ? { ...f, refreshing: false, staleError: failMessage }
            : { status: "down", message: failMessage }
        );
      } finally {
        clearTimeout(timer);
      }
    },
    []
  );

  const loadForBounds = useCallback(
    (bounds: Bounds) =>
      loadFeed((signal) => fetchAircraft(bounds, signal), "Unable to load aircraft data."),
    [loadFeed]
  );

  const reload = useCallback(() => {
    if (boundsRef.current) loadForBounds(boundsRef.current);
  }, [loadForBounds]);

  const retryFirstLoad = useCallback(() => {
    if (!boundsRef.current) return;
    setFeed({ status: "waking", startedAt: Date.now() });
    loadForBounds(boundsRef.current);
  }, [loadForBounds]);

  const handleSearch = useCallback(
    (query: string) => {
      if (!query.trim()) {
        setSearchMode(false);
        reload();
        return;
      }
      setSearchMode(true);
      if (timerRef.current) clearInterval(timerRef.current);
      loadFeed((signal) => fetchAircraftByCallsign(query.trim(), signal), "Search failed.");
    },
    [loadFeed, reload]
  );

  const handleBoundsChange = useCallback(
    (bounds: Bounds) => {
      boundsRef.current = bounds;
      loadForBounds(bounds);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(reload, 60000);
    },
    [loadForBounds, reload]
  );

  const handleSelect = useCallback(async (ac: AircraftState | null) => {
    selectedIcaoRef.current = ac?.icao24 ?? null;
    setAircraftInfo(undefined);
    if (!ac) {
      setSelection(null);
      setRoute(null);
      return;
    }
    const icao24 = ac.icao24;
    setSelection({ icao24, snapshot: ac });
    setRoute({ icao24, status: "loading", path: [], departure: null, arrival: null, arrivalCoords: null });

    // A late response for a previously selected plane must not touch the current route.
    const patchRoute = (patch: Partial<Route>) =>
      setRoute((r) => (r?.icao24 === icao24 ? { ...r, ...patch } : r));

    fetchTrack(icao24)
      .then((track) => {
        patchRoute({
          status: "ready",
          path: track.path,
          departure: track.estDepartureAirport ?? null,
          arrival: track.estArrivalAirport ?? null,
        });
        if (track.estArrivalAirport) {
          fetchAirport(track.estArrivalAirport).then((airport) => {
            if (airport) patchRoute({ arrivalCoords: { lat: airport.lat, lng: airport.lng } });
          });
        }
      })
      .catch(() => patchRoute({ status: "failed" }));
    fetchAircraftInfo(icao24).then((info) => {
      if (selectedIcaoRef.current === icao24) setAircraftInfo(info);
    });
  }, []);

  const aircraft = feed.status === "live" ? feed.aircraft : NO_AIRCRAFT;
  const selected =
    selection && (aircraft.find((a) => a.icao24 === selection.icao24) ?? selection.snapshot);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100 dark:bg-[#14161a]">
      <TrackingMap
        aircraft={aircraft}
        selected={selected}
        route={route}
        onSelectAircraft={handleSelect}
        onBoundsChange={handleBoundsChange}
      />

      {/* ============ TOP FLOATING BAR ============ */}
      <div className="absolute top-3 md:top-4 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100%-20px)] md:w-auto md:min-w-[540px] flex items-center gap-2 px-3 py-1.5 bg-white/95 dark:bg-[#161920]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 rounded-xl shadow-2xl">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-5 h-5 text-fr24-yellow">
            <svg viewBox="0 0 32 32" fill="currentColor">
              <path d={PLANE_PATH} />
            </svg>
          </div>
          <span className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight hidden md:inline">
            Flight Tracker
          </span>
        </div>
        <div className="w-px h-[18px] bg-black/10 dark:bg-white/10 hidden md:block" />
        <form
          className="flex-1 flex items-center gap-2 min-w-0"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(searchQuery);
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search callsign (e.g. KAL123)"
            className="fr-input flex-1 text-[13px] py-1 min-w-0"
          />
          {searchMode && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchMode(false);
                reload();
              }}
              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white px-1.5 py-0.5 rounded transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </form>
        <ThemeToggle />
      </div>

      {feed.status !== "live" && <FirstLoadOverlay feed={feed} onRetry={retryFirstLoad} />}

      {/* ============ LEFT DETAIL PANEL (desktop) / BOTTOM SHEET (mobile) ============ */}
      {selected && (
        <div className="absolute z-[1000] bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto scrollbar-thin md:bottom-auto md:right-auto md:top-[68px] md:left-3.5 md:w-[360px] md:max-h-[calc(100vh-88px)] rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-slide-in">
          <div className="bg-white/95 dark:bg-[#161920]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 md:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-0 md:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* ----- BODY ----- */}
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-[22px] font-bold tracking-tight leading-none text-slate-900 dark:text-slate-100">
                    {selected.callsign?.trim() || selected.icao24}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono px-1.5 py-0.5 rounded border border-black/10 dark:border-white/10">
                    {selected.icao24.toUpperCase()}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {selected.originCountry}
                  </span>
                  <button
                    onClick={() => handleSelect(null)}
                    aria-label="Close"
                    className="shrink-0 w-8 h-8 -mr-1 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-black/5 dark:hover:bg-white/10 grid place-items-center text-lg leading-none transition-colors"
                  >
                    ×
                  </button>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                  {aircraftInfo?.model || "Aircraft"}
                  {aircraftInfo?.operator
                    ? ` · ${aircraftInfo.operator}`
                    : ` · ${selected.originCountry}`}
                </p>
              </div>

              {/* Route + progress */}
              {route?.status === "loading" ? (
                <div className="text-[12px] text-slate-400 dark:text-slate-500">Loading flight path…</div>
              ) : route?.status === "failed" ? (
                <div className="text-[12px] text-slate-400 dark:text-slate-500">Flight path unavailable</div>
              ) : route && (route.departure || route.arrival) ? (
                <div className="grid grid-cols-[auto_1fr_auto] items-end gap-3">
                  <div>
                    <div className="text-[22px] font-bold tracking-tight text-fr24-yellow leading-none">
                      {route.departure || "---"}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mt-1">
                      Departure
                    </div>
                  </div>
                  <div className="relative h-[4px] rounded-full bg-black/10 dark:bg-white/10 mb-3 overflow-visible">
                  </div>
                  <div>
                    <div className="text-[22px] font-bold tracking-tight text-fr24-orange leading-none text-right">
                      {route.arrival || "---"}
                    </div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mt-1 text-right">
                      Arrival
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Stats grid 2×2 */}
              <div className="grid grid-cols-2 gap-px bg-black/[0.06] dark:bg-white/[0.06] border border-black/[0.06] dark:border-white/[0.06] rounded-xl overflow-hidden">
                <StatCell
                  label="Altitude"
                  value={
                    selected.altitude != null
                      ? Math.round(selected.altitude * 3.281).toLocaleString()
                      : "—"
                  }
                  unit={selected.altitude != null ? "ft" : undefined}
                  sub={
                    selected.altitude != null
                      ? `${Math.round(selected.altitude).toLocaleString()} m`
                      : undefined
                  }
                />
                <StatCell
                  label="Ground speed"
                  value={
                    selected.velocity != null
                      ? Math.round(selected.velocity * 1.944).toString()
                      : "—"
                  }
                  unit={selected.velocity != null ? "kts" : undefined}
                  sub={
                    selected.velocity != null
                      ? `${Math.round(selected.velocity * 3.6)} km/h`
                      : undefined
                  }
                />
                <StatCell
                  label="Heading"
                  value={selected.heading != null ? `${Math.round(selected.heading)}°` : "—"}
                />
                <StatCell
                  label="Vertical rate"
                  value={
                    selected.verticalRate != null
                      ? `${selected.verticalRate > 0 ? "+" : ""}${Math.round(selected.verticalRate)}`
                      : "—"
                  }
                  unit={selected.verticalRate != null ? "m/s" : undefined}
                />
              </div>

              {/* Position row */}
              <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tracking-tight">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mr-2">
                  POS
                </span>
                {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
              </div>

              {/* Aircraft details */}
              {aircraftInfo !== null && (
                <div className="pt-3 border-t border-black/[0.08] dark:border-white/[0.08]">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2">
                    Aircraft
                  </div>
                  {aircraftInfo === undefined ? (
                    <div className="text-[12px] text-slate-400 dark:text-slate-500">
                      Loading aircraft details…
                    </div>
                  ) : (
                    <div>
                      {aircraftInfo.registration && (
                        <MetaRow k="Registration" v={aircraftInfo.registration} mono />
                      )}
                      {aircraftInfo.model && <MetaRow k="Model" v={aircraftInfo.model} />}
                      {aircraftInfo.manufacturerName && (
                        <MetaRow k="Manufacturer" v={aircraftInfo.manufacturerName} />
                      )}
                      {aircraftInfo.operator && <MetaRow k="Operator" v={aircraftInfo.operator} />}
                      {aircraftInfo.owner &&
                        aircraftInfo.owner !== aircraftInfo.operator && (
                          <MetaRow k="Owner" v={aircraftInfo.owner} />
                        )}
                      {aircraftInfo.built && <MetaRow k="Built" v={aircraftInfo.built} />}
                      {aircraftInfo.categoryDescription && (
                        <MetaRow k="Category" v={aircraftInfo.categoryDescription} />
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ BOTTOM LIVE BAR ============ */}
      {feed.status === "live" && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-[900] transition-all duration-200 ${
            selected ? "bottom-[62vh] md:bottom-4" : "bottom-4"
          }`}
        >
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/95 dark:bg-[#161920]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 text-[11.5px] shadow-lg">
            <span className="flex items-center gap-1.5 text-fr24-yellow font-semibold tracking-[0.08em]">
              <span className="w-[6px] h-[6px] rounded-full bg-fr24-yellow shadow-[0_0_6px_#FBD200] animate-blink" />
              LIVE
            </span>
            <span className="text-slate-300 dark:text-slate-600">·</span>
            <span className="text-slate-600 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white font-semibold">
                {feed.aircraft.length.toLocaleString()}
              </strong>
              {" aircraft"}
              {searchMode && " found"}
            </span>
            <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
            {feed.refreshing ? (
              <span className="text-fr24-yellow animate-pulse">updating…</span>
            ) : (
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                updated{" "}
                <strong className="text-slate-900 dark:text-white font-medium">
                  {feed.updatedAt.toLocaleTimeString()}
                </strong>
              </span>
            )}
            {feed.staleError && (
              <>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <span className="text-slate-500 dark:text-slate-400">Update failed</span>
                <button onClick={reload} className="text-fr24-orange font-medium hover:underline">
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// --- Sub-components ---

function StatCell({
  label,
  value,
  unit,
  sub,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  return (
    <div className="bg-white dark:bg-[#161920] px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tracking-tight tabular-nums">
        {value}
        {unit && (
          <span className="text-[10.5px] font-medium text-slate-400 dark:text-slate-500 ml-1">
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
          {sub}
        </div>
      )}
    </div>
  );
}

function MetaRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-black/[0.04] dark:border-white/[0.04] last:border-b-0 text-[12px]">
      <span className="text-slate-500 dark:text-slate-400">{k}</span>
      <span
        className={`text-slate-900 dark:text-slate-100 font-medium ${mono ? "font-mono" : ""}`}
      >
        {v}
      </span>
    </div>
  );
}
