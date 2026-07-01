/**
 * lib/feel.ts — THE tuning surface for the orb lab.
 *
 * Every feel constant in /lab lives here and nowhere else. Each one is
 * commented with what it does to the FEEL when you raise or lower it, so a
 * note like "snappier" or "warmer" is a one-line edit.
 *
 * THE FLOW (post thumb-test v2): press the orb → six hue dots fan into a
 * half-circle WHEEL → your finger's ANGLE around the orb chooses (true radial
 * tracking) → hold a beat → the wheel swoops into a round ARC BAR → swipe
 * along it to rate 1–10 → release to commit. Return to the orb's center to
 * cancel, any time, free.
 */
import type { Emotion } from "./theme";

/* ------------------------------------------------------------------ */
/* The orb itself                                                      */
/* ------------------------------------------------------------------ */
export const ORB = {
  /** Resting diameter, px. Bigger = more presence, less negative space. */
  size: 72,
  /** Invisible hit target, px. Never below 96 — small = missed grabs = rage. */
  hitTarget: 110,
  /** Orb center sits this far above the bottom safe-area inset, px. */
  bottomOffset: 140,
  /** Resting glow color before an emotion is chosen (soft warm off-white). */
  restHue: "#F5F1E8",
  /** Idle breath. Bigger max / shorter period = more alive, less calm. */
  breath: { scaleMin: 1.0, scaleMax: 1.04, periodS: 2.5 },
} as const;

/* Glow construction — three stacked radial layers, transform/opacity only. */
export const GLOW = {
  coreFrac: 0.2,
  midFrac: 0.6,
  haloFrac: 1.4,
  /** Halo alpha at rest → at max intensity. Higher = louder room glow. */
  haloAlpha: { rest: 0.14, max: 0.38 },
  midAlpha: 0.85,
} as const;

/* ------------------------------------------------------------------ */
/* Intensity — 1..10, the orb + arc are the readout                    */
/* ------------------------------------------------------------------ */
export const INTENSITY = {
  /** Step count (Ben: rate 1 out of 10). More steps = finer, longer swipe. */
  steps: 10,
  /** Orb scale at step 1 → max. Widen = more drama per step. */
  scaleAt1: 1.12,
  scaleAtMax: 1.6,
  /** Pulse period at step 1 → max, s. Shorter at max = more urgency. */
  pulsePeriodAt1: 2.5,
  pulsePeriodAtMax: 0.9,
  /** Pulse amplitude (±fraction) at step 1 → max. */
  pulseAmpAt1: 0.02,
  pulseAmpAtMax: 0.05,
  /** Spring chasing the per-step orb scale. Stiffer = snappier steps. */
  spring: { type: "spring", stiffness: 300, damping: 26 } as const,
} as const;

/* Springs (mirror the design system; referenced here so tuning is local). */
export const SPRINGS = {
  /** Press response, bursts, tap impacts. Stiffer = harder snap. */
  snappy: { type: "spring", stiffness: 400, damping: 32 } as const,
  /** Returns, cancels, settles. Softer = dreamier. */
  settle: { type: "spring", stiffness: 140, damping: 22 } as const,
} as const;

/* ------------------------------------------------------------------ */
/* The WHEEL — six hue dots on a half-circle; finger ANGLE chooses     */
/* ------------------------------------------------------------------ */
export const WHEEL = {
  /** Press-down orb scale before anything else. More = heavier contact. */
  pressScale: 1.12,
  /** Arc width (deg) and radius (px). Wider/farther = grander, longer reach. */
  arcDegrees: 150,
  arcRadiusPx: 110,
  /** Dot size, px. */
  dotSizePx: 10,
  /** Per-dot reveal stagger, s (fan-out only — never on select response). */
  dotStaggerS: 0.025,
  /** Active dot scale vs the dimmed rest. More contrast = clearer choice. */
  activeDotScale: 1.5,
  inactiveDotOpacity: 0.4,
  /**
   * Radial dead zone, px. Inside this distance from the orb's center the
   * finger is "home" (no dot active / cancel-armed). Bigger = easier cancel,
   * harder to choose without reaching.
   */
  homeRadiusPx: 48,
  /**
   * Hold the same dot this long (s) to morph wheel → bar. Ben: "hold it for
   * a second". Longer = more deliberate, laggier. Shorter = hair-trigger.
   */
  holdToBarS: 0.55,
} as const;

/* ------------------------------------------------------------------ */
/* The ARC BAR — the wheel becomes a round bar; swipe along it, 1..10  */
/* ------------------------------------------------------------------ */
export const BAR = {
  /** Same geometry as the wheel so the morph reads as one object changing. */
  arcDegrees: 150,
  radiusPx: 110,
  /** Track stroke width, px. Thicker = bolder, less delicate. */
  thicknessPx: 10,
  /** Unfilled track opacity (white). Quieter = more void. */
  trackOpacity: 0.14,
  /** Wheel→bar morph: dots collapse + track draws in, ms. */
  morphMs: 340,
  /** Knob (the swipe handle riding the fill's leading edge), px. */
  knobPx: 24,
  /** Knob swell while swiping (spring: SPRINGS.snappy). */
  knobActiveScale: 1.25,
  /** Fill glow strength at step 1 → 10 (arc's own light). */
  fillGlow: { min: 0.25, max: 0.8 },
  /** Finger within this distance of the orb center = cancel-armed. */
  cancelRadiusPx: 55,
  /** While cancel-armed the bar dims to this fraction — "let go, it's free". */
  cancelDim: 0.35,
} as const;

