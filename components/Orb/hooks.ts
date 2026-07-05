"use client";

import { useEffect, useRef } from "react";
import {
  animate,
  useMotionValue,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { COLOR, ORB } from "./feel";
import { mixHexRgbString } from "./oklch";

/**
 * The orb's breath/pulse: a rAF oscillator writing 1 ± amp·sin(φ) into a
 * motion value. Phase advances by dt/period each frame, so period changes
 * (intensity tightening the pulse) are perfectly continuous — no jumps.
 * Respects prefers-reduced-motion (flat 1).
 */
export function usePulse(
  periodS: MotionValue<number>,
  amp: MotionValue<number>,
): MotionValue<number> {
  const pulse = useMotionValue(1);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      pulse.set(1);
      return;
    }
    let raf = 0;
    let phase = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); // clamp tab-resume jumps
      last = now;
      phase += dt / Math.max(0.1, periodS.get());
      pulse.set(1 + amp.get() * Math.sin(phase * Math.PI * 2));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pulse, periodS, amp, reduced]);

  return pulse;
}

/**
 * The orb's color as a live "R,G,B" string, with OKLCH crossfades.
 * `fadeTo(hex)` runs the 150ms *becoming* transition; `snapTo(rgb)` writes
 * directly (Variant B's continuous spectrum drives this every frame).
 */
export function useOklchColor(initialHex: string = ORB.restHue) {
  const rgb = useMotionValue(mixHexRgbString(initialHex, initialHex, 0));
  const currentHex = useRef(initialHex);
  const anim = useRef<ReturnType<typeof animate> | null>(null);

  function fadeTo(hex: string, durationMs: number = COLOR.crossfadeMs) {
    if (hex === currentHex.current) return;
    const from = currentHex.current;
    currentHex.current = hex;
    anim.current?.stop();
    anim.current = animate(0, 1, {
      duration: durationMs / 1000,
      ease: "easeOut",
      onUpdate: (t) => rgb.set(mixHexRgbString(from, hex, t)),
    });
  }

  /** Direct write (already-blended "R,G,B"). Marks hex unknown. */
  function snapTo(rgbString: string, hexAnchor?: string) {
    anim.current?.stop();
    rgb.set(rgbString);
    if (hexAnchor) currentHex.current = hexAnchor;
  }

  return { rgb, fadeTo, snapTo, currentHex };
}

/** Session-scoped flag (e.g. hint dies after the first commit). */
export function useSessionFlag(key: string): [() => boolean, () => void] {
  const get = () => {
    try {
      return sessionStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  const set = () => {
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  };
  return [get, set];
}
