"use client";

import { useEffect, useState } from "react";
import { Inter } from "next/font/google";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { ORB, TEXT } from "@/lib/feel";
import { isMuted, panic, setMuted, unlockAudio } from "@/lib/sound";
import { OrbFlow } from "./OrbFlow";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/**
 * The lab: a full-viewport void (#0A0B0F) with one living orb bottom-center.
 * Chrome is two whispers — mute (top-right) and a one-word hint. Everything
 * else is light on darkness.
 */
export default function LabShell() {
  const [muted, setMutedState] = useState(false);
  // 0 = idle chrome, 1 = mid-gesture (chrome fades to gestureOpacity).
  const gestureDepth = useMotionValue(0);
  const chromeOpacity = useTransform(
    gestureDepth,
    [0, 1],
    [1, TEXT.chrome.gestureOpacity / TEXT.chrome.idleOpacity],
  );

  useEffect(() => {
    setMutedState(isMuted());
    // Sounds must never survive the tab losing focus mid-gesture.
    const onHide = () => {
      if (document.hidden) panic();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  return (
    <div
      className={inter.className}
      onPointerDown={unlockAudio}
      style={{
        position: "fixed",
        inset: 0,
        background: "#0A0B0F",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        overscrollBehavior: "none",
      }}
    >
      {/* Mute — top-right, tiny hand-drawn speaker glyph. */}
      <motion.button
        type="button"
        aria-label={muted ? "unmute" : "mute"}
        onClick={() => {
          const next = !muted;
          setMuted(next);
          setMutedState(next);
        }}
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top), 16px)",
          right: 16,
          width: 36,
          height: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          opacity: chromeOpacity,
          zIndex: 10,
        }}
      >
        <SpeakerGlyph muted={muted} />
      </motion.button>

      {/* The orb flow, bottom-center above the safe area. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: `calc(env(safe-area-inset-bottom, 0px) + ${ORB.bottomOffset}px)`,
          transform: "translate(-50%, 50%)",
          zIndex: 5,
        }}
      >
        <OrbFlow hintWord="hold" gestureDepth={gestureDepth} />
      </div>
    </div>
  );
}

/** Minimal speaker mark, stroke-only — 30% white like the rest of the chrome. */
function SpeakerGlyph({ muted }: { muted: boolean }) {
  const stroke = `rgba(255,255,255,${TEXT.chrome.idleOpacity})`;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 6v4h2.6L9 13V3L5.1 6H2.5z"
        stroke={stroke}
        strokeWidth="1.1"
        strokeLinejoin="round"
        fill={muted ? "none" : stroke}
        fillOpacity={muted ? 0 : 0.5}
      />
      {muted ? (
        <path d="M11 6l3.5 4M14.5 6L11 10" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
      ) : (
        <path d="M11.2 6.2a2.6 2.6 0 010 3.6" stroke={stroke} strokeWidth="1.1" strokeLinecap="round" />
      )}
    </svg>
  );
}
