/**
 * THE GATE — decides whether a welcome plays, which version, and when.
 * Mounted in AppGate once the auth wall has resolved; waits one breath so
 * the wall's exit finishes before the welcome fades in (sequential, never
 * overlapping). Lives at zIndex 30: above every HUD control and the account
 * chip (20), far below the wall (100).
 *
 * THE BAKE-OFF: while WELCOME_DEFAULT is null nothing auto-plays — the two
 * versions are judged behind dev URL params:
 *   ?welcome=slides | film   force a version (ignores the welcomed flag)
 *   ?welcome=off             suppress entirely
 *   ?welcome=reset           forget this device was ever welcomed
 */
"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { devUnlocked } from "@/lib/dev";
import { welcomeStage } from "@/components/Welcome/stage";
import { onReplayWelcome } from "@/components/Welcome/state";
import { WELCOME_DEFAULT, type WelcomeVersion } from "@/components/Welcome/script";
import { welcomed, clearWelcomed, useWelcome, type WelcomeFinish } from "@/components/Welcome/useWelcome";
import { WelcomeChrome } from "@/components/Welcome/WelcomeChrome";
import { SlidesWalkthrough } from "@/components/Welcome/SlidesWalkthrough";

/** The auth wall exits over ~0.5–0.6s; the welcome enters after it's gone. */
const WALL_EXIT_MS = 700;

export function WelcomeGate() {
  const [active, setActive] = useState<WelcomeVersion | null>(null);
  // A fresh key per activation: a replay tapped during the previous exit
  // fade must mount a NEW shell, never resurrect the finished one.
  const [run, setRun] = useState(0);
  const begin = (v: WelcomeVersion) => {
    setRun((r) => r + 1);
    setActive(v);
  };

  // First-visit / forced-param decision — post-mount, SSR-stable.
  useEffect(() => {
    let timer: number | undefined;
    const params = new URLSearchParams(window.location.search);
    const forced = devUnlocked() ? params.get("welcome") : null;
    if (forced !== "off") {
      if (forced === "reset") clearWelcomed();
      const version =
        forced === "slides" || forced === "film"
          ? forced
          : WELCOME_DEFAULT && !welcomed()
            ? WELCOME_DEFAULT
            : null;
      if (version) timer = window.setTimeout(() => begin(version), WALL_EXIT_MS);
    }
    return () => window.clearTimeout(timer);
  }, []);

  // "watch the welcome again" — the quiet replay row, wherever it lives.
  useEffect(
    () =>
      onReplayWelcome(() => {
        if (WELCOME_DEFAULT) begin(WELCOME_DEFAULT);
      }),
    [],
  );

  // THE SAFETY NET: if the gate dies mid-welcome (sign-out unmounts it with
  // no exit choreography), whatever a shell borrowed from the product must
  // come back — the real orb must never stay hidden in an app with no
  // welcome on screen. Shells do their own graceful cleanup; this catches
  // the ungraceful path.
  useEffect(
    () => () => {
      welcomeStage()?.setOrbHidden(false);
    },
    [],
  );

  return (
    <AnimatePresence>
      {active === "slides" && (
        <SlidesWalkthrough key={`slides-${run}`} onFinish={() => setActive(null)} />
      )}
      {active === "film" && (
        <WelcomeShell key={`film-${run}`} version="film" onFinish={() => setActive(null)} />
      )}
    </AnimatePresence>
  );
}

/**
 * The film's placeholder shell: captions over a soft scrim until the real
 * CinematicWalkthrough lands. Root is pointer-transparent — the chrome
 * layer decides what's touchable, so the handoff step can let the real orb
 * receive the gesture.
 */
function WelcomeShell({
  version,
  onFinish,
}: {
  version: WelcomeVersion;
  onFinish: (how: WelcomeFinish) => void;
}) {
  const seq = useWelcome(onFinish);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.7, ease: "easeOut" } }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      {/* the focus veil — the hold-scrim recipe: one ink div, opacity only */}
      <motion.div
        aria-hidden
        animate={{ opacity: seq.handoff ? 0 : 0.5 }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          background: "#06070A",
          opacity: 0.5,
          pointerEvents: "none",
        }}
      />
      <WelcomeChrome
        step={seq.step}
        stepIndex={seq.stepIndex}
        total={seq.total}
        handoff={seq.handoff}
        finished={seq.finished}
        version={version}
        onAdvance={seq.advance}
        onSkip={seq.skip}
      />
    </motion.div>
  );
}
