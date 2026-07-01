"use client";

import { useState } from "react";
import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import { EmotionOrbs, LABELS } from "./EmotionOrbs";
import { IntensitySlider } from "./IntensitySlider";

/**
 * The signature interaction: pick an emotion, set its intensity, commit.
 * Standalone (no map, no Supabase yet) — pure feel. Built up step by step.
 */
export default function EmotionSlider() {
  const [emotion, setEmotion] = useState<Emotion>("calm");
  const hue = EMOTION_HUES[emotion];

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-12 px-6">
      <div className="flex flex-col items-center gap-4">
        <EmotionOrbs selected={emotion} onSelect={setEmotion} />
        <span
          className="text-xs uppercase tracking-[0.25em]"
          style={{ color: hue, opacity: 0.85 }}
        >
          {LABELS[emotion]}
        </span>
      </div>
      <IntensitySlider emotion={emotion} />
    </div>
  );
}
