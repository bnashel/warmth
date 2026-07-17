/**
 * lib/timeScrub.ts — THE TIME SCRUBBER (private-mode redesign, 2026-07-17).
 *
 * Drag back through your year and watch the journal replay on the map:
 * at scrub time T the trail looks the way it looked THEN — moments that
 * were fresh at T burn bright, older ones sit at their ember floor, and
 * moments that hadn't happened yet aren't there. Scrubbing forward,
 * each arriving memory KINDLES (a soft bloom, never a pop).
 *
 * A tiny mutable store outside React, like lookState: the scrubber
 * writes `scrubTo`, and the trail pipeline (glow.ts) passes its data
 * through `applyTimeScrub` every push — when the scrub is off this is
 * a zero-cost passthrough of the store's own arrays.
 */
import { CHOREO, TRAIL } from "@/components/Map/tune";
import type { LivePoint } from "@/lib/momentsStore";

/** null = live "now" (no filter — the store's own weights pass through). */
let scrubT: number | null = null;

export function scrubTo(t: number | null): void {
  scrubT = t;
}

export function scrubTime(): number | null {
  return scrubT;
}

/** Scrub steps quantize to 3h of journal time: a drag across a year is
 *  ~a-day-per-pixel, so every real movement lands a new bucket while a
 *  resting thumb costs nothing. */
const BUCKET_MS = 3 * 3600_000;

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** When each entry became visible under the CURRENT scrub session —
 *  drives the kindle bloom as the thumb moves forward through time. */
const bornAt = new Map<string, number>();

let cache: {
  src: LivePoint[];
  srcVersion: number;
  bucket: number;
  out: LivePoint[];
  version: number;
  kindling: boolean;
} | null = null;
/** Monotonic, offset far above real store versions so deck's
 *  updateTriggers can never collide with a passthrough version. */
let scrubVersion = 1_000_000_000;

/**
 * The journal as it stood at the scrub time. Passthrough when live.
 * Weights mirror the store's formula with `T` in place of now; entries
 * newly crossed into view get a ~600ms kindle ramp (rule: nothing pops).
 */
export function applyTimeScrub(
  data: LivePoint[],
  version: number,
): { data: LivePoint[]; version: number } {
  const t = scrubT;
  if (t === null) {
    bornAt.clear();
    cache = null;
    return { data, version };
  }
  const bucket = Math.round(t / BUCKET_MS);
  const nowPerf = performance.now();
  const stale =
    !cache ||
    cache.src !== data ||
    cache.srcVersion !== version ||
    cache.bucket !== bucket ||
    cache.kindling; // mid-kindle: rebuild each push so the bloom plays
  if (!stale) return { data: cache!.out, version: cache!.version };

  const trailMs = TRAIL.windowDays * 86_400_000;
  const kindleMs = CHOREO.arrival.durationMs;
  const out: LivePoint[] = [];
  let kindling = false;
  const visible = new Set<string>();
  for (const p of data) {
    if (p.createdAt > t) continue;
    visible.add(p.id);
    let born = bornAt.get(p.id);
    if (born === undefined) {
      // First sight this scrub session. A thumb-crossing means a kindle;
      // entries already old at the first bucket stand quietly (their
      // bloom would be a firework show on every scrub start).
      born = cache ? nowPerf : nowPerf - kindleMs * 2;
      bornAt.set(p.id, born);
    }
    const base = TRAIL.weightFloor + (1 - TRAIL.weightFloor) * ((p.intensity - 1) / 9);
    const freshness = Math.max(TRAIL.emberFloor, 1 - (t - p.createdAt) / trailMs);
    const kindle = smooth((nowPerf - born) / kindleMs);
    if (kindle < 1) kindling = true;
    out.push({ ...p, weight: base * freshness * kindle });
  }
  // Scrubbed backward past an entry: it leaves the set — and forgets its
  // born, so returning forward kindles it again.
  for (const id of bornAt.keys()) if (!visible.has(id)) bornAt.delete(id);

  scrubVersion++;
  cache = { src: data, srcVersion: version, bucket, out, version: scrubVersion, kindling };
  return { data: out, version: scrubVersion };
}
