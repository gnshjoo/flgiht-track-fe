"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { AircraftState, TrackWaypoint } from "@/lib/types";
import { fetchAircraft, fetchTrack, fetchAirport } from "@/lib/api";
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

  // Select aircraft → fetch track + nearest airports
  const handleSelect = useCallback(async (ac: AircraftState | null) => {
    setSelected(ac);
    setDepartureAirport(null);
    setArrivalAirport(null);
    setArrivalCoords(null);
    if (!ac) {
      setTrackPath([]);
      return;
    }
    setTrackLoading(true);
    try {
      const track = await fetchTrack(ac.icao24);
      setTrackPath(track.path);
      setDepartureAirport(track.estDepartureAirport ?? null);
      setArrivalAirport(track.estArrivalAirport ?? null);
      // 도착 공항 좌표 조회
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
  }, []);

  // Derived data
  const airborne = trackPath.filter((wp) => !wp.onGround);
  const departureWp = airborne.length > 0 ? airborne[0] : null;
  const currentWp = airborne.length > 0 ? airborne[airborne.length - 1] : null;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-50 dark:bg-[#0a0e1a]">
      {/* App title + theme toggle */}
      <div className="absolute top-6 left-6 z-[1000] flex items-center gap-3">
        <span className="text-slate-500 dark:text-white/60 text-sm font-medium tracking-wide">
          Flight Tracker
        </span>
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
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000]">
        <div className="flex items-center gap-4 bg-white/70 dark:bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg text-xs border border-black/10 dark:border-white/5">
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: "#22d3ee", boxShadow: "0 0 6px #22d3ee" }}
            />
            <span className="text-slate-600 dark:text-gray-300">{count.toLocaleString()} aircraft</span>
          </div>
          {loading && <span className="text-cyan-600 dark:text-cyan-400 animate-pulse">loading...</span>}
          {lastUpdate && !loading && <span className="text-slate-400 dark:text-gray-500">{lastUpdate}</span>}
          {error && <span className="text-red-500 dark:text-red-400">{error}</span>}
        </div>
      </div>

      {/* --- Aircraft detail panel --- */}
      {selected && (
        <div className="absolute top-16 right-3 z-[1000] w-[340px] max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-thin">
          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-xl border border-black/10 dark:border-white/10 shadow-2xl">
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
                  className="text-slate-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white transition-colors text-2xl leading-none ml-2 -mt-1"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Aircraft Info */}
            <div className="p-4 border-b border-black/10 dark:border-white/10">
              <SectionTitle>Aircraft Info</SectionTitle>
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
