/**
 * lib/momentsStore.ts — the living set of feelings the map renders.
 *
 * One in-memory store feeds the glow layer: moments enter (from the orb now;
 * from Supabase realtime in Phase 3b), arrive with a bloom envelope, breathe,
 * fade over the recency window, and are culled when dead. The render side
 * reads `points` (stable array identity) + `version` (bumped whenever any
 * weight or membership changes — deck.gl updateTriggers key).
 */
import { CHOREO, GLOW, RECENCY } from "@/components/Map/tune";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";

export type Moment = {
  id: string;
  emotion: Emotion;
  intensity: number; // the orb's native continuous 1..10
  lng: number;
  lat: number;
  createdAt: number; // epoch ms
  /** Committed on this device (renders at precise location). */
  own?: boolean;
  /** Lab seed data — swept before the real screen renders. */
  test?: boolean;
};

export type LivePoint = {
  id: string;
  position: [number, number];
  hue: [number, number, number];
  weight: number; // intensity × freshness × arrival — what the shader sees
  emotion: Emotion;
  intensity: number;
  createdAt: number;
  born: number; // performance.now() at entry — drives the arrival bloom
  test?: boolean;
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** 0 → overshoot → settle at 1: light turning on, then joining the breath. */
function arrivalEnvelope(t: number): number {
  const { overshoot, peakAt } = CHOREO.arrival;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < peakAt) return smooth(t / peakAt) * overshoot;
  return overshoot + (1 - overshoot) * smooth((t - peakAt) / (1 - peakAt));
}

class MomentsStore {
  points: LivePoint[] = [];
  version = 0;
  private ids = new Set<string>();
  private lastFade = 0;

  /** Add a moment (idempotent by id — realtime echoes dedupe here). */
  add(m: Moment): boolean {
    if (this.ids.has(m.id)) return false;
    const p: LivePoint = {
      id: m.id,
      position: [m.lng, m.lat],
      hue: hexToRgb(EMOTION_HUES[m.emotion]),
      weight: 0, // born dark; the arrival envelope raises it
      emotion: m.emotion,
      intensity: m.intensity,
      createdAt: m.createdAt,
      born: performance.now(),
      test: m.test,
    };
    // Structural changes get a fresh array (deck regenerates attributes);
    // per-frame weight changes mutate in place + bump version.
    const next = [...this.points, p];
    if (next.length > RECENCY.maxPoints) {
      next.sort((a, b) => a.createdAt - b.createdAt);
      const dropped = next.splice(0, next.length - RECENCY.maxPoints);
      for (const d of dropped) this.ids.delete(d.id);
    }
    this.points = next;
    this.ids.add(m.id);
    this.version++;
    return true;
  }

  /** Seed data is lab-only; the product screen sweeps it on mount. */
  clearTest() {
    if (!this.points.some((p) => p.test)) return;
    this.points = this.points.filter((p) => !p.test);
    this.ids = new Set(this.points.map((p) => p.id));
    this.version++;
  }

  has(id: string) {
    return this.ids.has(id);
  }

  /**
   * Advance arrivals + recency fade. Called from the map's rAF tick.
   * Returns true while any bloom is animating (the caller bypasses its
   * rest-throttle so arrivals never stutter).
   */
  tick(nowPerf: number): boolean {
    const arrivalMs = CHOREO.arrival.durationMs;
    let animating = false;
    for (const p of this.points) {
      if (nowPerf - p.born < arrivalMs + 120) {
        animating = true;
        break;
      }
    }
    const due = nowPerf - this.lastFade > RECENCY.refreshMs;
    if (!animating && !due) return false;
    if (due) this.lastFade = nowPerf;

    const windowMs = RECENCY.windowHours * 3600_000;
    const epochNow = Date.now();
    let changed = false;
    let dead = 0;
    for (const p of this.points) {
      const base =
        GLOW.weightFloor + (1 - GLOW.weightFloor) * ((p.intensity - 1) / 9);
      const freshness = Math.max(0, 1 - (epochNow - p.createdAt) / windowMs);
      const arrival = arrivalEnvelope((nowPerf - p.born) / arrivalMs);
      const w = base * freshness * arrival;
      if (w !== p.weight) {
        p.weight = w;
        changed = true;
      }
      if (freshness <= 0) dead++;
    }
    if (dead > 0) {
      this.points = this.points.filter(
        (p) => epochNow - p.createdAt < windowMs,
      );
      this.ids = new Set(this.points.map((p) => p.id));
    }
    if (changed || dead > 0) this.version++;
    return animating;
  }
}

/** The one store — module singleton, client-side only. */
export const momentsStore = new MomentsStore();
