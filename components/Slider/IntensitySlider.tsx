"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
const HANDLE = 26; // px — the ball
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** A slim, tactile intensity bar (1–10). The ball tracks your finger 1:1 and
 * stays fully inside the ends; the fill warms white → the emotion's color as
 * intensity climbs. Position is a GPU transform driven by a motion value, so
 * the drag stays clean at 60fps. Touch + mouse + keyboard. */
export function IntensitySlider({ emotion }: { emotion: Emotion }) {
  const hue = EMOTION_HUES[emotion];

  const elRef = useRef<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  const grabbedRef = useRef(false);
  const lastInt = useRef(DEFAULT);

  const progress = useMotionValue((DEFAULT - MIN) / (MAX - MIN));
  const [value, setValue] = useState(DEFAULT);
  const [grabbed, setGrabbed] = useState(false);

  // Measure the track (pre-paint via ref callback, and on resize).
  const setRef = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
    if (el) setTrackW(el.clientWidth);
  }, []);
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const usable = Math.max(0, trackW - HANDLE);
  const handleX = useTransform(progress, (p) => p * usable); // ball left edge
  const fillW = useTransform(progress, (p) => p * usable + HANDLE / 2); // to ball center

  // Warming fill: soft warm-white (low) → full hue (high).
  const warmWhite = "rgba(255, 246, 234, 0.92)";
  const fillColor = useTransform(progress, [0, 1], [warmWhite, rgba(hue, 1)]);
  const glowA = useTransform(progress, [0, 1], [0.16, 0.95]);
  const fillBg = useTransform(
    fillColor,
    (c) => `linear-gradient(90deg, ${rgba(hue, 0.1)}, ${c})`,
  );
  const fillShadow = useTransform(glowA, (g) => `0 0 34px ${rgba(hue, g)}`);
  const handleShadow = useTransform(
    glowA,
    (g) => `0 0 22px 2px ${rgba(hue, g * 0.9)}`,
  );
  const numShadow = useTransform(glowA, (g) => `0 0 34px ${rgba(hue, g * 0.7)}`);

  // Integer crossings → number + a haptic notch (sound lands next step).
  useMotionValueEvent(progress, "change", (p) => {
    const v = Math.round(MIN + p * (MAX - MIN));
    if (v !== lastInt.current) {
      lastInt.current = v;
      setValue(v);
      haptic(6);
    }
  });

  function setFromClientX(clientX: number) {
    const el = elRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Map so the ball CENTER tracks the finger, reaching 0/1 at the inset ends.
    progress.set(clamp((clientX - rect.left - HANDLE / 2) / (rect.width - HANDLE)));
  }

  function onPointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    grabbedRef.current = true;
    setGrabbed(true);
    haptic(12);
    setFromClientX(e.clientX);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (grabbedRef.current) setFromClientX(e.clientX);
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
    <div className="flex w-full flex-col items-center gap-9">
      <motion.div
        className="text-7xl font-thin tabular-nums leading-none"
        style={{ color: fillColor, textShadow: numShadow }}
      >
        {value}
      </motion.div>

      <div
        ref={setRef}
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
        className="relative flex h-11 w-full cursor-pointer touch-none select-none items-center outline-none"
      >
        {/* slim visible track */}
        <div className="relative h-2.5 w-full rounded-full bg-white/[0.06] ring-1 ring-inset ring-white/10">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: fillW, background: fillBg, boxShadow: fillShadow }}
          />
        </div>
        {/* ball — inset so it never leaves the ends */}
        <motion.div
          className="absolute left-0 rounded-full bg-white"
          style={{
            x: handleX,
            y: "-50%",
            top: "50%",
            width: HANDLE,
            height: HANDLE,
            boxShadow: handleShadow,
          }}
          animate={{ scale: grabbed ? 1.18 : 1 }}
          transition={grabbed ? SPRING.snappy : SPRING.settle}
        />
      </div>
    </div>
  );
}
