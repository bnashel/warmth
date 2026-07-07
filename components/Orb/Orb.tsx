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

  // On paper, spilled light is GLARE: the halo pulls in and the white-hot
  // core quiets so the orb reads as a colored object on the page, not a
  // wash of brightness (Ben: "the blob is too much" at noon). Continuous
  // on the same paper ramp as everything else; 0 at night = untouched.
  const glare = 1 - 0.55 * paper;
  const coreWhite = 1 - 0.35 * paper;

  // Gradient strings derived from the live color — recomputed off-render.
  // THE INSTRUMENT (phase 5): closest-side gradients so every layer ENDS
  // inside its own box — a crisp lamp with a tight halo, never a wash that
  // reads as glow on the map beneath.
  const haloBg = useTransform(() => {
    const c = rgb.get();
    const a = haloAlpha.get() * glare;
    return `radial-gradient(closest-side, rgba(${c},${a.toFixed(3)}) 0%, rgba(${c},${(
      a * 0.4
    ).toFixed(3)}) 48%, rgba(${c},0) 82%)`;
  });
  const midBg = useTransform(() => {
    const c = rgb.get();
    // The ball itself: full-bodied to 82% of the radius, then a short
    // 3–4px feather — a defined edge, an object you could pick up.
    return `radial-gradient(closest-side, rgba(${c},${GLOW.midAlpha}) 0%, rgba(${c},${(
      GLOW.midAlpha * 0.94
    ).toFixed(3)}) 66%, rgba(${c},${(GLOW.midAlpha * 0.82).toFixed(3)}) 84%, rgba(${c},0) 99%)`;
  });
  const coreBg = useTransform(() => {
    const c = rgb.get();
    return `radial-gradient(closest-side, rgba(255,255,255,${(0.95 * coreWhite).toFixed(3)}) 0%, rgba(255,255,255,${(
      0.55 * coreWhite
    ).toFixed(3)}) ${GLOW.coreFrac * 100}%, rgba(${c},0.3) 52%, rgba(${c},0) 72%)`;
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
      {/* Floating shadow — ALWAYS on (phase 5: the orb clearly floats above
          the map). Deeper on paper; at night it reads where streets and
          parks pass beneath. Composited once, costs nothing. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * 1.1,
          height: size * 0.46,
          transform: "translate(-50%, 34%)",
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%)",
          opacity:
            GLOW.shadowAlpha.night + (GLOW.shadowAlpha.paper - GLOW.shadowAlpha.night) * paper,
          filter: "blur(6px)",
        }}
      />
      {/* Tight halo — hugs the glass; never a wash on the city. */}
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
      {/* Mid body — this IS the visible ball: defined edge, thin glass rim. */}
      <motion.div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: size * 1.06,
          height: size * 1.06,
          x: "-50%",
          y: "-50%",
          borderRadius: "50%",
          boxShadow: `inset 0 0 0 1px rgba(255,255,255,${GLOW.rimAlpha})`,
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
