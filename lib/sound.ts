/**
 * lib/sound.ts — hand-rolled Web Audio for the orb lab. No dependencies.
 *
 * Sound substitutes for haptics on the web: felt more than heard. All
 * frequencies/gains/envelopes live in lib/feel.ts (SOUND). Every entry point
 * is guarded — this module never throws and never blocks a gesture.
 *
 * iOS: the AudioContext is a lazy singleton resumed on the first pointerdown
 * (call `unlockAudio()` from the gesture handler).
 */
import { SOUND, tickHzForStep } from "./feel";
import type { Emotion } from "./theme";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

/* ---------------------------------------------------------------- */
/* Mute (persisted)                                                  */
/* ---------------------------------------------------------------- */
const MUTE_KEY = "warmth-lab-muted";
let muted = false;
try {
  muted = typeof window !== "undefined" && window.localStorage.getItem(MUTE_KEY) === "1";
} catch {
  /* storage unavailable — stay unmuted */
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (master && ctx) {
    // Fast but click-free.
    master.gain.setTargetAtTime(next ? 0 : SOUND.masterGain, ctx.currentTime, 0.01);
  }
}

/* ---------------------------------------------------------------- */
/* Context lifecycle                                                 */
/* ---------------------------------------------------------------- */

/** Create/resume the context. Call on first pointerdown. Never throws. */
export function unlockAudio(): void {
  try {
    if (typeof window === "undefined") return;
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : SOUND.masterGain;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
    master = null;
  }
}

/** Ready to play right now? (Degrades everything to a silent no-op.) */
function ready(): boolean {
  return Boolean(ctx && master && ctx.state === "running");
}

function whiteNoise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/* ---------------------------------------------------------------- */
/* One-shots                                                         */
/* ---------------------------------------------------------------- */

/**
 * The step tick: short sine, C5 + 1 semitone per step. `soft` drops it −6dB
 * (Variant A dot-crossings, Variant B's felt-not-heard steps).
 */
export function tick(step: number, opts?: { soft?: boolean }): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tickHzForStep(step);
    const peak = SOUND.tick.gain * (opts?.soft ? 0.5 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + SOUND.tick.attackS);
    g.gain.exponentialRampToValueAtTime(0.0001, t + SOUND.tick.attackS + SOUND.tick.decayS);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + SOUND.tick.attackS + SOUND.tick.decayS + 0.02);
  } catch {
    /* silent degrade */
  }
}

/** Cancel: one soft tick N semitones below the last step's pitch. */
export function cancelTick(lastStep: number): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tickHzForStep(lastStep) * Math.pow(2, -SOUND.cancelSemitonesBelow / 12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(SOUND.tick.gain * 0.5, t + SOUND.tick.attackS);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.15);
  } catch {
    /* silent degrade */
  }
}

/**
 * Commit swell: per-emotion pentatonic root + fifth, swelling through an
 * opening lowpass, gentle noise whoosh underneath. `breathy` = Variant B
 * (slower, airier). Returns immediately; audio schedules itself.
 */
export function commitSwell(emotion: Emotion, opts?: { breathy?: boolean }): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t = ctx.currentTime;
    const durS = (opts?.breathy ? SOUND.swell.breathyMs : SOUND.swell.ms) / 1000;
    const root = SOUND.emotionRootHz[emotion];

    const bus = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(SOUND.swell.lowpassFromHz, t);
    lp.frequency.exponentialRampToValueAtTime(SOUND.swell.lowpassToHz, t + durS);
    bus.connect(lp).connect(master);

    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(SOUND.swell.gain, t + durS * 0.55);
    bus.gain.exponentialRampToValueAtTime(0.0001, t + durS * 1.6);

    // Root + fifth dyad.
    [1, 1.5].forEach((mult, i) => {
      const osc = ctx!.createOscillator();
      const g = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = root * mult;
      g.gain.value = i === 0 ? 1 : 0.5;
      osc.connect(g).connect(bus);
      osc.start(t);
      osc.stop(t + durS * 1.7);
    });

    // Noise whoosh underneath.
    const noise = ctx.createBufferSource();
    noise.buffer = whiteNoise(ctx);
    noise.loop = true;
    const ng = ctx.createGain();
    const whooshS =
      (SOUND.swell.whooshMs / 1000) * (opts?.breathy ? SOUND.swell.breathyNoiseBoost : 1);
    const noiseGain = 0.02 * (opts?.breathy ? SOUND.swell.breathyNoiseBoost : 1);
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(noiseGain, t + whooshS * 0.4);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + whooshS * 1.4);
    noise.connect(ng).connect(bus);
    noise.start(t);
    noise.stop(t + whooshS * 1.5);
  } catch {
    /* silent degrade */
  }
}

/** Variant C's commit adds this low, soft kick (pitch-dropping thump). */
export function kick(): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(SOUND.kick.fromHz, t);
    osc.frequency.exponentialRampToValueAtTime(SOUND.kick.toHz, t + SOUND.kick.ms / 1000);
    g.gain.setValueAtTime(SOUND.kick.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + SOUND.kick.ms / 1000);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + SOUND.kick.ms / 1000 + 0.02);
  } catch {
    /* silent degrade */
  }
}

/* ---------------------------------------------------------------- */
/* Charge / bloom hum (continuous, level-driven)                     */
/* ---------------------------------------------------------------- */
let humOsc: OscillatorNode | null = null;
let humOsc2: OscillatorNode | null = null;
let humGain: GainNode | null = null;

/** Start the hum silently (call at gesture start; level via setHumLevel). */
export function startHum(): void {
  try {
    if (!ready() || !ctx || !master || humOsc) return;
    humGain = ctx.createGain();
    humGain.gain.value = 0.0001;
    humGain.connect(master);

    humOsc = ctx.createOscillator();
    humOsc.type = "sine";
    humOsc.frequency.value = SOUND.hum.baseHz;
    humOsc.connect(humGain);

    const octave = ctx.createGain();
    octave.gain.value = 0.5;
    humOsc2 = ctx.createOscillator();
    humOsc2.type = "sine";
    humOsc2.frequency.value = SOUND.hum.baseHz * 2;
    humOsc2.connect(octave).connect(humGain);

    humOsc.start();
    humOsc2.start();
  } catch {
    humOsc = humOsc2 = null;
    humGain = null;
  }
}

/** Drive hum loudness with intensity, 0..1 of the ceiling. Click-free. */
export function setHumLevel(level01: number): void {
  try {
    if (!ctx || !humGain) return;
    const target = Math.max(0.0001, SOUND.hum.maxGain * Math.min(1, Math.max(0, level01)));
    humGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  } catch {
    /* ignore */
  }
}

/** Stop the hum within SOUND.hum.stopMs (release/cancel/visibility loss). */
export function stopHum(): void {
  try {
    if (!ctx || !humGain || !humOsc) return;
    const t = ctx.currentTime;
    const stopS = SOUND.hum.stopMs / 1000;
    humGain.gain.setTargetAtTime(0.0001, t, stopS / 3);
    humOsc.stop(t + stopS);
    humOsc2?.stop(t + stopS);
  } catch {
    /* ignore */
  } finally {
    humOsc = humOsc2 = null;
    humGain = null;
  }
}

/** Hard-stop everything that can sustain (tab hidden / pointercancel). */
export function panic(): void {
  stopHum();
}
