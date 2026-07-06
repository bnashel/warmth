"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import { GLOW, ORB } from "./feel";

/**
 * The orb — pure presentation, driven entirely by motion values from the
 * active variant's gesture engine. Three stacked radial-gradient layers
 * (white-hot core / hue mid / outer halo), blur baked into the gradients.
 * Animates ONLY via transform + opacity. Zero React re-renders per frame.
 */
export function Orb({
  rgb,
  scale,
  scaleY,
  haloAlpha,
  paper = 0,
}: {
  /** "R,G,B" string (already OKLCH-mixed upstream). */
  rgb: MotionValue<string>;
  /** Final composed scale (base × pulse × gesture). */
  scale: MotionValue<number>;
  /** Extra Y squash for impact moments (Variant C). Usually 1. */
  scaleY?: MotionValue<number>;
  /** Halo strength 0..1 → alpha between rest and max reach. */
  haloAlpha: MotionValue<number>;
  /** Solar day-weight 0..1: on paper the orb casts a soft contact shadow —
   *  an object resting on the page, not light washed out by daylight. */
  paper?: number;
}) {
  const size = ORB.size;

  // Gradient strings derived from the live color — recomputed off-render.
  const haloBg = useTransform(() => {
    const c = rgb.get();
    const a = haloAlpha.get();
    return `radial-gradient(circle, rgba(${c},${a.toFixed(3)}) 0%, rgba(${c},${(
      a * 0.45
    ).toFixed(3)}) 38%, rgba(${c},0) 68%)`;
  });
  const midBg = useTransform(() => {
    const c = rgb.get();
    return `radial-gradient(circle, rgba(${c},${GLOW.midAlpha}) 0%, rgba(${c},${
      GLOW.midAlpha * 0.75
    }) 42%, rgba(${c},0.05) 68%, rgba(${c},0) 74%)`;
  });
  const coreBg = useTransform(() => {
    const c = rgb.get();
    return `radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.55) ${
      GLOW.coreFrac * 100
    }%, rgba(${c},0.28) 46%, rgba(${c},0) 62%)`;
  });

  return (
    <motion.div
      aria-hidden
      style={{
        width: size,
        height: size,
        scale,
        scaleY: scaleY ?? 1,
        position: "relative",
      }}
    >
      {/* Contact shadow — only on paper (opacity 0 at night, composited,
          costs nothing). Grounds the glow as a thing you can touch. */}
      {paper > 0.01 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: size * 1.15,
            height: size * 0.5,
            transform: "translate(-50%, 24%)",
            borderRadius: "50%",
            background:
              "radial-gradient(closest-side, rgba(38,42,54,0.30) 0%, rgba(38,42,54,0.10) 55%, rgba(38,42,54,0) 100%)",
            opacity: paper,
            filter: "blur(6px)",
          }}
        />
      )}
      {/* Outer halo — the light that spills into the void. */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * GLOW.haloFrac * 2,
          height: size * GLOW.haloFrac * 2,
          x: "-50%",
          y: "-50%",
          background: haloBg,
          willChange: "transform, opacity",
        }}
      />
      {/* Mid body — this IS the visible ball. */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * 1.5,
          height: size * 1.5,
          x: "-50%",
          y: "-50%",
          background: midBg,
          willChange: "transform, opacity",
        }}
      />
      {/* White-hot core. */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size,
          height: size,
          x: "-50%",
          y: "-50%",
          background: coreBg,
          willChange: "transform, opacity",
        }}
      />
    </motion.div>
  );
}
