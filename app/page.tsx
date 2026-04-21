"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { AircraftInfo, AircraftState, TrackWaypoint } from "@/lib/types";
import {
  fetchAircraft,
  fetchAircraftByCallsign,
  fetchAircraftInfo,
  fetchTrack,
  fetchAirport,
} from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const TrackingMap = dynamic(() => import("@/components/TrackingGlobe"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-[#0a0c10]">
      <div className="text-fr24-yellow text-sm animate-pulse">Loading map…</div>
    </div>
  ),
});

type Bounds = {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
};

// FR24-style top-down plane silhouette (nose up)
const PLANE_PATH =
  "M16 2 C 15.4 2 14.8 2.7 14.6 4 L 14 10 L 2 15.5 L 2 17.5 L 14 15 L 13.7 22 L 9.5 24 L 9.5 25.5 L 16 24 L 22.5 25.5 L 22.5 24 L 18.3 22 L 18 15 L 30 17.5 L 30 15.5 L 18 10 L 17.4 4 C 17.2 2.7 16.6 2 16 2 Z";

export default function TrackingPage() {
  const [aircraft, setAircraft] = useState<AircraftState[]>([]);
  const [selected, setSelected] = useState<AircraftState | null>(null);
  const [trackPath, setTrackPath] = useState<TrackWaypoint[]>([]);
  const [trackLoading, setTrackLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState("");
  const [count, setCount] = useState(0);
  const [departureAirport, setDepartureAirport] = useState<string | null>(null);
  const [arrivalAirport, setArrivalAirport] = useState<string | null>(null);
  const [arrivalCoords, setArrivalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [aircraftInfo, setAircraftInfo] = useState<AircraftInfo | null | undefined>(undefined);
  const [infoLoading, setInfoLoading] = useState(false);

  const fetchRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const boundsRef = useRef<Bounds | null>(null);

  // Load aircraft for given bounds
  const loadForBounds = useCallback(async (bounds: Bounds) => {
    fetchRef.current?.abort();
    const ctrl = new AbortController();
    fetchRef.current = ctrl;
    try {
      setLoading(true);
      const data = await fetchAircraft(bounds, ctrl.signal);
      setAircraft(data.aircraft);
      setCount(data.aircraft.length);
      setLastUpdate(new Date().toLocaleTimeString());
      setError(null);
    } catch (e: any) {
      if (e?.name !== "AbortError") setError("Unable to load aircraft data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchMode(false);
        if (boundsRef.current) loadForBounds(boundsRef.current);
        return;
      }
      fetchRef.current?.abort();
      const ctrl = new AbortController();
      fetchRef.current = ctrl;
      try {
        setLoading(true);
        setSearchMode(true);
        if (timerRef.current) clearInterval(timerRef.current);
        const data = await fetchAircraftByCallsign(query.trim(), ctrl.signal);
        setAircraft(data.aircraft);
        setCount(data.aircraft.length);
        setLastUpdate(new Date().toLocaleTimeString());
        setError(null);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError("Search failed.");
      } finally {
        setLoading(false);
      }
    },
    [loadForBounds]
  );

  const handleBoundsChange = useCallback(
    (bounds: Bounds) => {
      boundsRef.current = bounds;
      loadForBounds(bounds);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        if (boundsRef.current) loadForBounds(boundsRef.current);
      }, 60000);
    },
    [loadForBounds]
  );

  const handleSelect = useCallback(async (ac: AircraftState | null) => {
    setSelected(ac);
    setDepartureAirport(null);
    setArrivalAirport(null);
    setArrivalCoords(null);
    setAircraftInfo(undefined);
    if (!ac) {
      setTrackPath([]);
      return;
    }
    setTrackLoading(true);
    setInfoLoading(true);
    try {
      const track = await fetchTrack(ac.icao24);
      setTrackPath(track.path);
      setDepartureAirport(track.estDepartureAirport ?? null);
      setArrivalAirport(track.estArrivalAirport ?? null);
      if (track.estArrivalAirport) {
        fetchAirport(track.estArrivalAirport).then((airport) => {
          if (airport) setArrivalCoords({ lat: airport.lat, lng: airport.lng });
        });
      }
    } catch {
      setTrackPath([]);
    } finally {
      setTrackLoading(false);
    }
    fetchAircraftInfo(ac.icao24).then((info) => {
      setAircraftInfo(info);
      setInfoLoading(false);
    });
  }, []);

  const airborne = trackPath.filter((wp) => !wp.onGround);
  const hasRoute = airborne.length > 0 && (departureAirport || arrivalAirport);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-100 dark:bg-[#14161a]">
      <TrackingMap
        aircraft={aircraft}
        trackPath={trackPath}
        selectedIcao={selected?.icao24 ?? null}
        onSelectAircraft={handleSelect}
        onBoundsChange={handleBoundsChange}
        departureAirport={departureAirport}
        arrivalAirport={arrivalAirport}
        arrivalCoords={arrivalCoords}
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
            placeholder="Search by callsign, airport, registration…"
            className="fr-input flex-1 text-[13px] py-1 min-w-0"
          />
          {searchMode && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchMode(false);
                if (boundsRef.current) loadForBounds(boundsRef.current);
              }}
              className="text-[11px] text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white px-1.5 py-0.5 rounded transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </form>
        <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono border border-black/10 dark:border-white/10 rounded text-slate-500 dark:text-slate-400 shrink-0">
          ⌘K
        </kbd>
        <ThemeToggle />
      </div>

      {/* ============ FILTER CHIPS (desktop) ============ */}
      <div className="hidden md:flex absolute top-[68px] left-3.5 gap-1.5 z-[900]">
        <div className="px-2.5 py-1.5 rounded-lg text-[12px] flex items-center gap-1.5 bg-white/95 dark:bg-[#161920]/95 backdrop-blur-xl border border-fr24-yellow/40 text-slate-900 dark:text-slate-100">
          All<span className="text-fr24-yellow font-semibold">{count.toLocaleString()}</span>
        </div>
        <FilterChip>Airborne</FilterChip>
        <FilterChip>Ground</FilterChip>
        <FilterChip>Altitude</FilterChip>
        <FilterChip>Airline</FilterChip>
      </div>

      {/* ============ LEFT DETAIL PANEL (desktop) / BOTTOM SHEET (mobile) ============ */}
      {selected && (
        <div className="absolute z-[1000] bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto scrollbar-thin md:bottom-auto md:right-auto md:top-[68px] md:left-3.5 md:w-[360px] md:max-h-[calc(100vh-88px)] rounded-t-2xl md:rounded-2xl animate-slide-up md:animate-slide-in">
          <div className="bg-white/95 dark:bg-[#161920]/95 backdrop-blur-xl border border-black/10 dark:border-white/10 md:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden">
            {/* Mobile drag handle */}
            <div className="flex justify-center pt-2 pb-0 md:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            </div>

            {/* ----- HERO ----- */}
            <div className="relative h-[152px] bg-gradient-to-br from-slate-700 via-slate-800 to-[#0a0c10] overflow-hidden">
              <div className="absolute top-3 left-3 z-[2] px-2.5 py-1 text-[11px] font-medium bg-black/65 border border-white/10 rounded-md text-slate-100 backdrop-blur-sm tracking-wide">
                {selected.originCountry}
              </div>
              <button
                onClick={() => handleSelect(null)}
                aria-label="Close"
                className="absolute top-2.5 right-2.5 z-[2] w-8 h-8 bg-black/65 border border-white/10 rounded-lg text-white hover:bg-black/85 grid place-items-center text-lg leading-none transition-colors"
              >
                ×
              </button>
              <div className="absolute inset-0 grid place-items-center opacity-[0.22] text-fr24-yellow">
                <svg viewBox="0 0 32 32" fill="currentColor" className="w-[110px] h-[110px]">
                  <path d={PLANE_PATH} />
                </svg>
              </div>
              {(aircraftInfo?.model || aircraftInfo?.registration) && (
                <div className="absolute bottom-2.5 left-3 z-[2] text-[11px] text-slate-200/90 tracking-wide">
                  {aircraftInfo?.model}
                  {aircraftInfo?.registration ? ` · ${aircraftInfo.registration}` : ""}
                </div>
              )}
            </div>

            {/* ----- BODY ----- */}
            <div className="p-4 space-y-4">
              {/* Title */}
              <div>
                <div className="flex items-baseline gap-2.5">
                  <h3 className="text-[22px] font-bold tracking-tight leading-none text-slate-900 dark:text-slate-100">
                    {selected.callsign?.trim() || selected.icao24}
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono px-1.5 py-0.5 rounded border border-black/10 dark:border-white/10">
                    {selected.icao24.toUpperCase()}
                  </span>
                </div>
                <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
                  {aircraftInfo?.model || "Aircraft"}
                  {aircraftInfo?.operator
                    ? ` · ${aircraftInfo.operator}`
                    : ` · ${selected.originCountry}`}
                </p>
              </div>

              {/* Route + progress */}
              {hasRoute ? (
                <div className="grid grid-cols-[auto_1fr_auto] items-end gap-3">
                  <div>
                    <div className="text-[22px] font-bold tracking-tight text-fr24-yellow leading-none">
                      {departureAirport || "---"}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 tracking-wide">
                      Departure
                    </div>
                  </div>
                  <div className="relative h-[4px] rounded-full bg-black/10 dark:bg-white/10 mb-3 overflow-visible">
                    <div className="absolute inset-y-0 left-0 w-[47%] bg-gradient-to-r from-fr24-yellow to-fr24-orange rounded-full" />
                    <div className="absolute left-[47%] top-1/2 -translate-x-1/2 -translate-y-1/2 w-[18px] h-[18px] bg-fr24-orange border-2 border-white dark:border-[#161920] rounded-full grid place-items-center text-white shadow-[0_0_10px_rgba(255,122,0,0.6)]">
                      <svg viewBox="0 0 32 32" fill="currentColor" className="w-[10px] h-[10px] rotate-90">
                        <path d={PLANE_PATH} />
                      </svg>
                    </div>
                  </div>
                  <div>
                    <div className="text-[22px] font-bold tracking-tight text-fr24-orange leading-none text-right">
                      {arrivalAirport || "---"}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 text-right tracking-wide">
                      Arrival
                    </div>
                  </div>
                </div>
              ) : trackLoading ? (
                <div className="text-[12px] text-fr24-yellow animate-pulse text-center py-2">
                  Loading flight path…
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
                <span className="text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] text-[9.5px] font-semibold mr-2">
                  POS
                </span>
                {selected.latitude.toFixed(4)}, {selected.longitude.toFixed(4)}
              </div>

              {/* Aircraft details */}
              {(aircraftInfo || infoLoading) && (
                <div className="pt-3 border-t border-black/[0.08] dark:border-white/[0.08]">
                  <div className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2">
                    Aircraft
                  </div>
                  {infoLoading ? (
                    <div className="text-[11px] text-fr24-yellow animate-pulse">
                      Loading aircraft details…
                    </div>
                  ) : aircraftInfo ? (
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
                  ) : (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">
                      No aircraft details available
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============ BOTTOM LIVE BAR ============ */}
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
              {count.toLocaleString()}
            </strong>
            {" aircraft"}
            {searchMode && " found"}
          </span>
          {loading && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="text-fr24-yellow animate-pulse">loading…</span>
            </>
          )}
          {lastUpdate && !loading && (
            <>
              <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">·</span>
              <span className="text-slate-500 dark:text-slate-400 hidden sm:inline">
                updated{" "}
                <strong className="text-slate-900 dark:text-white font-medium">
                  {lastUpdate}
                </strong>
              </span>
            </>
          )}
          {error && (
            <>
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="text-red-500 dark:text-red-400">{error}</span>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

// --- Sub-components ---

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 rounded-lg text-[12px] bg-white/85 dark:bg-[#161920]/85 backdrop-blur-xl border border-black/10 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer transition-colors">
      {children}
    </div>
  );
}

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
      <div className="text-[9.5px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em]">
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
