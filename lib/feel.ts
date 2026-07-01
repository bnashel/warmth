/**
 * lib/feel.ts — THE tuning surface for the orb lab.
 *
 * Every feel constant in /lab lives here and nowhere else. Each one is
 * commented with what it does to the FEEL when you raise or lower it, so a
 * note like "snappier" or "warmer" is a one-line edit.
 *
 * Springs follow the design system (lib/theme.ts): snappy(400,32) for press
 * response and impacts, settle(140,22) for returns and cancels.
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
  /** Orb center sits this far above the bottom safe-area inset, px.
   *  Higher = easier thumb reach on big phones, but more dead space below. */
  bottomOffset: 140,
  /** Resting glow color before an emotion is chosen (soft warm off-white). */
  restHue: "#F5F1E8",
  /** Idle breath. Bigger max / shorter period = more alive, less calm. */
  breath: { scaleMin: 1.0, scaleMax: 1.04, periodS: 2.5 },
} as const;

/* Glow construction — three stacked radial layers, transform/opacity only. */
export const GLOW = {
  /** White-hot core, as a fraction of orb size. Bigger = hotter center. */
  coreFrac: 0.2,
  /** Mid body in the emotion hue. This IS the visible ball. */
  midFrac: 0.6,
  /** Outer halo reach. Bigger = more light spills into the void. */
  haloFrac: 1.4,
  /** Halo alpha at rest → at max intensity. Higher = louder room glow. */
  haloAlpha: { rest: 0.14, max: 0.38 },
  /** Mid-layer alpha. Lower = ghostlier orb. */
  midAlpha: 0.85,
} as const;

