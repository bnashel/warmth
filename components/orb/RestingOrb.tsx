"use client";

import { useMotionValue, useTransform, motion, type MotionValue } from "framer-motion";
import { GLOW, ORB, TEXT } from "@/lib/feel";
import { Orb } from "./Orb";
import { usePulse, useOklchColor } from "./hooks";
import type { VariantId } from "./LabShell";

/**
 * Foundation state: the orb at rest — warm off-white, breathing, with the
 * one-word hint beneath. Variant gesture engines (PULL/BLOOM/PULSE) mount in
 * its place and reuse the same props.
 */
export function RestingOrb({
  variant,
  hintWord,
  gestureDepth: _gestureDepth, // driven by variants; rest state never dims chrome
}: {
  variant: VariantId;
  hintWord: string;
  gestureDepth: MotionValue<number>;
}) {
  // Breath: 1.00→1.04 over 2.5s — visible from across the room.
  const period = useMotionValue<number>(ORB.breath.periodS);
  const amp = useMotionValue<number>((ORB.breath.scaleMax - ORB.breath.scaleMin) / 2);
  const pulse = usePulse(period, amp);
  const base = (ORB.breath.scaleMax + ORB.breath.scaleMin) / 2;
  const scale = useTransform(pulse, (p) => base * p);

  const { rgb } = useOklchColor(ORB.restHue);
  const haloAlpha = useMotionValue<number>(GLOW.haloAlpha.rest);

  // The hint breathes with the orb — same pulse, mapped to opacity.
  const hintOpacity = useTransform(
    pulse,
    [1 - amp.get(), 1 + amp.get()],
    [TEXT.hint.opacity * 0.7, TEXT.hint.opacity],
  );

  return (
    <div
      data-variant={variant}
      style={{
        position: "relative",
        width: ORB.hitTarget,
        height: ORB.hitTarget,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Orb rgb={rgb} scale={scale} haloAlpha={haloAlpha} />
      <motion.span
        style={{
          position: "absolute",
          top: "100%",
          marginTop: TEXT.hint.offsetPx - (ORB.hitTarget - ORB.size) / 2,
          left: "50%",
          x: "-50%",
          fontSize: TEXT.hint.sizePx,
          color: "#FFFFFF",
          opacity: hintOpacity,
          letterSpacing: "0.04em",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {hintWord}
      </motion.span>
    </div>
  );
}
