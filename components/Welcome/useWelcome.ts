/**
 * THE SEQUENCER — the welcome's one state machine, shared by both shells.
 * Steps advance on taps; reaching the final (handoff) step marks the device
 * welcomed (a wanderer who leaves mid-handoff is never force-marched through
 * again); the first REAL feeling — announced by OneScreen through the stage
 * contract — completes the welcome. Skip is always one tap away.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { unlockAudio } from "@/lib/sound";
import { onWelcomeCommit } from "@/components/Welcome/stage";
import { WELCOME_STEPS, type WelcomeStep } from "@/components/Welcome/script";

const FLAG_KEY = "warmth-welcomed-v1";

/** Storage can be blocked (private mode, Safari ITP) — the welcome is never
 *  worth throwing over; a blocked flag just means it may play again. */
export function welcomed(): boolean {
  try {
    return window.localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setWelcomed(): void {
  try {
    window.localStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* storage blocked — it may greet this device once more */
  }
}

export function clearWelcomed(): void {
  try {
    window.localStorage.removeItem(FLAG_KEY);
  } catch {
    /* nothing to clear */
  }
}

export type WelcomeFinish = "skipped" | "committed";

export type WelcomeSequencer = {
  step: WelcomeStep;
  stepIndex: number;
  total: number;
  /** True on the final step: chrome recedes, the real orb takes over. */
  handoff: boolean;
  /** True once skip/commit ended the welcome — the shell is exit-fading and
   *  must already be deaf to taps (nothing behind it should be blocked). */
  finished: boolean;
  /** Tap to continue. Also unlocks audio — a real gesture each time, so the
   *  ghost demo's hum and ticks are audible when it arrives. */
  advance(): void;
  skip(): void;
};

export function useWelcome(onFinish: (how: WelcomeFinish) => void): WelcomeSequencer {
  const [stepIndex, setStepIndex] = useState(0);
  const step = WELCOME_STEPS[stepIndex];
  const handoff = !!step.handoff;

  // The parent's callback, held by ref: the commit subscription below must
  // never resubscribe (and never fire twice) because a render changed it.
  const finishRef = useRef(onFinish);
  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);
  const finishedRef = useRef(false);
  const [finished, setFinished] = useState(false);
  const finish = (how: WelcomeFinish) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setFinished(true);
    finishRef.current(how);
  };

  // Reaching the handoff marks the device welcomed — completion is a gift,
  // not a toll gate.
  useEffect(() => {
    if (handoff) setWelcomed();
  }, [handoff]);

  // The first real feeling (OneScreen → stage contract) ends the welcome.
  useEffect(() => {
    if (!handoff) return;
    return onWelcomeCommit(() => finish("committed"));
  }, [handoff]);

  const advance = () => {
    if (finishedRef.current) return;
    unlockAudio();
    setStepIndex((i) => Math.min(i + 1, WELCOME_STEPS.length - 1));
  };

  const skip = () => {
    setWelcomed();
    finish("skipped");
  };

  return { step, stepIndex, total: WELCOME_STEPS.length, handoff, finished, advance, skip };
}
