"use client";

import { motion } from "framer-motion";
import { EMOTION_HUES, EMOTIONS, SPRING, type Emotion } from "@/lib/theme";
import { rgba } from "./color";
import { haptic } from "./haptics";

export const LABELS: Record<Emotion, string> = {
  joy: "Joy",
  energy: "Energy",
  love: "Love",
  awe: "Awe",
  calm: "Calm",
  reflective: "Reflective",
};

/**
 * The six-emotion picker — simplified to just the orbs (the selected emotion's
 * name is shown once, by the parent). Tapping swells + brightens the orb on a
 * snappy spring, dims the others, and fires a haptic tick.
 */
export function EmotionOrbs({
  selected,
  onSelect,
}: {
  selected: Emotion;
  onSelect: (e: Emotion) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5 sm:gap-4">
      {EMOTIONS.map((emotion) => {
        const isSelected = emotion === selected;
        const hue = EMOTION_HUES[emotion];
        return (
          <motion.button
            key={emotion}
            type="button"
            aria-label={LABELS[emotion]}
            aria-pressed={isSelected}
            onClick={() => {
              onSelect(emotion);
              haptic(12);
            }}
            className="relative h-9 w-9 select-none rounded-full outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-white/40 sm:h-11 sm:w-11"
            animate={{
              scale: isSelected ? 1.25 : 0.86,
              opacity: isSelected ? 1 : 0.38,
            }}
            transition={SPRING.snappy}
            whileTap={{ scale: isSelected ? 1.12 : 0.96 }}
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-full"
              style={{
                background: `radial-gradient(circle at 50% 38%, ${rgba(
                  hue,
                  0.98,
                )}, ${rgba(hue, 0.6)} 52%, ${rgba(hue, 0.12)} 82%)`,
                boxShadow: isSelected
                  ? `0 0 28px 6px ${rgba(hue, 0.6)}`
                  : `0 0 12px 1px ${rgba(hue, 0.22)}`,
              }}
            />
          </motion.button>
        );
      })}
    </div>
  );
}
