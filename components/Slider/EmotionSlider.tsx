"use client";

import { useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import { EmotionOrbs, LABELS } from "./EmotionOrbs";
import { IntensitySlider } from "./IntensitySlider";
import { rgba } from "./color";

/**
 * The signature interaction: pick an emotion, set its intensity, commit.
 * Standalone (no map, no Supabase yet) — pure feel. The shared `progress`
 * motion value lives here so the whole component's glow can react to intensity,
 * and so a committed rating can "fly" up toward where the map will be.
 */
export default function EmotionSlider() {
  const [emotion, setEmotion] = useState<Emotion>("calm");
  const hue = EMOTION_HUES[emotion];
  const reduce = useReducedMotion();

  const progress = useMotionValue((5 - 1) / 9);
  const glowOpacity = useTransform(progress, [0, 1], [0.1, 0.55]);
  const glowScale = useTransform(progress, [0, 1], [0.75, 1.3]);

  // A committed rating that's flying off toward the map.
  const [flying, setFlying] = useState<{ id: number; emotion: Emotion } | null>(
    null,
  );
  const flyId = useRef(0);

  function handleCommit() {
    flyId.current += 1;
    setFlying({ id: flyId.current, emotion });
  }

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-12 px-6">
      {/* Living glow — brighter and larger as intensity climbs. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[90px]"
        style={{
          background: `radial-gradient(circle, ${rgba(hue, 0.55)}, transparent 70%)`,
          opacity: glowOpacity,
          scale: glowScale,
          willChange: "transform, opacity",
        }}
      />

      {/* Committed rating flying up to join the map. */}
      <AnimatePresence>
        {flying && (
          <motion.div
            key={flying.id}
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-12 w-12 rounded-full"
            style={{
              marginLeft: -24,
              marginTop: -24,
              background: `radial-gradient(circle at 50% 38%, ${rgba(
                EMOTION_HUES[flying.emotion],
                0.98,
              )}, ${rgba(EMOTION_HUES[flying.emotion], 0.5)} 55%, transparent 82%)`,
              boxShadow: `0 0 34px 8px ${rgba(EMOTION_HUES[flying.emotion], 0.6)}`,
              willChange: "transform, opacity",
            }}
            initial={{ y: 0, scale: 1, opacity: 1 }}
            animate={{
              y: reduce ? -60 : -380,
              scale: reduce ? 0.6 : 0.3,
              opacity: 0,
            }}
            transition={
              reduce
                ? { duration: 0.45, ease: "easeOut" }
                : { type: "spring", stiffness: 210, damping: 24 }
            }
            onAnimationComplete={() => setFlying(null)}
          />
        )}
      </AnimatePresence>

      <div className="flex flex-col items-center gap-4">
        <EmotionOrbs selected={emotion} onSelect={setEmotion} />
        <span
          className="text-xs uppercase tracking-[0.25em]"
          style={{ color: hue, opacity: 0.85 }}
        >
          {LABELS[emotion]}
        </span>
      </div>

      <IntensitySlider
        emotion={emotion}
        progress={progress}
        onCommit={handleCommit}
      />
    </div>
  );
}
