/**
 * lib/momentsStore.ts — the living set of feelings the map renders.
 *
 * One in-memory store feeds BOTH views: moments enter (from the orb now;
 * from Supabase realtime in Phase 3b), arrive with a bloom envelope, breathe,
 * fade, and are culled when dead.
 *
 *   points / version        — everyone's feelings, 24h window: THE FIELD
 *                             (public weather). Includes the ambient seed
 *                             until realtime replaces it.
 *   ownPoints / ownVersion  — your feelings only, 7-day window: THE TRAIL
 *                             (private diary dots). Persisted in
 *                             localStorage so your trail survives reloads —
 *                             it never leaves this device.
 *
 * The render side reads the arrays (stable identity) + versions (bumped on
 * any weight/membership change — deck.gl updateTriggers keys).
 */
import { CHOREO, FIELD, GLOW, RECENCY, TRAIL } from "@/components/Map/tune";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import { pushMemoryToCloud, pushMomentToCloud } from "@/lib/sync";

/** A memory counts once it carries any real content. */
function hasMemoryContent(memory: Memory | undefined): boolean {
  return Boolean(
    memory && (memory.description?.trim() || memory.songTitle?.trim() || memory.photoPath),
  );
}

/** The memory a journal entry can carry — all optional, editable forever. */
export type Memory = {
  description?: string; // freeform, ≤2000 chars (enforced at the editor)
  songTitle?: string;
  songArtist?: string;
  /** Supabase Storage path once photos sync; unused until the cloud lands. */
  photoPath?: string;
};

export type Moment = {
  id: string;
  emotion: Emotion;
  intensity: number; // the orb's native continuous 1..10
  lng: number;
  lat: number;
  createdAt: number; // epoch ms
  /** Committed on this device — joins the private journal (precise location). */
  own?: boolean;
  /** Ambient seed — the placeholder city until realtime lands. Public only. */
  seed?: boolean;
  /** Lab seed data — swept before the real screen renders. */
  test?: boolean;
  /** The journal memory attached to this entry (private view only). */
  memory?: Memory;
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
  own?: boolean;
  seed?: boolean;
  test?: boolean;
  /** A named star: this entry carries a memory (ring in the spark shader). */
  hasMemory?: boolean;
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

/* ---- private-trail persistence (device-local; never sent anywhere) ---- */

const OWN_KEY = "warmth-own-moments-v1";
/** The journal keeps EVERYTHING (2026-07-07, Eli: "every entry ever") — the
 *  cap is quota protection only, evicting oldest at ~2k entries (~5 years of
 *  daily use). The old 7-day purge is gone: entries live until the user
 *  deletes them or the cloud journal takes over persistence. */
const OWN_CAP = 2000;

/**
 * Emotion-set migration (2026-07-02, Eli's call): the final five are
 * joy/energy/love/gratitude/calm. reflective → gratitude; awe was removed
 * with no successor, so persisted awe moments are DROPPED on load.
 * localStorage has no rollback tooling — this is one-way by design.
 */
const LEGACY_EMOTION: Record<string, Emotion | null> = {
  reflective: "gratitude",
  awe: null, // dropped
};

/** Set when the last load remapped or dropped legacy rows — the caller
 *  must rewrite storage so retired values (and their precise locations)
 *  leave the device immediately, not at the next incidental save. */
let legacyMigrated = false;

function migrateLegacyEmotion(m: unknown): unknown {
  if (typeof m !== "object" || m === null) return m;
  const p = m as Record<string, unknown>;
  if (typeof p.emotion !== "string" || !Object.hasOwn(LEGACY_EMOTION, p.emotion)) return m;
  legacyMigrated = true;
  const next = LEGACY_EMOTION[p.emotion];
  return next === null ? null : { ...p, emotion: next };
}

function isPersistedMoment(m: unknown): m is Moment {
  if (typeof m !== "object" || m === null) return false;
  const p = m as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.emotion === "string" &&
    // hasOwn, not `in`: prototype-chain keys ("constructor") must not pass.
    Object.hasOwn(EMOTION_HUES, p.emotion) &&
    // Bounds matter, not just types: Infinity/garbage numbers survive
    // JSON round-trips and would poison weights forever (review finding).
    Number.isFinite(p.intensity) &&
    Number.isFinite(p.lng) &&
    (p.lng as number) >= -180 &&
    (p.lng as number) <= 180 &&
    Number.isFinite(p.lat) &&
    (p.lat as number) >= -90 &&
    (p.lat as number) <= 90 &&
    Number.isFinite(p.createdAt)
  );
}

function loadPersistedOwn(): Moment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OWN_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .map(migrateLegacyEmotion)
      .filter((m): m is unknown => m !== null)
      .filter(isPersistedMoment)
      .map((m) => ({
      ...m,
      own: true,
      intensity: Math.min(10, Math.max(1, m.intensity)),
      createdAt: Math.min(m.createdAt, now), // clock skew never means "brighter than now"
    }));
  } catch {
    return []; // private mode / quota / corrupt JSON — the trail just starts fresh
  }
}

