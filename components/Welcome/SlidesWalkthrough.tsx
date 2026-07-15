/**
 * VERSION A — THE SLIDES. A standalone designed sequence in the ink void:
 * the five hues drift out of darkness and become the signature ribbon; the
 * axes figure draws where × what and then grows when; the ghost hand plays
 * a real orb; and at the end the void itself dissolves — the app was
 * running underneath the whole time, and the first real feeling is yours.
 *
 * Built only from tokens, gradients, and the product's own components. No
 * assets, no library beyond framer-motion. Everything springs; nothing pops.
 */
"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Inter } from "next/font/google";
import { EMOTION_HUES, EMOTIONS, SPRING } from "@/lib/theme";
import { ORB } from "@/components/Orb/feel";
import { useWelcome, type WelcomeFinish } from "@/components/Welcome/useWelcome";
import { WelcomeChrome } from "@/components/Welcome/WelcomeChrome";
import { AxesFigure } from "@/components/Welcome/AxesFigure";
import { GhostOrb } from "@/components/Welcome/GhostOrb";
import { GHOST_CAPTIONS, type GhostPhase } from "@/components/Welcome/script";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"] });

/** The five hues, left→right — the same signature ribbon the wall wears. */
const HUE_RIBBON = `linear-gradient(90deg, ${EMOTIONS.map((e) => EMOTION_HUES[e]).join(", ")})`;

/** Where each hue begins its drift (relative to its seat in the row). */
const SCATTER = [
  { x: -92, y: -64 },
  { x: 74, y: -96 },
  { x: -44, y: 74 },
  { x: 112, y: 42 },
  { x: -122, y: 18 },
];

export function SlidesWalkthrough({ onFinish }: { onFinish: (how: WelcomeFinish) => void }) {
  const seq = useWelcome(onFinish);
  const [ghostPhase, setGhostPhase] = useState<GhostPhase>("press");

  return (
    <motion.div
      className={inter.className}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
      style={{ position: "fixed", inset: 0, zIndex: 30, pointerEvents: "none" }}
    >
      {/* the void — the ink arrives FIRST and fast (darkness stays as
          continuous as the wall's exit allows: the app must not be glimpsed,
          or scene five's reveal is spent), opaque until the handoff, when it
          dissolves into the running app beneath (OneScreen never stopped
          breathing). The root itself doesn't fade in — only out. */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: seq.handoff ? 0 : 1 }}
        transition={
          seq.handoff
            ? { duration: 0.9, ease: "easeInOut" }
            : { duration: 0.45, ease: "easeOut" }
        }
        style={{ position: "absolute", inset: 0, background: "#0A0B0F" }}
      />

      {/* the scenes */}
      <AnimatePresence mode="wait">
        {seq.step.id === "welcome" && (
          <Scene key="welcome">
            <WordmarkScene />
          </Scene>
        )}
        {(seq.step.id === "public" || seq.step.id === "private") && (
          // one key for both steps: the figure stays mounted and GROWS its
          // third axis — the upgrade is witnessed, not cut to
          <Scene key="axes">
            <AxesFigure axes={seq.step.id === "private" ? 3 : 2} />
          </Scene>
        )}
        {seq.step.id === "orb" && (
          <motion.div
            key="orb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: "50%",
              bottom: `calc(env(safe-area-inset-bottom, 0px) + ${ORB.bottomOffset}px)`,
              transform: "translate(-50%, 50%)",
            }}
          >
            <GhostOrb playing={!seq.finished} onPhase={setGhostPhase} />
          </motion.div>
        )}
      </AnimatePresence>

      <WelcomeChrome
        step={seq.step}
        stepIndex={seq.stepIndex}
        total={seq.total}
        handoff={seq.handoff}
        finished={seq.finished}
        version="slides"
        onAdvance={seq.advance}
        onSkip={seq.skip}
        hideTitle={seq.step.id === "welcome"}
        linesOverride={seq.step.id === "orb" ? [GHOST_CAPTIONS[ghostPhase]] : undefined}
        footDim={seq.step.id === "orb" && ghostPhase === "burst"}
      />
    </motion.div>
  );
}

/** A centered stage in the upper field of the void. */
function Scene({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={SPRING.settle}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "16%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Scene one: the five feelings drift out of the dark, take their seats,
 * and settle into the signature ribbon under the wordmark.
 */
function WordmarkScene() {
  const reduced = useReducedMotion();
  const [ribbon, setRibbon] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setRibbon(true), reduced ? 400 : 2100);
    return () => window.clearTimeout(id);
  }, [reduced]);

  return (
    <div style={{ textAlign: "center", paddingTop: "14vh" }}>
      <motion.h1
        initial={{ opacity: 0, y: reduced ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0.15 } : { ...SPRING.settle, delay: 0.35 }}
        style={{
          fontSize: 40,
          fontWeight: 500,
          letterSpacing: "0.02em",
          color: "rgba(233,236,244,0.95)",
          margin: 0,
        }}
      >
        warmth
      </motion.h1>

      {/* the seats: five dots converge here, then become the ribbon */}
      <div style={{ position: "relative", height: 3, width: 148, margin: "18px auto 0" }}>
        {EMOTIONS.map((e, i) => (
          <motion.span
            key={e}
            initial={
              reduced
                ? { opacity: 0 }
                : { opacity: 0, x: SCATTER[i].x, y: SCATTER[i].y, scale: 0.5 }
            }
            animate={
              ribbon
                ? { opacity: 0, x: (i - 2) * 12, y: 0, scale: 0.5 }
                : { opacity: 1, x: (i - 2) * 30, y: 0, scale: 1 }
            }
            transition={
              reduced ? { duration: 0.15 } : { ...SPRING.settle, delay: ribbon ? i * 0.04 : 0.5 + i * 0.14 }
            }
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 14,
              height: 14,
              marginLeft: -7,
              marginTop: -7,
              borderRadius: "50%",
              background: EMOTION_HUES[e],
              boxShadow: `0 0 12px ${EMOTION_HUES[e]}55`,
            }}
          />
        ))}
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scaleX: 0.35 }}
          animate={ribbon ? { opacity: 0.8, scaleX: 1 } : { opacity: 0, scaleX: 0.35 }}
          transition={reduced ? { duration: 0.15 } : SPRING.settle}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 2,
            background: HUE_RIBBON,
          }}
        />
      </div>
    </div>
  );
}
