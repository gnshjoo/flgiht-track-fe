import type { TrackWaypoint } from "./types";

export type LatLng = { lat: number; lng: number };

// Shift lng by multiples of 360 so it lands within 180 of ref.
export function unwrapLng(lng: number, ref: number): number {
  let cur = lng;
  while (cur - ref > 180) cur -= 360;
  while (cur - ref < -180) cur += 360;
  return cur;
}

// Airborne waypoints in time order, longitudes unwrapped across the antimeridian
// (e.g. ICN to LAX over the Pacific). `live` is the plane's current position:
// the trace lags it, so it becomes the last vertex.
export function trackLine(path: TrackWaypoint[], live: LatLng | null): LatLng[] {
  const line: LatLng[] = [];
  const airborne = path
    .filter((wp) => !wp.onGround)
    .sort((a, b) => a.time - b.time);
  for (const wp of airborne) {
    const prev = line[line.length - 1];
    if (prev && prev.lat === wp.latitude && prev.lng === unwrapLng(wp.longitude, prev.lng)) continue;
    line.push({ lat: wp.latitude, lng: prev ? unwrapLng(wp.longitude, prev.lng) : wp.longitude });
  }
  if (live && line.length > 0) {
    line.push({ lat: live.lat, lng: unwrapLng(live.lng, line[line.length - 1].lng) });
  }
  return line;
}
