/**
 * lib/sound.ts — hand-rolled Web Audio for the orb lab. No dependencies.
 *
 * Sound substitutes for haptics: felt more than heard. All frequencies/
 * gains/envelopes live in lib/feel.ts (SOUND). Every entry point is guarded —
 * this module never throws and never blocks a gesture.
 *
 * iPhone notes (from Ben's thumb test):
 * - The context is a lazy singleton resumed on first pointerdown.
 * - iOS mutes Web Audio when the ring/silent switch is on silent. We flip the
 *   page's audio session into "playback" mode by looping a silent <audio>
 *   element on unlock — the standard web-game workaround.
 * - Tick v2 is a mechanical DETENT (filtered click + tiny tonal body), not a
 *   sine beep; master gain raised — v1 was inaudible on phone speakers.
 */
import { SOUND, tickHzForStep } from "@/components/Orb/feel";
import { WEATHER } from "@/components/Map/tune";
import type { Emotion } from "./theme";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let silentUnlocker: HTMLAudioElement | null = null;

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
    master.gain.setTargetAtTime(next ? 0 : SOUND.masterGain, ctx.currentTime, 0.01);
  }
}

/* ---------------------------------------------------------------- */
/* Context lifecycle                                                 */
/* ---------------------------------------------------------------- */

/** ~50ms of silence as a WAV data URI — loops to hold iOS's audio session in
 *  "playback" mode so Web Audio stays audible with the silent switch on. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRuQLAABXQVZFZm10IBAAAAABAAEAgLsAAAB3AQACABAAZGF0YcALAAAA" +
  "AAAA".repeat(64);

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

    // iOS silent-switch bypass — best-effort, once.
    if (!silentUnlocker) {
      silentUnlocker = new Audio(SILENT_WAV);
      silentUnlocker.loop = true;
      silentUnlocker.setAttribute("playsinline", "");
      silentUnlocker.volume = 0.01;
      void silentUnlocker.play().catch(() => {
        silentUnlocker = null; // retry on the next gesture
      });
    }
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
 * Detent tick v2: a bandpassed noise click (the mechanical "knock") + a tiny
 * sine body whose pitch rises with the step. `soft` = −6dB (wheel crossings).
 */
export function tick(step: number, opts?: { soft?: boolean }): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t = ctx.currentTime;
    const vol = opts?.soft ? 0.5 : 1;

    // The knock — filtered noise transient.
    const click = ctx.createBufferSource();
    click.buffer = whiteNoise(ctx);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = SOUND.tick.clickBandHz;
    band.Q.value = 1.4;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(SOUND.tick.clickGain * vol, t);
    cg.gain.exponentialRampToValueAtTime(0.0001, t + SOUND.tick.clickDecayS);
    click.connect(band).connect(cg).connect(master);
    click.start(t);
    click.stop(t + SOUND.tick.clickDecayS + 0.01);

    // The body — short tonal thump, pitch ladder intact.
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tickHzForStep(step);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(SOUND.tick.gain * vol, t + SOUND.tick.attackS);
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
 * opening lowpass, gentle noise whoosh underneath.
 */
export function commitSwell(emotion: Emotion): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t = ctx.currentTime;
    const durS = SOUND.swell.ms / 1000;
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
    const whooshS = SOUND.swell.whooshMs / 1000;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.02, t + whooshS * 0.4);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + whooshS * 1.4);
    noise.connect(ng).connect(bus);
    noise.start(t);
    noise.stop(t + whooshS * 1.5);
  } catch {
    /* silent degrade */
  }
}

/* ---------------------------------------------------------------- */
/* Charge hum (continuous, level-driven)                             */
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

/* ---------------------------------------------------------------- */
/* Rain (continuous ambient, atmosphere-driven) — v3                 */
/* ---------------------------------------------------------------- */
let rainNodes: {
  srcA: AudioBufferSourceNode;
  srcB: AudioBufferSourceNode;
  gain: GainNode;
  lowpass: BiquadFilterNode;
  breath: OscillatorNode;
  breathDepth: GainNode;
  drifts: OscillatorNode[];
} | null = null;
let rainLevel = 0;
let rainStopTimer: number | null = null;
let dropletTimer: number | null = null;
let rainBedBuffer: AudioBuffer | null = null;

