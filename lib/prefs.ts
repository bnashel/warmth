/**
 * lib/prefs.ts — the user's look preferences, persisted on-device.
 *
 * Two dials, both live-switchable from the Look panel:
 *   shape — how feeling is drawn (bloom circles → free-flowing modes)
 *   solar — how hard the map follows the real sun
 * Tiny pub/sub so the map reacts instantly; localStorage so it sticks.
 */

export type ShapeMode = "bloom" | "watercolor" | "ink" | "aurora";
export type SolarMode = "subtle" | "bold" | "sky";

export type LookPrefs = { shape: ShapeMode; solar: SolarMode };

const KEY = "warmth-look-v1";
const DEFAULTS: LookPrefs = { shape: "watercolor", solar: "bold" };

const SHAPES: ShapeMode[] = ["bloom", "watercolor", "ink", "aurora"];
const SOLARS: SolarMode[] = ["subtle", "bold", "sky"];

function load(): LookPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<LookPrefs>;
    return {
      shape: SHAPES.includes(p.shape as ShapeMode) ? (p.shape as ShapeMode) : DEFAULTS.shape,
      solar: SOLARS.includes(p.solar as SolarMode) ? (p.solar as SolarMode) : DEFAULTS.solar,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let prefs: LookPrefs = load();
const listeners = new Set<(p: LookPrefs) => void>();

export function getPrefs(): LookPrefs {
  return prefs;
}

export function setPref<K extends keyof LookPrefs>(key: K, value: LookPrefs[K]): void {
  if (prefs[key] === value) return;
  prefs = { ...prefs, [key]: value };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // private mode / quota — the choice still applies for this session
  }
  for (const fn of listeners) fn(prefs);
}

/** Subscribe to changes; returns unsubscribe. */
export function onPrefsChange(fn: (p: LookPrefs) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
