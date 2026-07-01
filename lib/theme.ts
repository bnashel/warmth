/**
 * Warmth design tokens — the single source of truth (per CLAUDE.md).
 * Dark-first. Color comes only from the emotional glow and small accents.
 * Keep this in sync with docs/design-system.md.
 */
import type { Transition } from "framer-motion";

/** Near-black base. Everything sits on this. */
export const BASE = "#0A0B0F" as const;

/** The six emotions users can drop. */
export type Emotion = "joy" | "energy" | "love" | "awe" | "calm" | "reflective";

/** Emotion → hue. On the map: hue = emotion. */
export const EMOTION_HUES: Record<Emotion, string> = {
  joy: "#FFC24B",
  energy: "#FF7A29",
  love: "#FF6FB5",
  awe: "#7B6CF6",
  calm: "#35D0BA",
  reflective: "#3E8EF7",
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
