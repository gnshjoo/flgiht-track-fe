import { AircraftResponse, TrackResponse } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export async function fetchAircraft(
  bounds?: { lamin: number; lomin: number; lamax: number; lomax: number },
  signal?: AbortSignal
): Promise<AircraftResponse> {
  let url = `${API_URL}/api/tracking/aircraft`;
  if (bounds) {
    const p = new URLSearchParams({
      lamin: String(bounds.lamin),
      lomin: String(bounds.lomin),
      lamax: String(bounds.lamax),
      lomax: String(bounds.lomax),
    });
    url += `?${p}`;
  }
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Tracking API error: ${res.status}`);
  return res.json();
}

export async function fetchNearestAirport(
  lat: number,
  lng: number
): Promise<{ iata: string; name: string } | null> {
  try {
    const res = await fetch(
      `${API_URL}/api/airports/nearest?lat=${lat}&lng=${lng}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data ? { iata: data.iata, name: data.name } : null;
  } catch {
    return null;
  }
}

export async function fetchTrack(
  icao24: string,
  signal?: AbortSignal
): Promise<TrackResponse> {
  const res = await fetch(
    `${API_URL}/api/tracking/track?icao24=${encodeURIComponent(icao24)}`,
    { signal: signal ?? AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Track API error: ${res.status}`);
  return res.json();
}
