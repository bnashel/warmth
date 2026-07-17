/**
 * lib/emotionLens.ts — THE EMOTION LENS (private-mode redesign, 2026-07-17).
 *
 * Tap a feeling in the legend while in the private view and the map
 * answers a question: where does my calm live? The chosen feeling holds
 * full presence; every other memory settles to a whisper (dimmed, never
 * gone — geography keeps its context). Tap again to release.
 *
 * Same shape as the time scrub: a tiny store outside React written by
 * the legend, read by the trail pipeline every push, with an eased
 * per-emotion presence so the lens breathes in and out (nothing pops).
 */
import { EMOTIONS, type Emotion } from "@/lib/theme";
import type { LivePoint } from "@/lib/momentsStore";

/** How present a non-chosen feeling stays under the lens. */
const DIM = 0.12;
/** The lens breath: presence eases with this time constant. */
const TAU_MS = 220;

let lens: Emotion | null = null;
const listeners = new Set<() => void>();

export function setLens(e: Emotion | null): void {
  if (e === lens) return;
  lens = e;
  for (const fn of listeners) fn();
}

export function currentLens(): Emotion | null {
  return lens;
}

/** The legend mirrors state from here (OneScreen clears on view exit). */
export function onLensChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* Eased presence per emotion — all standing at 1 when the lens is off. */
const eased = new Map<Emotion, number>();
let lastTick = 0;

let cache: { src: LivePoint[]; srcVersion: number; out: LivePoint[]; version: number } | null =
  null;
/** Own monotonic version band (scrub owns 1e9+; this owns 2e9+). */
let lensVersion = 2_000_000_000;

/**
 * The journal through the lens. Passthrough (zero-cost) whenever the
 * lens is off and every presence has settled home.
 */
export function applyEmotionLens(
  data: LivePoint[],
  version: number,
): { data: LivePoint[]; version: number } {
  const now = performance.now();
  const dt = lastTick ? Math.min(100, now - lastTick) : 16;
  lastTick = now;
  const k = 1 - Math.exp(-dt / TAU_MS);
  let moving = false;
  let allHome = true;
  for (const e of EMOTIONS) {
    const target = lens === null || lens === e ? 1 : DIM;
    const cur = eased.get(e) ?? 1;
    let next = cur + (target - cur) * k;
    if (Math.abs(next - target) < 0.004) next = target;
    if (next !== cur) {
      eased.set(e, next);
      moving = true;
    }
    if (next !== 1) allHome = false;
  }
  if (lens === null && allHome) {
    cache = null;
    return { data, version };
  }
  const stale = !cache || cache.src !== data || cache.srcVersion !== version || moving;
  if (!stale) return { data: cache!.out, version: cache!.version };
  const out = data.map((p) => {
    const f = eased.get(p.emotion) ?? 1;
    return f >= 0.999 ? p : { ...p, weight: p.weight * f };
  });
  lensVersion++;
  cache = { src: data, srcVersion: version, out, version: lensVersion };
  return { data: out, version: lensVersion };
}
