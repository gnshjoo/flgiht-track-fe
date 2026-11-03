import type { AircraftState, PollMeta } from "./types.ts";
import { unwrapLng, type LatLng } from "./track.ts";

export const EASE_MS = 1_000;
/** Below this ground speed (m/s, about 30 kt) a plane is treated as stationary. */
export const MIN_MOVING_MS = 15;
/** A feed that stopped updating a plane must not carry it across the map. */
export const MAX_EXTRAPOLATE_MS = 60_000;
export const MAX_MISSED_POLLS = 2;

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

export type Fix = {
  lat: number;
  lng: number;
  headingDeg: number | null;
  speedMs: number | null;
  /** When the feed saw this position, on the client clock. */
  atMs: number;
};

export type Motion = {
  fix: Fix;
  /** Displayed position when this fix arrived; positionAt eases from here. */
  from: LatLng;
  arrivedMs: number;
  /** Consecutive polls this plane was absent from. */
  misses: number;
  state: AircraftState;
};

export type MotionMap = ReadonlyMap<string, Motion>;

/** Longitude is left unwrapped so a plane crossing 180° keeps moving instead of jumping. */
export function deadReckon(fix: Fix, tMs: number): LatLng {
  const { speedMs, headingDeg } = fix;
  if (speedMs == null || speedMs < MIN_MOVING_MS || headingDeg == null) {
    return { lat: fix.lat, lng: fix.lng };
  }
  const dtMs = Math.min(Math.max(tMs - fix.atMs, 0), MAX_EXTRAPOLATE_MS);
  const delta = (speedMs * dtMs) / 1000 / EARTH_RADIUS_M;
  const theta = headingDeg * RAD;
  const phi1 = fix.lat * RAD;
  const sinPhi2 = Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta);
  const phi2 = Math.asin(sinPhi2);
  const dLambda = Math.atan2(
    Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
    Math.cos(delta) - Math.sin(phi1) * sinPhi2
  );
  return { lat: phi2 / RAD, lng: fix.lng + dLambda / RAD };
}

const smoothstep = (x: number) => x * x * (3 - 2 * x);

export function positionAt(m: Motion, nowMs: number): LatLng {
  const target = deadReckon(m.fix, nowMs);
  // Chained off `from` so the longitude never jumps by 360° at the antimeridian.
  const targetLng = unwrapLng(target.lng, m.from.lng);
  const s = smoothstep(Math.min(Math.max((nowMs - m.arrivedMs) / EASE_MS, 0), 1));
  return {
    lat: m.from.lat + (target.lat - m.from.lat) * s,
    lng: m.from.lng + (targetLng - m.from.lng) * s,
  };
}

/**
 * Fold a poll into the motion map. A plane's fix time is the feed's own
 * timestamp shifted onto the client clock by the snapshot's server-side age,
 * so a skewed client clock never moves planes.
 */
export function applySnapshot(
  prev: MotionMap,
  aircraft: AircraftState[],
  meta: Pick<PollMeta, "servedAt">,
  nowMs: number,
  replace: boolean
): MotionMap {
  const next = new Map<string, Motion>();
  for (const ac of aircraft) {
    const ageMs = (meta.servedAt - (ac.seenAt ?? meta.servedAt)) * 1000;
    const fix: Fix = {
      lat: ac.latitude,
      lng: ac.longitude,
      headingDeg: ac.heading,
      speedMs: ac.velocity,
      atMs: nowMs - ageMs,
    };
    const old = prev.get(ac.icao24);
    next.set(ac.icao24, {
      fix,
      from: old ? positionAt(old, nowMs) : deadReckon(fix, nowMs),
      // A plane seen for the first time has nothing to ease from.
      arrivedMs: old ? nowMs : nowMs - EASE_MS,
      misses: 0,
      state: ac,
    });
  }
  if (!replace) {
    prev.forEach((m, id) => {
      if (next.has(id) || m.misses + 1 >= MAX_MISSED_POLLS) return;
      next.set(id, { ...m, misses: m.misses + 1 });
    });
  }
  return next;
}

export function liveState(m: Motion, nowMs: number): AircraftState {
  const p = positionAt(m, nowMs);
  return { ...m.state, latitude: p.lat, longitude: unwrapLng(p.lng, 0) };
}
