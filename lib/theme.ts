/**
 * Warmth design tokens — the single source of truth (per CLAUDE.md).
 * Dark-first. Color comes only from the emotional glow and small accents.
 * Keep this in sync with docs/design-system.md.
 */
import type { Transition } from "framer-motion";

/** Near-black base. Everything sits on this. */
export const BASE = "#0A0B0F" as const;

/** The five emotions users can drop — final set (2026-07-02, Eli's call).
 *  History: awe removed (no successor); reflective became gratitude. */
export type Emotion = "joy" | "energy" | "love" | "gratitude" | "calm";

/** Emotion → hue. On the map: hue = emotion. Object order = slider order.
 *  Softened away from neon (Eli, 2026-07-02): rich but gentle — near-equal
 *  lightness, moderated chroma, no electric edges. */
export const EMOTION_HUES: Record<Emotion, string> = {
  // 2026-07-07 glow-perfection pass (Eli): each hue tuned to the color-
  // psychology heart of its emotion, balanced so all five carry equal
  // presence as LIGHT — rich enough to stop you, never enough to shout.
  // "FIRST LIGHT" (Eli's pick, 2026-07-07 bake-off): airier and more
  // luminous — the gentlest, most dreamlike of the candidates.
  joy: "#FACB66", // dawn gold
  energy: "#F79A6E", // peach coral
  love: "#F695BC", // petal rose
  gratitude: "#BCA8F5", // lilac veil
  calm: "#63D6BE", // mint aqua
};

export const EMOTIONS = Object.keys(EMOTION_HUES) as Emotion[];

export function emotionHue(emotion: Emotion): string {
  return EMOTION_HUES[emotion];
}

/**
 * Motion. Nothing the user sees move is linear or instant — always spring.
 * snappy: controls, taps, the slider thumb. settle: larger elements coming to rest.
 */
export const SPRING = {
  snappy: { type: "spring", stiffness: 400, damping: 32 },
  settle: { type: "spring", stiffness: 140, damping: 22 },
} satisfies Record<string, Transition>;

/** The glow's breathing loop (~2.5s, ease-in-out, mirrored). */
export const GLOW_PULSE = {
  duration: 2.5,
  ease: "easeInOut",
  repeat: Infinity,
  repeatType: "mirror",
} satisfies Transition;

/**
 * Map encoding, for reference when building the glow layers:
 *   hue        = emotion       (EMOTION_HUES)
 *   brightness = intensity     (the slider value, 0..1)
 *   pulse      = density        (how many people feel it here)
 */
export const MAP_ENCODING = {
  hueFrom: "emotion",
  brightnessFrom: "intensity",
  pulseFrom: "density",
} as const;
