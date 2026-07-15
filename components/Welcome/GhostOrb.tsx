/**
 * THE GHOST ORB — a real OrbFlow, mounted for demonstration and puppeted by
 * the ghost hand (ghostDriver). No onCommit: its bursts are light only.
 * Pointer-transparent to real fingers — only the synthetic pointer plays it.
 * A soft fingertip glow rides the gesture so the eye learns where the thumb
 * goes; captions above narrate each phase through onPhase.
 *
 * While resting between loops the ghost breathes like the real orb at idle.
 */
"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { OrbFlow } from "@/components/Orb/OrbFlow";
import type { Emotion } from "@/lib/theme";
import type { GhostPhase } from "@/components/Welcome/script";
import { runGhostGesture, type GhostGesture } from "@/components/Welcome/ghostDriver";

/** Each pass teaches a different feeling at a different strength — the
 *  variation IS the lesson ("stronger burns brighter"). Emotions sit low
 *  on the arc so every intensity sweep travels UPWARD from the dot's seat
 *  (a high dot would morph the bar in already full — confusing to watch). */
const DEMO_LOOP: Array<{ emotion: Emotion; intensity: number }> = [
  { emotion: "joy", intensity: 8 },
  { emotion: "energy", intensity: 4 },
  { emotion: "love", intensity: 10 },
];

const REST_BETWEEN_MS = 1900;

export function GhostOrb({
  playing,
  onPhase,
}: {
  /** True while the orb step is on stage; false cancels mid-gesture softly. */
  playing: boolean;
  onPhase?: (p: GhostPhase) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const gestureDepth = useMotionValue(0);
  const reduced = useReducedMotion();

  // the fingertip — el-relative, transform-only. The driver steps positions
  // at event cadence (~24fps); springs render them as continuous 60fps motion.
  const tipX = useMotionValue(0);
  const tipY = useMotionValue(0);
  const tipOn = useMotionValue(0);
  const tipXs = useSpring(tipX, { stiffness: 320, damping: 30 });
  const tipYs = useSpring(tipY, { stiffness: 320, damping: 30 });
  const tipOnS = useSpring(tipOn, { stiffness: 140, damping: 22 });

  const onPhaseRef = useRef(onPhase);
  useEffect(() => {
    onPhaseRef.current = onPhase;
  }, [onPhase]);

  useEffect(() => {
    if (!playing) return;
    let alive = true;
    let current: GhostGesture | null = null;

    const run = async () => {
      // let the step's entrance settle before the ghost reaches for the orb
      await new Promise((r) => window.setTimeout(r, 1250));
      let i = 0;
      while (alive) {
        // dispatch on OrbFlow's own container — the first element inside
        // the wrapper (events must originate inside its React subtree)
        const target = wrapRef.current?.firstElementChild as HTMLElement | null;
        if (!target) return;
        current = runGhostGesture(target, {
          ...DEMO_LOOP[i % DEMO_LOOP.length],
          onPhase: (p) => onPhaseRef.current?.(p),
          onPointer: (x, y, down) => {
            tipX.set(x);
            tipY.set(y);
            tipOn.set(down ? 1 : 0);
          },
        });
        await current.done;
        current = null;
        if (!alive) return;
        i += 1;
        await new Promise((r) => window.setTimeout(r, REST_BETWEEN_MS));
      }
    };
    void run();

    return () => {
      alive = false;
      current?.cancel(); // never strand a hum mid-gesture
      tipOn.set(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        pointerEvents: "none", // only the ghost's synthetic pointer plays it
        touchAction: "none",
      }}
    >
      <OrbFlow hintWord="" namesOn gestureDepth={gestureDepth} />
      {/* the fingertip: a soft pad of light riding the gesture */}
      {!reduced && (
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: 26,
            height: 26,
            marginLeft: -13,
            marginTop: -13,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(233,236,244,0.32) 0%, rgba(233,236,244,0.10) 55%, rgba(233,236,244,0) 75%)",
            x: tipXs,
            y: tipYs,
            opacity: tipOnS,
          }}
        />
      )}
    </div>
  );
}
