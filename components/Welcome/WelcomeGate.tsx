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
import { AnimatePresence } from "framer-motion";
import { devUnlocked } from "@/lib/dev";
import { welcomeStage } from "@/components/Welcome/stage";
import { onReplayWelcome } from "@/components/Welcome/state";
import { WELCOME_DEFAULT, type WelcomeVersion } from "@/components/Welcome/script";
import { welcomed, clearWelcomed } from "@/components/Welcome/useWelcome";
import { SlidesWalkthrough } from "@/components/Welcome/SlidesWalkthrough";
import { CinematicWalkthrough } from "@/components/Welcome/CinematicWalkthrough";

/** The auth wall exits over ~0.5–0.6s. The film waits it out (its stage is
 *  the live map the wall reveals); the slides start almost at once — their
 *  void rises WITH the wall's exit so darkness stays continuous and the
 *  app is never glimpsed before scene five's reveal. */
const ENTER_DELAY_MS: Record<WelcomeVersion, number> = { slides: 150, film: 700 };

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
      if (version) timer = window.setTimeout(() => begin(version), ENTER_DELAY_MS[version]);
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
        <CinematicWalkthrough key={`film-${run}`} onFinish={() => setActive(null)} />
      )}
    </AnimatePresence>
  );
}
