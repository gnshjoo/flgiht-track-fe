import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySnapshot,
  deadReckon,
  EASE_MS,
  liveState,
  MAX_EXTRAPOLATE_MS,
  positionAt,
  type Fix,
  type MotionMap,
} from "./motion.ts";
import type { AircraftState } from "./types.ts";

const KM_PER_DEG_LAT = 111.195;

const fix = (over: Partial<Fix> = {}): Fix => ({
  lat: 37,
  lng: 127,
  headingDeg: 90,
  speedMs: 250,
  atMs: 0,
  ...over,
});

const plane = (over: Partial<AircraftState> = {}): AircraftState => ({
  icao24: "abc123",
  callsign: "KAL1",
  originCountry: "KR",
  longitude: 127,
  latitude: 37,
  altitude: 10000,
  velocity: 250,
  heading: 90,
  verticalRate: 0,
  ...over,
});

const meta = { servedAt: 1_000 };
const empty: MotionMap = new Map();

test("a plane at 250 m/s heading east moves about 2.5 km east in 10 s", () => {
  const p = deadReckon(fix(), 10_000);
  const eastKm = (p.lng - 127) * KM_PER_DEG_LAT * Math.cos((37 * Math.PI) / 180);
  assert.ok(Math.abs(eastKm - 2.5) < 0.05, `moved ${eastKm} km`);
  assert.ok(Math.abs(p.lat - 37) < 0.001);
});

test("heading north increases latitude and south decreases it", () => {
  assert.ok(deadReckon(fix({ headingDeg: 0 }), 10_000).lat > 37);
  assert.ok(deadReckon(fix({ headingDeg: 180 }), 10_000).lat < 37);
});

test("planes without speed, heading, or real speed stay put", () => {
  for (const f of [fix({ speedMs: null }), fix({ speedMs: 14 }), fix({ headingDeg: null })]) {
    assert.deepEqual(deadReckon(f, 30_000), { lat: 37, lng: 127 });
  }
});

test("a plane stops advancing 60 s after its fix", () => {
  const at60 = deadReckon(fix(), MAX_EXTRAPOLATE_MS);
  assert.deepEqual(deadReckon(fix(), MAX_EXTRAPOLATE_MS + 120_000), at60);
});

test("a fresh poll starts at the old projection and ends at the new one", () => {
  const first = applySnapshot(empty, [plane()], meta, 0, false);
  const shown = positionAt(first.get("abc123")!, 10_000);
  const next = applySnapshot(first, [plane({ longitude: 127.05, latitude: 37.01 })], meta, 10_000, false);
  const m = next.get("abc123")!;
  assert.deepEqual(positionAt(m, 10_000), shown);
  const end = positionAt(m, 10_000 + EASE_MS);
  const target = deadReckon(m.fix, 10_000 + EASE_MS);
  assert.ok(Math.abs(end.lat - target.lat) < 1e-9 && Math.abs(end.lng - target.lng) < 1e-9);
});

test("a plane absent once stays and keeps moving, absent twice is dropped", () => {
  const first = applySnapshot(empty, [plane()], meta, 0, false);
  const once = applySnapshot(first, [], meta, 10_000, false);
  assert.ok(once.has("abc123"));
  assert.ok(positionAt(once.get("abc123")!, 20_000).lng > positionAt(once.get("abc123")!, 10_000).lng);
  assert.ok(!applySnapshot(once, [], meta, 20_000, false).has("abc123"));
});

test("replacing the feed drops absent planes at once", () => {
  const first = applySnapshot(empty, [plane()], meta, 0, false);
  assert.ok(!applySnapshot(first, [plane({ icao24: "other" })], meta, 10_000, true).has("abc123"));
});

test("a plane that reappears is not dropped on its next absence", () => {
  const first = applySnapshot(empty, [plane()], meta, 0, false);
  const gone = applySnapshot(first, [], meta, 10_000, false);
  const back = applySnapshot(gone, [plane()], meta, 20_000, false);
  assert.ok(applySnapshot(back, [], meta, 30_000, false).has("abc123"));
});

test("shifting the client clock by an hour does not move planes", () => {
  const seenAt = 998;
  const a = applySnapshot(empty, [plane({ seenAt })], meta, 50_000, false).get("abc123")!;
  const hour = 3_600_000;
  const b = applySnapshot(empty, [plane({ seenAt })], meta, 50_000 + hour, false).get("abc123")!;
  const pa = positionAt(a, 55_000);
  const pb = positionAt(b, 55_000 + hour);
  assert.ok(Math.abs(pa.lng - pb.lng) < 1e-9 && Math.abs(pa.lat - pb.lat) < 1e-9);
});

test("a position seen 4 s before delivery is projected 4 s ahead on arrival", () => {
  const m = applySnapshot(empty, [plane({ seenAt: 996 })], meta, 50_000, false).get("abc123")!;
  assert.equal(m.fix.atMs, 46_000);
  const p = positionAt(m, 50_000);
  const eastKm = (p.lng - 127) * KM_PER_DEG_LAT * Math.cos((37 * Math.PI) / 180);
  assert.ok(Math.abs(eastKm - 1.0) < 0.02, `projected ${eastKm} km`);
});

test("crossing 180 degrees longitude produces no jump", () => {
  let m = applySnapshot(empty, [plane({ latitude: 0, longitude: 179.99 })], meta, 0, false);
  let last = positionAt(m.get("abc123")!, 0);
  for (let t = 1_000; t <= 40_000; t += 1_000) {
    const p = positionAt(m.get("abc123")!, t);
    assert.ok(Math.abs(p.lng - last.lng) < 0.1, `jump at ${t} ms`);
    last = p;
  }
  assert.ok(last.lng > 180);
  // The next poll reports the same plane with a wrapped longitude.
  m = applySnapshot(m, [plane({ latitude: 0, longitude: -179.9 })], meta, 40_000, false);
  const p = positionAt(m.get("abc123")!, 40_500);
  assert.ok(Math.abs(p.lng - last.lng) < 0.2, `wrapped poll jumped to ${p.lng}`);
});

test("the panel state wraps longitude back into -180..180", () => {
  const m = applySnapshot(empty, [plane({ latitude: 0, longitude: 179.99 })], meta, 0, false);
  const s = liveState(m.get("abc123")!, 40_000);
  assert.ok(s.longitude >= -180 && s.longitude <= 180);
  assert.equal(s.callsign, "KAL1");
});