/** The LONG rain bed — v2's 0.5s loop repeated twice a second and read as
 *  a cycle (Ben heard it). Cached once; the tick/swell keep the short one. */
function rainBed(ac: AudioContext): AudioBuffer {
  if (rainBedBuffer) return rainBedBuffer;
  const buf = ac.createBuffer(1, ac.sampleRate * WEATHER.rainSound.bedSeconds, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  rainBedBuffer = buf;
  return buf;
}

/** One droplet: a tiny bandpassed tick, random pitch/decay/pan — rain on
 *  YOUR window. Poisson-ish scheduling; density rides the level. */
function scheduleDroplet(): void {
  const p = WEATHER.rainSound.droplet;
  const level = rainLevel;
  const gapMs =
    (p.maxMs - (p.maxMs - p.minMs) * level) * (0.6 + Math.random() * 0.8);
  dropletTimer = window.setTimeout(() => {
    dropletTimer = null;
    if (!rainNodes || rainLevel <= 0.02) return;
    try {
      if (ctx && master) {
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = whiteNoise(ctx);
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = p.bandHz[0] + Math.random() * (p.bandHz[1] - p.bandHz[0]);
        band.Q.value = 8;
        const g = ctx.createGain();
        const decay = p.decayS[0] + Math.random() * (p.decayS[1] - p.decayS[0]);
        g.gain.setValueAtTime(p.gain * rainLevel * (0.4 + Math.random() * 0.6), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        const pan = ctx.createStereoPanner();
        pan.pan.value = (Math.random() * 2 - 1) * 0.7;
        src.connect(band).connect(g).connect(pan).connect(master);
        src.start(t);
        src.stop(t + decay + 0.02);
      }
    } catch {
      /* one lost droplet */
    }
    scheduleDroplet();
  }, gapMs);
}

/**
 * Rain patter under everything, felt more than heard. Three layers, none
 * of which can read as a loop:
 *  - the bed: TWO copies of one long noise buffer, the second detuned, so
 *    their loop points drift apart forever (v2's audible cycle — fixed);
 *  - the gusts: the window-glass lowpass WANDERS on two incommensurate
 *    slow LFOs (v2 swelled the volume, which read as ocean waves — fixed);
 *  - the droplets: sparse randomized ticks, panned across the window.
 * Level rides the atmosphere's `wet`; teardown after the fade (review).
 */
export function setRainLevel(level01: number): void {
  try {
    if (!ready() || !ctx || !master) return;
    const level = Math.min(1, Math.max(0, level01));
    rainLevel = level;
    const R = WEATHER.rainSound;
    if (level <= 0.001) {
      if (rainNodes && rainStopTimer === null) {
        rainNodes.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.2);
        // Tear down once the fade has settled (~5τ) — silence costs nothing.
        rainStopTimer = window.setTimeout(() => {
          rainStopTimer = null;
          stopRain();
        }, 6_500);
      }
      return;
    }
    if (rainStopTimer !== null) {
      window.clearTimeout(rainStopTimer);
      rainStopTimer = null;
    }
    if (!rainNodes) {
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      // The window-glass band: soft highs, no rumble, no hiss.
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = R.filterBaseHz;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      const bed = rainBed(ctx);
      const srcA = ctx.createBufferSource();
      srcA.buffer = bed;
      srcA.loop = true;
      const srcB = ctx.createBufferSource();
      srcB.buffer = bed;
      srcB.loop = true;
      srcB.playbackRate.value = R.detune;
      const mixB = ctx.createGain();
      mixB.gain.value = 0.7;
      srcA.connect(hp);
      srcB.connect(mixB).connect(hp);
      hp.connect(lowpass).connect(gain).connect(master);
      srcA.start();
      srcB.start();
      // Gusts: the filter wanders; the volume only breathes, barely.
      const drifts = R.driftHz.map((hz, i) => {
        const lfo = ctx!.createOscillator();
        lfo.frequency.value = hz;
        const depth = ctx!.createGain();
        depth.gain.value = R.driftDepthHz[i];
        lfo.connect(depth).connect(lowpass.frequency);
        lfo.start(ctx!.currentTime + Math.random() * 5); // decorrelate phases
        return lfo;
      });
      const breath = ctx.createOscillator();
      breath.frequency.value = R.breathHz;
      const breathDepth = ctx.createGain();
      breathDepth.gain.value = 0;
      breath.connect(breathDepth).connect(gain.gain);
      breath.start();
      rainNodes = { srcA, srcB, gain, lowpass, breath, breathDepth, drifts };
      scheduleDroplet();
    }
    const t = ctx.currentTime;
    const base = R.maxGain * level;
    rainNodes.gain.gain.setTargetAtTime(base, t, 2); // rain fades in like rain
    rainNodes.breathDepth.gain.setTargetAtTime(base * R.breathDepth, t, 2);
    // Harder rain hisses brighter — the cutoff rides the level.
    rainNodes.lowpass.frequency.setTargetAtTime(R.filterBaseHz + R.filterWetHz * level, t, 2);
  } catch {
    /* silent degrade */
  }
}

/** Stop the rain now (tab hidden / fade settled). Restartable. */
function stopRain(): void {
  try {
    if (rainStopTimer !== null) {
      window.clearTimeout(rainStopTimer);
      rainStopTimer = null;
    }
    if (dropletTimer !== null) {
      window.clearTimeout(dropletTimer);
      dropletTimer = null;
    }
    if (!ctx || !rainNodes) return;
    const t = ctx.currentTime;
    rainNodes.gain.gain.setTargetAtTime(0.0001, t, 0.1);
    rainNodes.srcA.stop(t + 0.4);
    rainNodes.srcB.stop(t + 0.4);
    rainNodes.breath.stop(t + 0.4);
    for (const d of rainNodes.drifts) d.stop(t + 0.4);
  } catch {
    /* ignore */
  } finally {
    rainNodes = null;
    rainLevel = 0;
  }
}

/* ---------------------------------------------------------------- */
/* Thunder (storm one-shots, scheduled by the lightning)             */
/* ---------------------------------------------------------------- */

/**
 * Distant thunder: a low rolling rumble `delayS` after the flash (sound
 * trails light — the storm is streets away). Two overlapping brown-ish
 * bursts through a falling lowpass + a sub swell underneath. One-shot,
 * self-cleaning; respects mute via the master bus.
 */
export function thunderRumble(delayS = 0): void {
  try {
    if (!ready() || !ctx || !master) return;
    const t0 = ctx.currentTime + Math.max(0, delayS);
    const peak = WEATHER.lightning.thunderGain;

    const burst = (at: number, gainMul: number, decayS: number) => {
      const src = ctx!.createBufferSource();
      src.buffer = rainBed(ctx!);
      src.loop = true;
      src.playbackRate.value = 0.35 + Math.random() * 0.15; // darken the noise
      const lp = ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(160 + Math.random() * 60, at);
      lp.frequency.exponentialRampToValueAtTime(55, at + decayS);
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak * gainMul, at + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, at + decayS);
      src.connect(lp).connect(g).connect(master!);
      src.start(at);
      src.stop(at + decayS + 0.1);
    };
    // The crack's body, then its echo off the far buildings.
    const mainDecay = 2.6 + Math.random() * 1.8;
    burst(t0, 1, mainDecay);
    burst(t0 + 0.6 + Math.random() * 0.7, 0.45, mainDecay * 1.3);

    // The sub — felt in the chest more than heard.
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(48 + Math.random() * 10, t0);
    sub.frequency.exponentialRampToValueAtTime(32, t0 + mainDecay);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(peak * 0.8, t0 + 0.2);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + mainDecay);
    sub.connect(sg).connect(master);
    sub.start(t0);
    sub.stop(t0 + mainDecay + 0.1);
  } catch {
    /* silent degrade */
  }
}

/** Hard-stop everything that can sustain (tab hidden / pointercancel). */
export function panic(): void {
  stopHum();
  stopRain();
}
