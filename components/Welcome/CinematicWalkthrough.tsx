/**
 * VERSION B — THE FILM. No slides: the real night map is the backdrop the
 * whole time, and each step is a short caption while the product performs.
 * The camera pushes in as the city introduces itself; three feelings ignite
 * live mid-caption; the view crossfades to private and a glimpse journal
 * shows the axis of time; the ghost hand plays the orb in its real place;
 * then the scrim breathes out and the first real feeling is yours.
 *
 * Everything moves through the product's own machinery — the stage
 * contract (view, camera, orb island), the store's arrival choreography,
 * and the trail's own renderers. The film stages; it never forks.
 */
"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { momentsStore } from "@/lib/momentsStore";
import { CAMERA } from "@/components/Map/tune";
import { ORB } from "@/components/Orb/feel";
import { SPRING } from "@/lib/theme";
import { setJournalPreview } from "@/components/Trail/testJournal";
import { welcomeStage } from "@/components/Welcome/stage";
import { useWelcome, type WelcomeFinish } from "@/components/Welcome/useWelcome";
import { WelcomeChrome } from "@/components/Welcome/WelcomeChrome";
import { AxesFigure } from "@/components/Welcome/AxesFigure";
import { GhostOrb } from "@/components/Welcome/GhostOrb";
import { demoMoments } from "@/components/Welcome/demoMoments";
import { GHOST_CAPTIONS, type GhostPhase, type WelcomeStep } from "@/components/Welcome/script";

/** The focus veil per step — the map is the show, so it stays faint except
 *  under the ghost demo, and breathes out entirely for the handoff. */
const SCRIM: Record<WelcomeStep["id"], number> = {
  welcome: 0.22,
  public: 0.1,
  private: 0.1,
  orb: 0.42,
  yours: 0,
};

export function CinematicWalkthrough({ onFinish }: { onFinish: (how: WelcomeFinish) => void }) {
  const seq = useWelcome(onFinish);
  const [ghostPhase, setGhostPhase] = useState<GhostPhase>("press");

  // THE CHOREOGRAPHY — each step directs the real product once, on entry.
  useEffect(() => {
    const stage = welcomeStage();
    if (!stage) return;
    const map = stage.getMap();
    const timers: number[] = [];

    switch (seq.step.id) {
      case "welcome": {
        // a slow push-in while the city says hello
        stage.setView("public");
        map?.easeTo({ zoom: Math.min(map.getZoom() + 0.35, 12), duration: 8000 });
        break;
      }
      case "public": {
        stage.setView("public");
        map?.easeTo({
          center: [CAMERA.initial.longitude + 0.012, CAMERA.initial.latitude + 0.008],
          zoom: 11.05,
          duration: 2800,
        });
        // mid-caption, three feelings arrive — the "right now" made visible
        demoMoments().forEach((m, i) =>
          timers.push(window.setTimeout(() => momentsStore.add(m), 900 + i * 850)),
        );
        break;
      }
      case "private": {
        // the public field is faded in this view — sweep the demo blooms
        // now, invisibly (removal must never pop on screen)
        momentsStore.clearTest();
        // a brand-new journal can't teach time; borrow the glimpse set.
        // (an existing journal shows itself — the truth is always better)
        if (momentsStore.ownPoints.length < 3) setJournalPreview(true);
        stage.setView("private");
        map?.easeTo({ zoom: 10.55, duration: 2400 });
        break;
      }
      case "orb": {
        stage.setView("public");
        // the glimpse sweeps off only after the crossfade has hidden it
        timers.push(window.setTimeout(() => setJournalPreview(false), 700));
        stage.setOrbHidden(true);
        break;
      }
      case "yours": {
        stage.setOrbHidden(false);
        // come home: the fix-less first feeling lands where you're looking
        map?.easeTo({
          center: [CAMERA.initial.longitude, CAMERA.initial.latitude],
          zoom: CAMERA.initial.zoom,
          duration: 1600,
        });
        break;
      }
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [seq.step.id]);

  // THE RESTORATION — graceful or not (skip mid-step, sign-out unmount),
  // everything borrowed goes back: preview off, demo blooms swept, orb
  // returned, view public, any scripted camera move halted. All idempotent.
  useEffect(
    () => () => {
      const stage = welcomeStage();
      setJournalPreview(false);
      momentsStore.clearTest();
      stage?.setOrbHidden(false);
      stage?.setView("public");
      stage?.getMap()?.stop();
    },
    [],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.7, ease: "easeOut" } }}
      exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
      style={{ position: "fixed", inset: 0, zIndex: 30, pointerEvents: "none" }}
    >
      {/* the focus veil — one ink div, opacity only (the hold-scrim recipe) */}
      <motion.div
        aria-hidden
        animate={{ opacity: SCRIM[seq.step.id] }}
        transition={{ duration: 0.7, ease: "easeInOut" }}
        style={{
          position: "absolute",
          inset: 0,
          background: "#06070A",
          opacity: 0,
          pointerEvents: "none",
        }}
      />

      {/* the axes, ghosted over the living field — drawn, then let go */}
      <AnimatePresence>
        {seq.step.id === "public" && (
          <motion.div
            key="ghost-axes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.5 } }}
            transition={SPRING.settle}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "13%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <AxesFigure axes={2} ghost />
          </motion.div>
        )}
      </AnimatePresence>

      {/* the ghost hand, playing the orb exactly where the real one lives */}
      <AnimatePresence>
        {seq.step.id === "orb" && (
          <motion.div
            key="ghost-orb"
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
        version="film"
        onAdvance={seq.advance}
        onSkip={seq.skip}
        linesOverride={seq.step.id === "orb" ? [GHOST_CAPTIONS[ghostPhase]] : undefined}
        footDim={seq.step.id === "orb" && ghostPhase === "burst"}
      />
    </motion.div>
  );
}
