/**
 * components/Map/lookState.ts — which gallery look is live right now.
 *
 * A tiny mutable store outside React: FieldLayer reads dials from here
 * every frame (uniforms are re-bound each frame anyway, so switching is
 * free and instant); MapStage subscribes to re-feed kernel data when a
 * switch changes the geometry dials. The favorite (the product default)
 * persists in localStorage; everything else is session-only.
 */
import { LOOKS, type LookDef } from "./looks";

const FAV_KEY = "warmth-look-favorite";

function readFavorite(): string | null {
  try {
    return window.localStorage.getItem(FAV_KEY);
  } catch {
    return null;
  }
}

function resolveInitial(): LookDef {
  if (typeof window !== "undefined") {
    const fav = readFavorite();
    const hit = fav && LOOKS.find((l) => l.id === fav);
    if (hit) return hit;
  }
  return LOOKS[LOOKS.length - 1]; // newest iteration is the default default
}

let current: LookDef = resolveInitial();
const listeners = new Set<() => void>();

export function currentLook(): LookDef {
  return current;
}

export function setLook(id: string): void {
  const hit = LOOKS.find((l) => l.id === id);
  if (!hit || hit.id === current.id) return;
  current = hit;
  for (const fn of listeners) fn();
}

export function favoriteId(): string | null {
  return typeof window === "undefined" ? null : readFavorite();
}

export function setFavorite(id: string): void {
  try {
    window.localStorage.setItem(FAV_KEY, id);
  } catch {
    // storage blocked — the star simply doesn't persist
  }
}

export function onLookChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
