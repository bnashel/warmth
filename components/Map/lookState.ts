/**
 * components/Map/lookState.ts — which gallery look is live right now.
 *
 * A tiny mutable store outside React: FieldLayer reads dials from here
 * every frame (uniforms are re-bound each frame anyway, so switching is
 * free and instant); MapStage subscribes to re-feed kernel data when a
 * switch changes the geometry dials. The favorite (the product default)
 * persists in localStorage; everything else is session-only.
 */
import { devUnlocked } from "@/lib/dev";
import { LOOKS, type LookDef } from "./looks";
import { setWorld } from "./solar";

const FAV_KEY = "warmth-look-favorite";

function readFavorite(): string | null {
  try {
    return window.localStorage.getItem(FAV_KEY);
  } catch {
    return null;
  }
}

/** The product default (THE ONE WORLD merge, 07-13): explicit, and NIGHT
 *  — the newest registry entry is now Ben's paper world, and the
 *  constitution keeps the product opening on the night city. */
const DEFAULT_ID = "night-weather";

function resolveInitial(): LookDef {
  // THE NIGHT GATE (review fix, 07-14): real production builds never LAND
  // on a paper look at load — constitution rule 1, night is the product.
  // ?world=paper, ?look=paper-world, and a starred paper favorite all fall
  // through to the night default in production; local dev and judging
  // previews (NEXT_PUBLIC_WARMTH_JUDGE=1) resolve them exactly as before,
  // so Ben's phone bake-off links keep working where they're meant to.
  const paperOk = devUnlocked();
  const pick = (): LookDef => {
    if (typeof window !== "undefined") {
      // Ben's judging flow: ?look=still-water / ?world=paper deep-link the
      // matching gallery entry (his phone bake-off links keep working).
      const q = new URLSearchParams(window.location.search);
      if (paperOk && q.get("world") === "paper") {
        const paper = LOOKS.find((l) => l.id === "paper-world");
        if (paper) return paper;
      }
      const ql = q.get("look");
      const qhit = ql && (LOOKS.find((l) => l.id === ql) || LOOKS.find((l) => l.pond === ql && l.world !== "paper"));
      if (qhit && (paperOk || qhit.world !== "paper")) return qhit;
      const fav = readFavorite();
      const hit = fav && LOOKS.find((l) => l.id === fav);
      if (hit && (paperOk || hit.world !== "paper")) return hit;
    }
    return LOOKS.find((l) => l.id === DEFAULT_ID) ?? LOOKS[LOOKS.length - 1];
  };
  const look = pick();
  // The look owns its world (audit fix, 07-14): a look that stands on
  // paper must seed the world BEFORE the base style is built, or
  // ?look=paper-world (and a starred paper favorite) would mount the
  // pigment engine over the night city. solar.worldFromUrl() only knows
  // ?world=; this makes the resolved LOOK the one source of truth at load.
  // In production the seed is forced to night, which also closes the
  // pre-existing ungated ?world=paper hole in solar.worldFromUrl().
  if (typeof window !== "undefined") {
    setWorld(paperOk ? look.world ?? "night" : "night");
  }
  return look;
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
