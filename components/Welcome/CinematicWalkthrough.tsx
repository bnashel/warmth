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

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { momentsStore } from "@/lib/momentsStore";
import { CAMERA } from "@/components/Map/tune";
import { ORB } from "@/components/Orb/feel";
import { SPRING } from "@/lib/theme";
import { setJournalPreview } from "@/components/Trail/testJournal";
import { welcomeStage } from "@/components/Welcome/stage";
import { useWelcome, type WelcomeFinish } from "@/components/Welcome/useWelcome";
import { WelcomeChrome } from "@/components/Welcome/WelcomeChrome";
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
  const [ghostPhase, setGhostPhase] = useState<GhostPhase>("press");
  // THE EXHALE: a skip must never hard-cut borrowed scenery in plain view
  // (design-review blocker). On skip the veil deepens for a beat, the view
  // comes home and the sweep happens under near-dark, THEN the shell fades
  // out to the clean, restored city. A committed finish is already clean.
  const [leaving, setLeaving] = useState(false);
  const demoTimers = useRef<number[]>([]);
  const restore = () => {
    const stage = welcomeStage();
    demoTimers.current.forEach((t) => window.clearTimeout(t));
    demoTimers.current = [];
    setJournalPreview(false);
    momentsStore.clearTest();
    stage?.setOrbHidden(false);
    stage?.setHintsMuted(false);
    stage?.setView("public");
    stage?.getMap()?.stop();
  };
  const finishWithRestore = (how: WelcomeFinish) => {
    if (how === "committed") {
      // nothing borrowed remains by the handoff — dissolve on the burst beat
      onFinish(how);
      return;
    }
    setLeaving(true); // the veil deepens (see SCRIM below)
    window.setTimeout(restore, 380); // sweep under near-dark
    window.setTimeout(() => onFinish(how), 500); // then the exit fade, from dark
  };
  const seq = useWelcome(finishWithRestore);

  // two teachers must never talk over each other — quiet the product's
  // own hints (the empty-diary whisper) while the film narrates
  useEffect(() => {
    welcomeStage()?.setHintsMuted(true);
  }, []);

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
        // (ids also kept in demoTimers so a skip can silence pending ones)
        demoMoments().forEach((m, i) => {
          const t = window.setTimeout(() => momentsStore.add(m), 900 + i * 850);
          timers.push(t);
          demoTimers.current.push(t);
        });
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

  // THE SAFETY NET — an ungraceful unmount (sign-out) still restores
  // everything. Idempotent: on the graceful paths this is all no-ops.
  useEffect(
    () => () => {
      const stage = welcomeStage();
      demoTimers.current.forEach((t) => window.clearTimeout(t));
      setJournalPreview(false);
      momentsStore.clearTest();
      stage?.setOrbHidden(false);
      stage?.setHintsMuted(false);
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
      {/* the focus veil — one ink div, opacity only (the hold-scrim recipe).
          On skip it deepens first: the sweep happens under near-dark. The
          two view flips (private in, private out) get a veil PULSE — the
          product's crossfade is near-instant (tau 130ms), and a breath of
          ink over it turns a hard world-swap into a scene change. */}
      <motion.div
        aria-hidden
        animate={{
          opacity: leaving
            ? 0.88
            : seq.step.id === "private" || seq.step.id === "orb"
              ? [0.55, SCRIM[seq.step.id]]
              : SCRIM[seq.step.id],
        }}
        transition={
          leaving
            ? { duration: 0.3, ease: "easeIn" }
            : seq.step.id === "private" || seq.step.id === "orb"
              ? { duration: 1.5, times: [0.3, 1], ease: "easeInOut" }
              : { duration: 0.7, ease: "easeInOut" }
        }
        style={{
          position: "absolute",
          inset: 0,
          background: "#06070A",
          opacity: 0,
          pointerEvents: "none",
        }}
      />

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
