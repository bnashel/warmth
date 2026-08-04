"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { BURST, ORB, seededRandom } from "./feel";

/**
 * The commit burst — the reward. An expanding ring + a handful of drifting
 * sparks in the committed hue. VARIABLE REWARD: everything is jittered from a
 * per-commit seed (ring timing/scale ±, spark directions/distances/sizes), so
 * no two commits ever render identically. Transform/opacity only.
 *
 * `slowMs` overrides ring duration (Variant B's 900ms exhale).
 */
export function CommitBurst({
  seed,
  rgb,
  sizeScale = 1,
  slowMs,
  onDone,
}: {
  seed: number;
  rgb: string; // "R,G,B" of the committed hue
  /** Committed orb scale — the reward must scale WITH the investment: a
   *  max-intensity commit throws its ring/sparks past the bigger glow. */
  sizeScale?: number;
  slowMs?: number;
  onDone?: () => void;
}) {
  // All randomness resolved once per burst from the seed.
  const plan = useMemo(() => {
    const rand = seededRandom(seed);
    const jitter = (base: number, pct: number) => base * (1 + (rand() * 2 - 1) * pct);
    const ringMs = jitter(slowMs ?? BURST.ring.ms, BURST.ringJitterPct);
    const ringScale = jitter(BURST.ring.scaleTo, BURST.ringJitterPct);
    const sparks = Array.from({ length: BURST.sparks.count }, (_, i) => {
      const angle =
        (i / BURST.sparks.count) * Math.PI * 2 + rand() * ((Math.PI * 2) / BURST.sparks.count);
      const dist =
        (BURST.sparks.distancePx.min +
          rand() * (BURST.sparks.distancePx.max - BURST.sparks.distancePx.min)) *
        sizeScale;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist * 0.9 - 8, // slight upward bias — it "lifts"
        size:
          BURST.sparks.sizePx.min + rand() * (BURST.sparks.sizePx.max - BURST.sparks.sizePx.min),
        ms:
          BURST.sparks.durationMs.min +
          rand() * (BURST.sparks.durationMs.max - BURST.sparks.durationMs.min),
        delay: rand() * 60,
      };
    });
    return { ringMs, ringScale, sparks };
  }, [seed, slowMs, sizeScale]);

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 0,
        height: 0,
        pointerEvents: "none",
      }}
    >
      {/* THE HUE WASH (round 2, item 5): a translucent breath of the
          committed color exhaling outward under the ring — the moment must
          be unmistakable. Transform/opacity only; gone in one breath. */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: ORB.size * sizeScale,
          height: ORB.size * sizeScale,
          marginLeft: (-ORB.size * sizeScale) / 2,
          marginTop: (-ORB.size * sizeScale) / 2,
          borderRadius: "50%",
          background: `radial-gradient(closest-side, rgba(${rgb},0.5) 0%, rgba(${rgb},0.28) 55%, rgba(${rgb},0) 95%)`,
          willChange: "transform, opacity",
        }}
        initial={{ scale: 0.9, opacity: 0.6 }}
        animate={{ scale: plan.ringScale * 1.35, opacity: 0 }}
        transition={{ duration: (plan.ringMs * 1.25) / 1000, ease: BURST.ring.ease }}
      />
      {/* Expanding ring — born at the committed orb's edge, washing outward. */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: ORB.size * sizeScale,
          height: ORB.size * sizeScale,
          marginLeft: (-ORB.size * sizeScale) / 2,
          marginTop: (-ORB.size * sizeScale) / 2,
          borderRadius: "50%",
          border: `1.5px solid rgba(${rgb},0.9)`,
          boxShadow: `0 0 24px rgba(${rgb},0.35), inset 0 0 18px rgba(${rgb},0.25)`,
          willChange: "transform, opacity",
        }}
        initial={{ scale: 1, opacity: BURST.ring.opacityFrom }}
        animate={{ scale: plan.ringScale, opacity: 0 }}
        transition={{ duration: plan.ringMs / 1000, ease: BURST.ring.ease }}
        onAnimationComplete={onDone}
      />
      {/* Sparks — seeded drift, never the same twice. */}
      {plan.sparks.map((s, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            left: -s.size / 2,
            top: -s.size / 2,
            width: s.size,
            height: s.size,
            borderRadius: "50%",
            // White-hot core with a hue corona — reads even against same-hue glow.
            background: `rgba(255,255,255,0.95)`,
            boxShadow: `0 0 10px 2px rgba(${rgb},0.8)`,
            willChange: "transform, opacity",
          }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 0.9 }}
          animate={{ x: s.x, y: s.y, scale: 0.4, opacity: 0 }}
          transition={{
            duration: s.ms / 1000,
            delay: s.delay / 1000,
            ease: BURST.ring.ease,
          }}
        />
      ))}
    </div>
  );
}
