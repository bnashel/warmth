"use client";

import { useState } from "react";
import { type Emotion } from "@/lib/theme";
import { EmotionOrbs } from "./EmotionOrbs";
import { IntensitySlider } from "./IntensitySlider";

/**
 * The signature interaction: pick an emotion, set its intensity, commit.
 * Standalone (no map, no Supabase yet) — pure feel. Built up step by step.
 */
export default function EmotionSlider() {
  const [emotion, setEmotion] = useState<Emotion>("calm");

  return (
    <div className="relative flex w-full max-w-md flex-col items-center gap-14 px-6">
      <EmotionOrbs selected={emotion} onSelect={setEmotion} />
      <IntensitySlider emotion={emotion} />
    </div>
  );
}
