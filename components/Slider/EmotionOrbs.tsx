"use client";

import { motion } from "framer-motion";
import { EMOTION_HUES, EMOTIONS, SPRING, type Emotion } from "@/lib/theme";
import { rgba } from "./color";

const LABELS: Record<Emotion, string> = {
  joy: "Joy",
  energy: "Energy",
  love: "Love",
  awe: "Awe",
  calm: "Calm",
  reflective: "Reflective",
};

/**
 * The six-emotion picker. Tapping an orb selects it — it swells and brightens
 * (snappy spring) while the others dim. Selection state is owned by the parent.
 */
export function EmotionOrbs({
  selected,
  onSelect,
}: {
  selected: Emotion;
  onSelect: (e: Emotion) => void;
}) {
  return (
    <div className="flex items-start justify-center gap-2 sm:gap-4">
      {EMOTIONS.map((emotion) => {
        const isSelected = emotion === selected;
        const hue = EMOTION_HUES[emotion];
        return (
          <div key={emotion} className="flex w-12 flex-col items-center gap-2">
            <motion.button
              type="button"
              aria-label={LABELS[emotion]}
              aria-pressed={isSelected}
              onClick={() => onSelect(emotion)}
              className="relative h-11 w-11 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              animate={{
                scale: isSelected ? 1.22 : 0.9,
                opacity: isSelected ? 1 : 0.4,
              }}
              transition={SPRING.snappy}
              whileTap={{ scale: isSelected ? 1.12 : 0.98 }}
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
                    ? `0 0 26px 5px ${rgba(hue, 0.6)}`
                    : `0 0 12px 1px ${rgba(hue, 0.22)}`,
                }}
              />
            </motion.button>
            <motion.span
              className="select-none text-[10px] tracking-wide"
              animate={{ opacity: isSelected ? 0.85 : 0.3 }}
              transition={SPRING.snappy}
              style={{ color: isSelected ? hue : "var(--foreground)" }}
            >
              {LABELS[emotion]}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}