class MomentsStore {
  /** Everyone (public field): 24h window, seed + own + realtime. */
  points: LivePoint[] = [];
  version = 0;
  /** You only (private trail): 7-day window, persisted on-device. */
  ownPoints: LivePoint[] = [];
  ownVersion = 0;

  private ids = new Set<string>();
  private ownIds = new Set<string>();
  private ownRaw: Moment[] = [];
  private lastFade = 0;
  // Quiet adds (seed, rehydration) never register as "animating", so the
  // next tick MUST run a weight pass anyway — without this, a fresh load
  // renders both views black for up to refreshMs (design-review finding).
  private dirty = false;

  constructor() {
    // Rehydrate the trail; still-fresh moments rejoin the public field too.
    const persisted = loadPersistedOwn();
    for (const m of persisted) this.add(m, { quiet: true, persist: false });
    // One rewrite now, so expired entries — and rows the emotion migration
    // remapped or dropped — leave the device immediately, not only whenever
    // the next commit happens to trigger a save.
    if (legacyMigrated || persisted.length > this.ownRaw.length) this.persistOwn();
  }

  private makePoint(m: Moment, quiet: boolean): LivePoint {
    return {
      id: m.id,
      position: [m.lng, m.lat],
      hue: hexToRgb(EMOTION_HUES[m.emotion]),
      // Born dark, raised by the arrival envelope — unless quiet (seed /
      // rehydration), where the light must simply already be standing.
      weight: 0,
      emotion: m.emotion,
      intensity: m.intensity,
      createdAt: m.createdAt,
      born: quiet ? performance.now() - CHOREO.arrival.durationMs * 2 : performance.now(),
      own: m.own,
      seed: m.seed,
      test: m.test,
      hasMemory: hasMemoryContent(m.memory),
    };
  }

  private persistOwn(): boolean {
    if (typeof window === "undefined") return false;
    // The journal is forever (Eli, 2026-07-07): no age purge. The cap only
    // protects the localStorage quota, evicting oldest-first at the extreme.
    this.ownRaw = this.ownRaw.slice(-OWN_CAP);
    try {
      window.localStorage.setItem(OWN_KEY, JSON.stringify(this.ownRaw));
      return true;
    } catch {
      // Quota: shed the oldest tenth once and retry — losing the distant
      // past beats silently losing what the user just wrote (code review).
      try {
        this.ownRaw = this.ownRaw.slice(Math.ceil(this.ownRaw.length / 10));
        window.localStorage.setItem(OWN_KEY, JSON.stringify(this.ownRaw));
        return true;
      } catch {
        return false; // blocked entirely — callers must not claim "kept"
      }
    }
  }

  /**
   * Add a moment (idempotent by id — realtime echoes dedupe here).
   * `quiet` skips the arrival bloom (seed data, trail rehydration).
   */
  add(m: Moment, opts?: { quiet?: boolean; persist?: boolean; fromCloud?: boolean }): boolean {
    const quiet = opts?.quiet ?? false;
    const isNew = !this.ids.has(m.id) && !this.ownIds.has(m.id);
    if (!isNew) return false;

    // The public field only carries feelings inside the recency window.
    if (Date.now() - m.createdAt < RECENCY.windowHours * 3600_000) {
      // Structural changes get a fresh array (deck regenerates attributes);
      // per-frame weight changes mutate in place + bump version.
      const next = [...this.points, this.makePoint(m, quiet)];
      if (next.length > RECENCY.maxPoints) {
        next.sort((a, b) => a.createdAt - b.createdAt);
        const dropped = next.splice(0, next.length - RECENCY.maxPoints);
        for (const d of dropped) this.ids.delete(d.id);
      }
      this.points = next;
      this.ids.add(m.id);
      this.version++;
    }

    // Your journal: every own entry, forever — no age gate (Eli, 2026-07-07).
    if (m.own && !m.test) {
      this.ownPoints = [...this.ownPoints, this.makePoint(m, quiet)];
      this.ownIds.add(m.id);
      this.ownVersion++;
      this.ownRaw.push(m); // rehydration re-fills the in-memory mirror too
      if (opts?.persist !== false) {
        this.persistOwn();
        // Fresh commit (not rehydration/seed/cloud-hydrate): the dual write.
        // One action, two destinations — anonymous public row + owned journal
        // row. `fromCloud` entries are ALREADY on the server; caching them
        // locally must not echo them back up.
        if (!opts?.fromCloud) void pushMomentToCloud(m);
      }
    }
    this.dirty = true;
    return true;
  }

  /**
   * Attach or edit the memory on a journal entry — optimistic: local state
   * and storage update immediately; the cloud write follows when wired.
   */
  setMemory(id: string, memory: Memory): boolean {
    const raw = this.ownRaw.find((m) => m.id === id);
    if (!raw) return false;
    raw.memory = { ...raw.memory, ...memory };
    const point = this.ownPoints.find((p) => p.id === id);
    if (point) point.hasMemory = hasMemoryContent(raw.memory);
    this.ownVersion++;
    this.dirty = true;
    // "kept" must be TRUE: only claim success if the words actually landed
    // in storage (quota failures were silently eaten before — code review).
    const kept = this.persistOwn();
    void pushMemoryToCloud(id, raw.memory);
    return kept;
  }

