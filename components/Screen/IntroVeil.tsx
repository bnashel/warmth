"use client";

/**
 * components/Screen/IntroVeil.tsx — the first hello (Eli, 2026-07-14).
 *
 * A one-time, few-second veil over the live map for first-time users:
 * three short lines in the app's own voice, then it breathes away. The
 * map is ALIVE underneath the whole time (this is an overlay, never a
 * page); a tap anywhere — or "skip" — ends it early. Seen-once persists
 * in localStorage ("warmth_onboarded"), so it never plays twice.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SEEN_KEY = "warmth_onboarded";

/** The three lines. Plain and warm — a friend explaining, not a product. */
const LINES = [
  "this is how the city feels right now",
  "every glow is someone, feeling something, for real",
  "press and hold the orb to add yours",
];
const LINE_MS = 1400; // each line holds this long before the next arrives
const TAIL_MS = 1600; // the last line lingers a touch, then the veil lifts

export function introSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked — never risk trapping the map behind copy
  }
}

export default function IntroVeil() {
  const [on, setOn] = useState(false);
  const [line, setLine] = useState(0);

  const dismiss = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // storage blocked — it may play again next visit; harmless
    }
    setOn(false);
  };

  // Mount-gated (SSR-stable): only a genuinely fresh device sees it.
  useEffect(() => {
    if (introSeen()) return;
    const id = window.setTimeout(() => setOn(true), 400); // let the city draw first
    return () => window.clearTimeout(id);
  }, []);

  // Advance the lines; after the last, lift the veil on its own.
  useEffect(() => {
    if (!on) return;
    if (line < LINES.length - 1) {
      const id = window.setTimeout(() => setLine(line + 1), LINE_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => dismiss(), LINE_MS + TAIL_MS);
    return () => window.clearTimeout(id);
     
  }, [on, line]);

  return (
    <AnimatePresence>
      {on && (
        <motion.div
          key="intro-veil"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.7, ease: "easeOut" } }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          onClick={dismiss}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 30, // over the map + chrome, under nothing that matters mid-intro
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // A breath of ink, not a wall: the living city stays visible.
            background:
              "radial-gradient(ellipse at 50% 45%, rgba(8,9,14,0.55) 0%, rgba(8,9,14,0.78) 100%)",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div style={{ padding: "0 28px", maxWidth: 520, textAlign: "center" }}>
            <AnimatePresence mode="wait">
              <motion.p
                key={line}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.55, ease: [0.22, 0.61, 0.36, 1] }}
                style={{
                  margin: 0,
                  color: "rgba(240,236,228,0.92)",
                  fontSize: "clamp(19px, 5vw, 26px)",
                  lineHeight: 1.45,
                  fontWeight: 300,
                  letterSpacing: "0.015em",
                  textShadow: "0 2px 24px rgba(0,0,0,0.55)",
                }}
              >
                {LINES[line]}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* skip — quiet, bottom, always there; the tap-anywhere does the same */}
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55 }}
            transition={{ delay: 0.8 }}
            style={{
              position: "absolute",
              bottom: "max(env(safe-area-inset-bottom), 26px)",
              left: 0,
              right: 0,
              textAlign: "center",
              color: "rgba(240,236,228,0.8)",
              fontSize: 12,
              letterSpacing: "0.12em",
            }}
          >
            skip
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
