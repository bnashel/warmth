"use client";

import { useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "framer-motion";
import { EMOTION_HUES, SPRING, type Emotion } from "@/lib/theme";
import { rgba } from "./color";
import { haptic } from "./haptics";

const MIN = 1;
const MAX = 10;
const DEFAULT = 5;

/** A big, tactile bar you drag. Fill warms from white → the emotion's color as
 * intensity climbs (brightness = intensity), the white handle swells on grab
 * and settles on release, and every notch gives a haptic tick. Touch + mouse +
 * keyboard. Position is driven by a motion value, so dragging stays at 60fps. */
export function IntensitySlider({ emotion }: { emotion: Emotion }) {
  const hue = EMOTION_HUES[emotion];
  const trackRef = useRef<HTMLDivElement>(null);
  const grabbedRef = useRef(false);

  const progress = useMotionValue((DEFAULT - MIN) / (MAX - MIN));
  const [value, setValue] = useState(DEFAULT);
  const [grabbed, setGrabbed] = useState(false);

  // Warming fill: soft warm-white at low intensity → full hue at high.
  const warmWhite = "rgba(255, 246, 234, 0.92)";
  const fillColor = useTransform(progress, [0, 1], [warmWhite, rgba(hue, 1)]);
  const widthPct = useTransform(progress, (p) => `${p * 100}%`);
  const glowA = useTransform(progress, [0, 1], [0.18, 0.95]);

  const fillBg = useTransform(
    fillColor,
    (c) => `linear-gradient(90deg, ${rgba(hue, 0.12)}, ${c})`,
  );
  const fillShadow = useTransform(glowA, (g) => `0 0 44px ${rgba(hue, g)}`);
  const handleShadow = useTransform(
    glowA,
    (g) => `0 0 26px 4px ${rgba(hue, g)}`,
  );
  const numShadow = useTransform(
    glowA,
    (g) => `0 0 38px ${rgba(hue, g * 0.7)}`,
  );

  // Integer crossings drive the number + a haptic notch (sound lands next step).
  useMotionValueEvent(progress, "change", (p) => {
    const v = Math.round(MIN + p * (MAX - MIN));
    setValue((prev) => {
      if (v !== prev) haptic(6);
      return v;
    });
  });

  function setFromClientX(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    progress.set(p);
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    grabbedRef.current = true;
    setGrabbed(true);
    haptic(12);
    setFromClientX(e.clientX);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!grabbedRef.current) return;
    setFromClientX(e.clientX);
  }
  function endGrab() {
    if (!grabbedRef.current) return;
    grabbedRef.current = false;
    setGrabbed(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : 0;
    if (!dir) return;
    e.preventDefault();
    const next = Math.min(MAX, Math.max(MIN, value + dir));
    progress.set((next - MIN) / (MAX - MIN));
    haptic(6);
  }

  return (
    <div className="flex w-full flex-col items-center gap-10">
      <motion.div
        className="text-8xl font-thin tabular-nums leading-none"
        style={{ color: fillColor, textShadow: numShadow }}
      >
        {value}
      </motion.div>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Intensity"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGrab}
        onPointerCancel={endGrab}
        onKeyDown={onKeyDown}
        className="relative h-16 w-full cursor-pointer touch-none select-none overflow-hidden rounded-full bg-white/[0.06] outline-none ring-1 ring-inset ring-white/10 focus-visible:ring-2 focus-visible:ring-white/40"
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: widthPct, background: fillBg, boxShadow: fillShadow }}
        />
        <motion.div
          className="absolute top-1/2 h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: widthPct, boxShadow: handleShadow }}
          animate={{ scale: grabbed ? 1.16 : 1 }}
          transition={grabbed ? SPRING.snappy : SPRING.settle}
        />
      </div>
    </div>
  );
}
