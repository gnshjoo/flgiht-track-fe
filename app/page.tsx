"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AircraftInfo, AircraftState, TrackWaypoint } from "@/lib/types";
import { fetchAircraft, fetchAircraftByCallsign, fetchAircraftInfo, fetchTrack, fetchAirport } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const TrackingMap = dynamic(() => import("@/components/TrackingGlobe"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-[#0a0e1a]">
      <div className="text-cyan-600 dark:text-cyan-400 text-sm animate-pulse">Loading map...</div>
    </div>
  ),
});

type Bounds = {
  lamin: number;
  lomin: number;
  lamax: number;
  lomax: number;
};

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

  // Search by callsign
  const handleSearch = useCallback(async (query: string) => {
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
  }, [loadForBounds]);

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

  // Select aircraft → fetch track + nearest airports + aircraft info
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
    // Fetch aircraft metadata
    fetchAircraftInfo(ac.icao24).then((info) => {
      setAircraftInfo(info);
      setInfoLoading(false);
    });
  }, []);

  // Derived data
  const airborne = trackPath.filter((wp) => !wp.onGround);
  const departureWp = airborne.length > 0 ? airborne[0] : null;
  const currentWp = airborne.length > 0 ? airborne[airborne.length - 1] : null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-50 dark:bg-[#0a0e1a]">
      {/* App title + search + theme toggle */}
      <div className="absolute top-3 left-3 right-3 md:top-6 md:left-6 md:right-auto z-[1000] flex items-center gap-2 md:gap-3">
        <span className="text-slate-500 dark:text-white/60 text-sm font-medium tracking-wide shrink-0">
          Flight Tracker
        </span>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch(searchQuery);
          }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Callsign (e.g. YP102)"
            className="w-32 md:w-44 px-3 py-1.5 text-xs rounded-lg bg-white/70 dark:bg-black/50 backdrop-blur-md border border-black/10 dark:border-white/10 text-slate-800 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 outline-none focus:border-cyan-400 dark:focus:border-cyan-400 transition-colors"
          />
          <button
            type="submit"
            className="px-2.5 py-1.5 text-xs rounded-lg bg-cyan-500/90 hover:bg-cyan-500 text-white font-medium transition-colors shrink-0"
          >
            Search
          </button>
          {searchMode && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSearchMode(false);
                if (boundsRef.current) loadForBounds(boundsRef.current);
              }}
              className="px-2 py-1.5 text-xs rounded-lg bg-slate-200/80 dark:bg-gray-700/80 text-slate-600 dark:text-gray-300 hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors shrink-0"
            >
              Clear
            </button>
          )}
        </form>
        <ThemeToggle />
      </div>

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

      {/* --- Bottom stats bar --- */}
      <div className={`absolute left-1/2 -translate-x-1/2 z-[1000] transition-all ${selected ? "bottom-[62vh] md:bottom-4" : "bottom-4"}`}>
        <div className="flex items-center gap-3 md:gap-4 bg-white/70 dark:bg-black/60 backdrop-blur-md px-3 md:px-4 py-2 rounded-lg text-xs border border-black/10 dark:border-white/5">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#22d3ee", boxShadow: "0 0 6px #22d3ee" }}
            />
            <span className="text-slate-600 dark:text-gray-300">
              {count.toLocaleString()} aircraft{searchMode && " found"}
            </span>
          </div>
          {loading && <span className="text-cyan-600 dark:text-cyan-400 animate-pulse">loading...</span>}
          {lastUpdate && !loading && <span className="text-slate-400 dark:text-gray-500 hidden sm:inline">{lastUpdate}</span>}
          {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
        </div>
      </div>

      {/* --- Aircraft detail panel --- */}
      {selected && (
        <div className="absolute z-[1000] bottom-0 left-0 right-0 max-h-[60vh] overflow-y-auto scrollbar-thin md:bottom-auto md:left-auto md:top-16 md:right-3 md:w-[340px] md:max-h-[calc(100vh-5rem)] md:rounded-xl rounded-t-xl">
          <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-md md:rounded-xl rounded-t-xl border border-black/10 dark:border-white/10 shadow-2xl">
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-2 pb-0 md:hidden">
              <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-gray-600" />
            </div>
            {/* Header */}
            <div className="p-4 pb-3 border-b border-black/10 dark:border-white/10">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-amber-500 dark:text-amber-400 font-bold text-xl font-mono leading-tight">
                    {selected.callsign || selected.icao24}
                  </h3>
                  <p className="text-slate-500 dark:text-gray-400 text-sm mt-0.5">
                    ICAO {selected.icao24} · {selected.originCountry}
                  </p>
                </div>
                <button
                  onClick={() => handleSelect(null)}
                  className="text-slate-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white transition-colors text-2xl leading-none ml-2 -mt-1 p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Aircraft Metadata */}
            {(infoLoading || aircraftInfo !== undefined) && (
              <div className="p-4 border-b border-black/10 dark:border-white/10">
                <SectionTitle>Aircraft Details</SectionTitle>
                {infoLoading ? (
                  <div className="text-xs text-cyan-600 dark:text-cyan-400 animate-pulse mt-2">Loading aircraft details...</div>
                ) : aircraftInfo ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                    {aircraftInfo.registration && (
                      <InfoCell label="Registration" value={aircraftInfo.registration} />
                    )}
                    {aircraftInfo.model && (
                      <InfoCell label="Model" value={aircraftInfo.model} />
                    )}
                    {aircraftInfo.manufacturerName && (
                      <InfoCell label="Manufacturer" value={aircraftInfo.manufacturerName} />
                    )}
                    {aircraftInfo.operator && (
                      <InfoCell label="Operator" value={aircraftInfo.operator} />
                    )}
                    {aircraftInfo.owner && aircraftInfo.owner !== aircraftInfo.operator && (
                      <InfoCell label="Owner" value={aircraftInfo.owner} />
                    )}
                    {aircraftInfo.built && (
                      <InfoCell label="Built" value={aircraftInfo.built} />
                    )}
                    {aircraftInfo.categoryDescription && (
                      <InfoCell label="Category" value={aircraftInfo.categoryDescription} />
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 dark:text-gray-500 mt-2">No aircraft details available</div>
                )}
              </div>
            )}

            {/* Flight Info */}
            <div className="p-4 border-b border-black/10 dark:border-white/10">
              <SectionTitle>Flight Info</SectionTitle>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
                {selected.altitude != null && (
                  <InfoCell
                    label="Altitude"
                    value={`${Math.round(selected.altitude).toLocaleString()}m`}
                    sub={`${Math.round(selected.altitude * 3.281).toLocaleString()} ft`}
                  />
                )}
                {selected.velocity != null && (
                  <InfoCell
                    label="Speed"
                    value={`${Math.round(selected.velocity * 3.6)} km/h`}
                    sub={`${Math.round(selected.velocity * 1.944)} kts`}
                  />
                )}
                {selected.heading != null && (
                  <InfoCell label="Heading" value={`${Math.round(selected.heading)}°`} />
                )}
                {selected.verticalRate != null && (
                  <InfoCell
                    label="Vertical Rate"
                    value={`${selected.verticalRate > 0 ? "+" : ""}${Math.round(selected.verticalRate)} m/s`}
                  />
                )}
                <InfoCell
                  label="Position"
                  value={`${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`}
                />
              </div>
            </div>

            {/* Track info */}
            {trackLoading && (
              <div className="p-4 text-center text-sm text-cyan-600 dark:text-cyan-400 animate-pulse">
                Loading flight path...
              </div>
            )}

            {airborne.length > 0 && !trackLoading && (
              <div className="p-4 space-y-4">
                {/* Route summary: DEP → ARR */}
                <div className="flex items-center justify-center gap-3">
                  <div className="text-center">
                    <div className="text-amber-500 dark:text-amber-400 font-bold text-lg font-mono">
                      {departureAirport || "---"}
                    </div>
                    <div className="text-slate-400 dark:text-gray-500 text-xs">Departure</div>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 dark:text-gray-500">
                    <div className="w-8 h-px bg-slate-300 dark:bg-gray-600" />
                    <span className="text-base">✈</span>
                    <div className="w-8 h-px bg-slate-300 dark:bg-gray-600" />
                  </div>
                  <div className="text-center">
                    <div className="text-cyan-500 dark:text-cyan-400 font-bold text-lg font-mono">
                      {arrivalAirport || "---"}
                    </div>
                    <div className="text-slate-400 dark:text-gray-500 text-xs">Arrival</div>
                  </div>
                </div>

                {/* Departure detail */}
                <div className="border border-black/5 dark:border-white/5 rounded-lg p-3 bg-black/[0.02] dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 dark:bg-amber-400 shrink-0" />
                    <span className="text-amber-500 dark:text-amber-400 font-semibold text-sm">
                      Departed {departureAirport ? `(${departureAirport})` : ""}
                    </span>
                  </div>
                  {departureWp && (
                    <div className="grid grid-cols-2 gap-2 text-xs ml-4">
                      <InfoMini
                        label="Position"
                        value={`${departureWp.latitude.toFixed(4)}, ${departureWp.longitude.toFixed(4)}`}
                      />
                      {departureWp.altitude != null && (
                        <InfoMini
                          label="Altitude"
                          value={`${Math.round(departureWp.altitude).toLocaleString()}m`}
                        />
                      )}
                      <InfoMini
                        label="Time"
                        value={new Date(departureWp.time * 1000).toLocaleTimeString()}
                      />
                    </div>
                  )}
                </div>

                {/* Current position detail */}
                <div className="border border-black/5 dark:border-white/5 rounded-lg p-3 bg-black/[0.02] dark:bg-white/[0.02]">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 dark:bg-cyan-400 shrink-0" />
                    <span className="text-cyan-500 dark:text-cyan-400 font-semibold text-sm">
                      Current Position
                    </span>
                  </div>
                  {currentWp && (
                    <div className="grid grid-cols-2 gap-2 text-xs ml-4">
                      <InfoMini
                        label="Position"
                        value={`${currentWp.latitude.toFixed(4)}, ${currentWp.longitude.toFixed(4)}`}
                      />
                      {currentWp.altitude != null && (
                        <InfoMini
                          label="Altitude"
                          value={`${Math.round(currentWp.altitude).toLocaleString()}m`}
                        />
                      )}
                      {currentWp.heading != null && (
                        <InfoMini label="Heading" value={`${Math.round(currentWp.heading)}°`} />
                      )}
                      <InfoMini
                        label="Time"
                        value={new Date(currentWp.time * 1000).toLocaleTimeString()}
                      />
                    </div>
                  )}
                </div>

                {/* Waypoints list */}
                <div>
                  <SectionTitle>
                    Waypoints ({airborne.length})
                  </SectionTitle>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                    {airborne.map((wp, i) => (
                      <div
                        key={i}
                        className="flex items-center text-xs gap-2 px-2 py-1.5 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <span className="text-slate-400 dark:text-gray-600 w-5 text-right shrink-0 font-mono">
                          {i + 1}
                        </span>
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            i === 0
                              ? "bg-amber-500 dark:bg-amber-400"
                              : i === airborne.length - 1
                                ? "bg-cyan-500 dark:bg-cyan-400"
                                : "bg-slate-300 dark:bg-gray-600"
                          }`}
                        />
                        <span className="text-slate-600 dark:text-gray-300 font-mono">
                          {wp.latitude.toFixed(3)}, {wp.longitude.toFixed(3)}
                        </span>
                        {wp.altitude != null && (
                          <span className="text-slate-400 dark:text-gray-500 ml-auto">
                            {Math.round(wp.altitude).toLocaleString()}m
                          </span>
                        )}
                        <span className="text-slate-400 dark:text-gray-600 text-[10px]">
                          {new Date(wp.time * 1000).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {trackPath.length === 0 && !trackLoading && (
              <div className="p-4 text-center text-sm text-slate-400 dark:text-gray-600">
                No track data available.
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

// --- Sub-components ---

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] text-slate-400 dark:text-gray-500 font-semibold uppercase tracking-wider">
      {children}
    </div>
  );
}

function InfoCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <div className="text-slate-400 dark:text-gray-500 text-[11px] uppercase tracking-wide">{label}</div>
      <div className="text-slate-900 dark:text-white font-medium text-sm">
        {value}
        {sub && <span className="text-slate-400 dark:text-gray-500 ml-1 font-normal text-xs">{sub}</span>}
      </div>
    </div>
  );
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-slate-400 dark:text-gray-600 text-[10px]">{label}</div>
      <div className="text-slate-600 dark:text-gray-300 text-xs">{value}</div>
    </div>
  );
}