/* ------------------------------------------------------------------ */
/* Commit burst (every commit randomized within bounds)                */
/* ------------------------------------------------------------------ */
export const BURST = {
  /** Overshoot multiplier on current scale at commit. More = bigger pop. */
  overshootScale: 1.15,
  /** Expanding ring: end scale, start opacity, duration, ease.
   *  opacityFrom must survive against the bright core — below ~0.5 it drowns. */
  ring: {
    scaleTo: 2.2,
    opacityFrom: 0.65,
    ms: 600,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
  /** VARIABLE REWARD — jitter bounds. Wider = more chaos; too wide = broken. */
  ringJitterPct: 0.05,
  glowFlicker: { min: 0.92, max: 1.08 },
  /** Spark particles: seeded per commit; distances scale with committed size
   *  so a max-intensity commit throws farther (reward scales with investment). */
  sparks: {
    count: 6,
    distancePx: { min: 90, max: 150 },
    sizePx: { min: 3, max: 5 },
    durationMs: { min: 500, max: 750 },
  },
  /** Afterglow ember: committed-hue tint kept on the resting orb, fading. */
  afterglowTint: 0.2,
  afterglowS: 1.2,
  /** Input re-enabled this long after commit, ms. Keep ≤1000. */
  rearmMs: 900,
} as const;

/* ------------------------------------------------------------------ */
/* Labels, hint, chrome                                                */
/* ------------------------------------------------------------------ */
export const TEXT = {
  label: { sizePx: 13, letterSpacing: "0.12em", opacity: 0.7, offsetPx: 24, fadeInMs: 120 },
  hint: { sizePx: 13, opacity: 0.35, offsetPx: 16 },
  /** Mute glyph. Dims hard during gestures — chrome disappears. */
  chrome: { sizePx: 11, idleOpacity: 0.3, activeOpacity: 0.7, gestureOpacity: 0.12 },
} as const;

export const COLOR = {
  /** Emotion crossfade duration, ms — interpolated in OKLCH, never RGB. */
  crossfadeMs: 150,
} as const;

/* ------------------------------------------------------------------ */
/* Sound (lib/sound.ts reads everything from here)                     */
/* ------------------------------------------------------------------ */
export const SOUND = {
  /** Master gain. Raised after iPhone test — ticks were inaudible at 0.25. */
  masterGain: 0.4,
  /**
   * Step tick v2 — a soft mechanical DETENT (iOS-picker feel), not a beep:
   * a filtered noise click + a tiny sine body. Pitch of the body still rises
   * with the step so climbing feels like going up.
   */
  tick: {
    baseHz: 523.25,
    attackS: 0.001,
    decayS: 0.05, // drier than v1 — a knock, not a chime
    gain: 0.2,
    /** The click transient: bandpassed noise. More gain = clackier. */
    clickGain: 0.12,
    clickBandHz: 2400,
    clickDecayS: 0.018,
  },
  /** Charge hum: root + octave at half gain. maxGain = hum ceiling. */
  hum: { baseHz: 110, maxGain: 0.05, stopMs: 100 },
  /** Commit swell: dyad through an opening lowpass + noise whoosh. */
  swell: {
    ms: 350,
    lowpassFromHz: 700,
    lowpassToHz: 4800, // warmer ceiling than v1's 6k
    whooshMs: 250,
    gain: 0.22,
  },
  /** Cancel: one tick this many semitones below the last step's pitch. */
  cancelSemitonesBelow: 2,
  /** Per-emotion swell root notes (C-major pentatonic). Reassign to taste. */
  emotionRootHz: {
    calm: 261.63, // C4
    reflective: 293.66, // D4
    love: 329.63, // E4
    awe: 392.0, // G4
    joy: 440.0, // A4
    energy: 523.25, // C5
  } satisfies Record<Emotion, number>,
} as const;

/* ------------------------------------------------------------------ */
/* Accessibility                                                       */
/* ------------------------------------------------------------------ */
export const REDUCED_MOTION = {
  /** With prefers-reduced-motion: no pulse, no springs — flat fades only. */
  fadeMs: 150,
} as const;

/* ------------------------------------------------------------------ */
/* Helpers (pure)                                                      */
/* ------------------------------------------------------------------ */

/** Orb scale for a (possibly fractional) intensity step 1..steps. */
export function scaleForStep(step: number): number {
  const t = (clampStep(step) - 1) / (INTENSITY.steps - 1);
  return INTENSITY.scaleAt1 + t * (INTENSITY.scaleAtMax - INTENSITY.scaleAt1);
}

/** Pulse period (s) for a step. */
export function pulsePeriodForStep(step: number): number {
  const t = (clampStep(step) - 1) / (INTENSITY.steps - 1);
  return INTENSITY.pulsePeriodAt1 + t * (INTENSITY.pulsePeriodAtMax - INTENSITY.pulsePeriodAt1);
}

/** Pulse amplitude (±fraction) for a step. */
export function pulseAmpForStep(step: number): number {
  const t = (clampStep(step) - 1) / (INTENSITY.steps - 1);
  return INTENSITY.pulseAmpAt1 + t * (INTENSITY.pulseAmpAtMax - INTENSITY.pulseAmpAt1);
}

export function clampStep(step: number): number {
  return Math.min(INTENSITY.steps, Math.max(1, step));
}

/** Tick pitch for a step: baseHz +1 semitone per step above 1. */
export function tickHzForStep(step: number): number {
  return SOUND.tick.baseHz * Math.pow(2, (clampStep(step) - 1) / 12);
}

/** Seeded pseudo-random in [0,1) — one seed per commit = variable reward
 *  that's still deterministic within a single burst. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32 — tiny, fast, plenty for visual jitter.
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
}