  /** The full journal record for one entry (memory editor reads this). */
  journalEntry(id: string): Moment | undefined {
    return this.ownRaw.find((m) => m.id === id);
  }

  /** Every own journal entry (for the sign-in claim → cloud). A copy, so
   *  callers can't mutate the store's array. */
  ownEntries(): Moment[] {
    return this.ownRaw.slice();
  }

  /**
   * Merge one server journal row into the local trail — the pull half of
   * sync (never re-pushes). A row not seen on this device is added; an
   * existing BARE entry gets its memory filled from the cloud (so a memory
   * written on another device appears here) — but a local edit is never
   * clobbered. Full cross-device conflict resolution is a follow-up.
   */
  ingestCloudEntry(m: Moment): void {
    if (!this.ownIds.has(m.id)) {
      this.add(m, { fromCloud: true });
      return;
    }
    const local = this.ownRaw.find((x) => x.id === m.id);
    if (local && !hasMemoryContent(local.memory) && hasMemoryContent(m.memory)) {
      local.memory = { ...m.memory };
      const point = this.ownPoints.find((p) => p.id === m.id);
      if (point) point.hasMemory = true;
      this.ownVersion++;
      this.dirty = true;
      this.persistOwn();
    }
  }

  /**
   * "On this day" — journal entries from this calendar date in a previous
   * month or year (at least 3 weeks old, so last Tuesday doesn't count as
   * a memory). Newest first.
   */
  onThisDay(now = new Date()): Moment[] {
    const cutoff = now.getTime() - 21 * 86400_000;
    return this.ownRaw
      .filter((m) => {
        if (m.createdAt > cutoff) return false;
        const d = new Date(m.createdAt);
        return d.getDate() === now.getDate() && d.getMonth() === now.getMonth();
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** The ambient placeholder city (until realtime): quiet, idempotent. */
  seedAmbient(moments: Moment[]) {
    for (const m of moments) this.add(m, { quiet: true });
  }

  /** Seed data is lab-only; the product screen sweeps it on mount. */
  clearTest() {
    if (!this.points.some((p) => p.test)) return;
    this.points = this.points.filter((p) => !p.test);
    this.ids = new Set(this.points.map((p) => p.id));
    this.version++;
  }

  has(id: string) {
    return this.ids.has(id) || this.ownIds.has(id);
  }

  /**
   * Advance arrivals + recency fades for both views. Called from the map's
   * rAF tick. Returns true while any bloom is animating (the caller bypasses
   * its rest-throttle so arrivals never stutter).
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
    if (!animating) {
      for (const p of this.ownPoints) {
        if (nowPerf - p.born < arrivalMs + 120) {
          animating = true;
          break;
        }
      }
    }
    const due = this.dirty || nowPerf - this.lastFade > RECENCY.refreshMs;
    if (!animating && !due) return false;
    if (due) {
      this.lastFade = nowPerf;
      this.dirty = false;
    }

    const epochNow = Date.now();

    // The field (24h clock).
    const windowMs = RECENCY.windowHours * 3600_000;
    let changed = false;
    let dead = 0;
    for (const p of this.points) {
      const base = GLOW.weightFloor + (1 - GLOW.weightFloor) * ((p.intensity - 1) / 9);
      const freshness = Math.min(1, Math.max(0, 1 - (epochNow - p.createdAt) / windowMs));
      const arrival = arrivalEnvelope((nowPerf - p.born) / arrivalMs);
      // The ambient seed is a thin glaze; real feelings burn at full weight.
      const w = base * freshness * arrival * (p.seed ? FIELD.seedGain : 1);
      if (w !== p.weight) {
        p.weight = w;
        changed = true;
      }
      if (freshness <= 0) dead++;
    }
    if (dead > 0) {
      this.points = this.points.filter((p) => epochNow - p.createdAt < windowMs);
      this.ids = new Set(this.points.map((p) => p.id));
    }
    if (changed || dead > 0) this.version++;

    // The journal (forever): the last week burns brightest, then a spark
    // settles to a steady ember — old feelings dim, but NEVER die. A journal
    // that deletes your past isn't a journal (Eli, 2026-07-07).
    const trailMs = TRAIL.windowDays * 86400_000;
    let ownChanged = false;
    for (const p of this.ownPoints) {
      const base = TRAIL.weightFloor + (1 - TRAIL.weightFloor) * ((p.intensity - 1) / 9);
      const freshness = Math.max(TRAIL.emberFloor, 1 - (epochNow - p.createdAt) / trailMs);
      const arrival = arrivalEnvelope((nowPerf - p.born) / arrivalMs);
      const w = base * freshness * arrival;
      if (w !== p.weight) {
        p.weight = w;
        ownChanged = true;
      }
    }
    if (ownChanged) this.ownVersion++;

    return animating;
  }
}

/** The one store — module singleton, client-side only. */
export const momentsStore = new MomentsStore();