/* ------------------------------------------------------------------ */
/* Intensity (the orb IS the readout — no numbers anywhere)            */
/* ------------------------------------------------------------------ */
export const INTENSITY = {
  /** Step count. More steps = finer control, longer gesture to max. */
  steps: 7,
  /** Orb scale at step 1 → step 7. Widen the range = more drama per step. */
  scaleAt1: 1.12,
  scaleAtMax: 1.6,
  /** Pulse period at step 1 → 7, seconds. Shorter at max = more urgency. */
  pulsePeriodAt1: 2.5,
  pulsePeriodAtMax: 0.9,
  /** Pulse amplitude (±fraction of scale) at step 1 → 7. */
  pulseAmpAt1: 0.02,
  pulseAmpAtMax: 0.05,
  /** Spring driving scale between steps. Stiffer = snappier steps,
   *  lower damping = more overshoot/wobble per step. */
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
/* Variant A — PULL (tension & release)                                */
/* ------------------------------------------------------------------ */
export const PULL = {
  /** Press-down scale before anything else. More = heavier first contact. */
  pressScale: 1.12,
  /** Dot fan: arc width (deg) and radius (px) above the orb.
   *  Wider/farther = grander reveal, longer thumb travel. */
  arcDegrees: 150,
  arcRadiusPx: 110,
  /** Dot size, px. */
  dotSizePx: 10,
  /** Per-dot reveal stagger, s. More = slower, showier fan-out. */
  dotStaggerS: 0.025,
  /** Active dot scale vs dimmed others. More contrast = clearer choice. */
  activeDotScale: 1.5,
  inactiveDotOpacity: 0.4,
  /** Dot opacity once shaping starts (they get out of the way). */
  shapingDotOpacity: 0.15,
  /** Hold an emotion this long (s) before upward drag starts shaping.
   *  Longer = fewer accidental shapes, laggier feel. */
  holdBeforeShapeS: 0.12,
  /** Vertical px per intensity step. Fewer px = faster to max, twitchier. */
  pxPerStep: 44,
  /** Movement multiplier past step 7 (rubber band). Lower = firmer wall. */
  rubberBand: 0.25,
} as const;

/* ------------------------------------------------------------------ */
/* Variant B — BLOOM (exhale)                                          */
/* ------------------------------------------------------------------ */
export const BLOOM = {
  /** Time (s from hold start) at which each step 1..7 arrives.
   *  Stretch the tail = more anticipation at high intensity. */
  stepTimesS: [0, 0.2, 0.45, 0.75, 1.1, 1.5, 2.0],
  /** Slide down this many px before lifting to cancel. */
  cancelSlidePx: 60,
  /** B's burst is an exhale: slower ring, longer afterglow. */
  ringMs: 900,
  afterglowS: 1.6,
  /** Horizontal px to travel the full six-emotion spectrum.
   *  Smaller = more sensitive hue drift. */
  spectrumWidthPx: 260,
} as const;

/* ------------------------------------------------------------------ */
/* Variant C — PULSE (heartbeat)                                       */
/* ------------------------------------------------------------------ */
export const PULSE = {
  /** Ambient dot opacity when idle. Quieter = more mysterious. */
  ambientDotOpacity: 0.25,
  /** Tap squash: scaleY dip and duration. Deeper/longer = squishier drum. */
  squashScaleY: 0.94,
  squashMs: 60,
  /** How strongly the orb's pulse tempo drifts toward your tapping tempo
   *  per tap (0..1). Higher = locks onto you faster. */
  entrainRate: 0.35,
  /** Stillness window before auto-commit, ms. Shorter = hastier commit. */
  commitPauseMs: 900,
  /** While holding its breath the glow tightens by this fraction. */
  breathHoldTighten: 0.05,
  /** Tapping past max: wobble amplitude (±fraction) and cycle count. */
  wobbleAmp: 0.015,
  wobbleCycles: 3,
} as const;

/* ------------------------------------------------------------------ */
/* Commit burst (shared skeleton; every commit randomized in bounds)   */
/* ------------------------------------------------------------------ */
export const BURST = {
  /** Overshoot multiplier on current scale at commit. More = bigger pop. */
  overshootScale: 1.15,
  /** Expanding ring: end scale, start opacity, duration, ease. */
  ring: {
    scaleTo: 2.2,
    opacityFrom: 0.5,
    ms: 600,
    ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  },
  /** VARIABLE REWARD — randomization bounds. Every commit must differ.
   *  ringJitter: ±fraction on ring timing/scale. flicker: glow flicker depth.
   *  Wider bounds = more chaos; too wide reads as broken. */
  ringJitterPct: 0.05,
  glowFlicker: { min: 0.92, max: 1.08 },
  /** Spark particles: count and drift ranges (px), seeded per commit. */
  sparks: {
    count: 6,
    distancePx: { min: 46, max: 96 },
    sizePx: { min: 3, max: 5 },
    durationMs: { min: 500, max: 750 },
  },
  /** Afterglow: committed hue tint kept on the resting orb, fading out. */
  afterglowTint: 0.2,
  afterglowS: 1.2,
  /** Input re-enabled this long after commit, ms. Keep ≤1000 — the
   *  "one more time" pull dies if we make people wait. */
  rearmMs: 900,
} as const;

/* ------------------------------------------------------------------ */
/* Labels, hint, chrome                                                */
/* ------------------------------------------------------------------ */
export const TEXT = {
  /** Emotion label above the orb while shaping. */
  label: { sizePx: 13, letterSpacing: "0.12em", opacity: 0.7, offsetPx: 24, fadeInMs: 120 },
  /** The hint word below the orb (per-variant word lives in the variant). */
  hint: { sizePx: 13, opacity: 0.35, offsetPx: 16 },
  /** Variant switcher + mute. Dim hard during gestures — chrome disappears. */
  chrome: { sizePx: 11, idleOpacity: 0.3, activeOpacity: 0.7, gestureOpacity: 0.12 },
} as const;

/* ------------------------------------------------------------------ */
/* Color                                                               */
/* ------------------------------------------------------------------ */
export const COLOR = {
  /** Emotion crossfade duration, ms — interpolated in OKLCH, never RGB. */
  crossfadeMs: 150,
} as const;

/* ------------------------------------------------------------------ */
/* Sound (lib/sound.ts reads everything from here)                     */
/* ------------------------------------------------------------------ */
export const SOUND = {
  /** Master gain. The whole mix is felt-more-than-heard; keep conservative. */
  masterGain: 0.25,
  /** Step tick: C5 base, +1 semitone per step. Longer decay = wetter tick. */
  tick: { baseHz: 523.25, attackS: 0.002, decayS: 0.09, gain: 0.15 },
  /** Charge/bloom hum: root + octave at half gain. maxGain = hum ceiling. */
  hum: { baseHz: 110, maxGain: 0.04, stopMs: 100 },
  /** Commit swell: dyad (root+fifth) through an opening lowpass + whoosh. */
  swell: {
    ms: 350,
    breathyMs: 550, // Variant B: slower, airier
    lowpassFromHz: 800,
    lowpassToHz: 6000,
    whooshMs: 250,
    gain: 0.18,
    breathyNoiseBoost: 1.8,
  },
  /** Variant C commit kick: pitch-dropping soft thump. */
  kick: { fromHz: 80, toHz: 40, ms: 120, gain: 0.2 },
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
/* Helpers (pure; used by every variant)                               */
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
