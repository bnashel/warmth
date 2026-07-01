"use client";

import { useState } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import { EmotionOrbs, LABELS } from "./EmotionOrbs";
import { IntensitySlider } from "./IntensitySlider";
import { rgba } from "./color";

/**
 * The signature interaction: pick an emotion, set its intensity, commit.
 * Standalone (no map, no Supabase yet) — pure feel. The shared `progress`
 * motion value lives here so the whole component's glow can react to intensity.
 */
export default function EmotionSlider() {
  const [emotion, setEmotion] = useState<Emotion>("calm");
  const hue = EMOTION_HUES[emotion];

  const progress = useMotionValue((5 - 1) / 9);
  const glowOpacity = useTransform(progress, [0, 1], [0.1, 0.55]);
  const glowScale = useTransform(progress, [0, 1], [0.75, 1.3]);

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
        }}
      />

      <div className="flex flex-col items-center gap-4">
        <EmotionOrbs selected={emotion} onSelect={setEmotion} />
        <span
          className="text-xs uppercase tracking-[0.25em]"
          style={{ color: hue, opacity: 0.85 }}
        >
          {LABELS[emotion]}
        </span>
      </div>

      <IntensitySlider emotion={emotion} progress={progress} />
    </div>
  );
}
