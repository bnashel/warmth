/**
 * components/Trail/testJournal.ts — the DEV-ONLY dense judging set.
 *
 * `?journal=test` renders the private view against ~60 synthetic moments
 * spread over 3 months: a home cluster, a work cluster, and scattered
 * one-offs — the set Ben and Eli judge ember-vs-splat on, at city,
 * neighborhood, and street zoom. Deterministic (seeded RNG): identical on
 * every load and every phone. NEVER touches the store or localStorage —
 * the data is built here and handed straight to the trail renderer.
 */
import type { LivePoint } from "@/lib/momentsStore";
import { EMOTIONS, type Emotion } from "@/lib/theme";
import { devUnlocked } from "@/lib/dev";
import { emotionHue, worldFromUrl } from "@/components/Map/solar";
import { TRAIL } from "@/components/Map/tune";

export const JOURNAL_TEST_VERSION = 987654321; // fixed: caches stay warm

let cached: LivePoint[] | null = null;
/** Hues are world-aware (PIGMENT.hues on paper), so the cache keys on the
 *  world and rebuilds if the gallery flips night ↔ paper mid-session. */
let cachedWorld: string | null = null;
let modeChecked: boolean | null = null;

/** THE WELCOME's borrow (film, the time-axis step): a brand-new user has no
 *  journal, so the walkthrough shows this same judging set for one beat —
 *  framed on screen as "a glimpse — yours begins tonight" — then sweeps it.
 *  Programmatic twin of ?journal=test; unlike the URL param it is not
 *  dev-gated, because the welcome itself decides when it may appear and
 *  guarantees the sweep. Still never touches the store. */
let previewOn = false;
export function setJournalPreview(on: boolean): void {
  previewOn = on;
}

export function journalTestMode(): boolean {
  if (previewOn) return true;
  if (modeChecked !== null) return modeChecked;
  if (typeof window === "undefined") return false;
  // Gated like ?wall=off and ?field=seed (audit fix, 07-14): synthetic
  // moments must never render for a real production user — dev builds
  // and judging previews (devUnlocked) only. (The welcome's preview above
  // is the one deliberate, self-sweeping exception.)
  modeChecked =
    devUnlocked() && new URLSearchParams(window.location.search).get("journal") === "test";
  return modeChecked;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const p = parseInt(hex.slice(1), 16);
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
}

/** Journal weight the way the store computes it, statically: intensity
 *  base, then the 7-day window fading to the forever ember floor. */
function journalWeight(intensity: number, ageDays: number): number {
  const base = 0.25 + 0.75 * ((intensity - 1) / 9);
  const fresh =
    ageDays >= TRAIL.windowDays
      ? TRAIL.emberFloor
      : Math.max(TRAIL.emberFloor, TRAIL.weightFloor + (1 - TRAIL.weightFloor) * (1 - ageDays / TRAIL.windowDays));
  return Math.min(1, base * (0.55 + 0.45 * fresh) + 0.15 * fresh);
}

export function journalTestPoints(): LivePoint[] {
  if (cached && cachedWorld === worldFromUrl()) return cached;
  const rng = mulberry32(0xe11e11);
  const now = Date.now();
  const pts: LivePoint[] = [];

  const push = (
    lng: number,
    lat: number,
    emotion: Emotion,
    intensity: number,
    ageDays: number,
    hasMemory: boolean,
  ) => {
    const id = `test-${pts.length}-${emotion}`;
    pts.push({
      id,
      position: [lng, lat],
      hue: hexToRgb(emotionHue(emotion)), // world-aware: sun-yellow joy on paper
      weight: journalWeight(intensity, ageDays),
      emotion,
      intensity,
      createdAt: now - ageDays * 86400_000,
      born: (typeof performance !== "undefined" ? performance.now() : 0) - 60_000,
      own: true,
      test: true,
      hasMemory,
    } as LivePoint);
  };

  // HOME — Fort Greene: calm/gratitude evenings, ~25 moments, tight ±120m.
  const HOME: [number, number] = [-73.9762, 40.6892];
  for (let i = 0; i < 25; i++) {
    const e: Emotion = rng() < 0.45 ? "calm" : rng() < 0.6 ? "gratitude" : rng() < 0.8 ? "love" : "joy";
    push(
      HOME[0] + (rng() - 0.5) * 0.0024,
      HOME[1] + (rng() - 0.5) * 0.0019,
      e,
      2 + Math.round(rng() * 6),
      rng() * 88 + 1,
      rng() < 0.3,
    );
  }
  // WORK — Midtown: energy/joy weekdays, ~20 moments, tight ±90m.
  const WORK: [number, number] = [-73.9845, 40.7549];
  for (let i = 0; i < 20; i++) {
    const e: Emotion = rng() < 0.4 ? "energy" : rng() < 0.65 ? "joy" : rng() < 0.85 ? "gratitude" : "calm";
    push(
      WORK[0] + (rng() - 0.5) * 0.0018,
      WORK[1] + (rng() - 0.5) * 0.0014,
      e,
      3 + Math.round(rng() * 6),
      rng() * 85 + 2,
      rng() < 0.2,
    );
  }
  // SCATTER — 15 one-offs across the boroughs (dates, parks, errands).
  const SPOTS: [number, number][] = [
    [-73.9442, 40.7181], // Williamsburg
    [-73.9632, 40.6791], // Prospect Park
    [-73.9903, 40.7336], // Union Square
    [-74.0092, 40.7047], // FiDi
    [-73.9496, 40.797], // East Harlem
    [-73.9187, 40.7434], // Sunnyside
    [-73.9976, 40.7223], // Nolita
    [-73.9754, 40.7648], // Central Park S
    [-73.9581, 40.7208], // East Williamsburg
    [-74.0015, 40.7411], // Chelsea
    [-73.9308, 40.6949], // Bushwick
    [-73.9832, 40.6716], // Park Slope
    [-73.8564, 40.7466], // Corona
    [-73.9648, 40.8021], // Morningside
    [-73.9928, 40.6879], // Boerum Hill
  ];
  for (let i = 0; i < SPOTS.length; i++) {
    const e = EMOTIONS[Math.floor(rng() * EMOTIONS.length)];
    push(
      SPOTS[i][0] + (rng() - 0.5) * 0.001,
      SPOTS[i][1] + (rng() - 0.5) * 0.001,
      e,
      2 + Math.round(rng() * 7),
      rng() * 90 + 0.3,
      rng() < 0.4,
    );
  }
  cached = pts;
  cachedWorld = worldFromUrl();
  return pts;
}
