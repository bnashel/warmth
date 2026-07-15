/**
 * THE STAGE CONTRACT — the one narrow doorway between the welcome and the
 * product. OneScreen registers what the walkthrough may touch (the view
 * switch, the map camera, the orb island's visibility) and announces the
 * one event the walkthrough waits for: the first real feeling. The welcome
 * never reaches into OneScreen any other way, and OneScreen never knows
 * which version is playing — or whether one is playing at all.
 */
import type { Map as MapboxMap } from "mapbox-gl";
import type { Emotion } from "@/lib/theme";

export type WelcomeStage = {
  /** Switch the product's public/private view (the real crossfade plays). */
  setView(v: "public" | "private"): void;
  /** The live map instance, for scripted camera moves. Null before ready. */
  getMap(): MapboxMap | null;
  /** Fade the real orb island out/in (the ghost performs in its place). */
  setOrbHidden(hidden: boolean): void;
};

export type WelcomeCommit = { emotion: Emotion; intensity: number };

let stage: WelcomeStage | null = null;
const commitSubs = new Set<(m: WelcomeCommit) => void>();

export function setWelcomeStage(s: WelcomeStage | null): void {
  stage = s;
}

export function welcomeStage(): WelcomeStage | null {
  return stage;
}

/** OneScreen calls this at the top of handleCommit — the burst has just
 *  begun, which is exactly the beat the welcome should start dissolving on.
 *  Subscribers are isolated: a bug in a welcome shell must never break the
 *  user's real feeling (the moment this whole feature exists to produce). */
export function notifyWelcomeCommit(m: WelcomeCommit): void {
  commitSubs.forEach((cb) => {
    try {
      cb(m);
    } catch {
      /* the welcome's problem, never the commit's */
    }
  });
}

export function onWelcomeCommit(cb: (m: WelcomeCommit) => void): () => void {
  commitSubs.add(cb);
  return () => commitSubs.delete(cb);
}
