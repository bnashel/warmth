"use client";

import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import { rgba } from "./color";

/**
 * Intensity 1–10. Step 1: static visual composition (fixed value, no drag).
 * Drag, spring handle, smooth number, sound, and keyboard land in later steps.
 */
export function IntensitySlider({ emotion }: { emotion: Emotion }) {
  const value = 5;
  const progress = (value - 1) / 9;
  const hue = EMOTION_HUES[emotion];

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div
        className="text-7xl font-extralight tabular-nums leading-none"
        style={{ color: hue, textShadow: `0 0 30px ${rgba(hue, 0.5)}` }}
      >
        {value}
      </div>

      <div className="relative h-3 w-full rounded-full bg-white/[0.06]">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${progress * 100}%`,
            background: `linear-gradient(90deg, ${rgba(hue, 0.35)}, ${rgba(
              hue,
              0.95,
            )})`,
          }}
        />
        <div
          className="absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{
            left: `${progress * 100}%`,
            boxShadow: `0 0 18px 3px ${rgba(hue, 0.7)}`,
          }}
        />
      </div>
    </div>
  );
}
