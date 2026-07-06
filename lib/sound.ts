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
/* Rain (continuous ambient, atmosphere-driven)                      */
/* ---------------------------------------------------------------- */
let rainSrc: AudioBufferSourceNode | null = null;
let rainGain: GainNode | null = null;
let rainLfo: OscillatorNode | null = null;
let rainDepth: GainNode | null = null;
let rainStopTimer: number | null = null;

/**
 * Rain patter under everything, felt more than heard: looped noise through
 * a band shaped like rain on a window, a slow LFO swelling it so it never
 * reads as a flat hiss. Level rides the atmosphere's `wet`; audio starts
 * only after the usual gesture unlock, and panic() silences it.
 *
 * The LFO depth SCALES with the level (depth < base always, so the swell
 * never drives the gain through zero) and when the rain ends the whole
 * node graph is torn down after the fade — no eternal ghost swell
 * (review findings).
 */
export function setRainLevel(level01: number): void {
  try {
    if (!ready() || !ctx || !master) return;
    const level = Math.min(1, Math.max(0, level01));
    if (level <= 0.001) {
      if (rainGain && rainStopTimer === null) {
        rainGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.2);
        rainDepth?.gain.setTargetAtTime(0, ctx.currentTime, 1.2);
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
    if (!rainSrc) {
      rainGain = ctx.createGain();
      rainGain.gain.value = 0.0001;
      // The window-glass band: soft highs, no rumble, no hiss.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2400;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 400;
      rainSrc = ctx.createBufferSource();
      rainSrc.buffer = whiteNoise(ctx);
      rainSrc.loop = true;
      rainSrc.connect(hp).connect(lp).connect(rainGain).connect(master);
      rainSrc.start();
      // The swell: a slow wobble on the gain — weather, not static.
      rainLfo = ctx.createOscillator();
      rainLfo.frequency.value = WEATHER.rainSound.lfoHz;
      rainDepth = ctx.createGain();
      rainDepth.gain.value = 0;
      rainLfo.connect(rainDepth).connect(rainGain.gain);
      rainLfo.start();
    }
    const t = ctx.currentTime;
    const base = WEATHER.rainSound.maxGain * level;
    rainGain!.gain.setTargetAtTime(base, t, 2); // rain fades in like rain
    rainDepth!.gain.setTargetAtTime(base * WEATHER.rainSound.lfoDepth, t, 2);
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
    if (!ctx || !rainSrc) return;
    const t = ctx.currentTime;
    rainGain?.gain.setTargetAtTime(0.0001, t, 0.1);
    rainSrc.stop(t + 0.4);
    rainLfo?.stop(t + 0.4);
  } catch {
    /* ignore */
  } finally {
    rainSrc = null;
    rainGain = null;
    rainLfo = null;
    rainDepth = null;
  }
}

/** Hard-stop everything that can sustain (tab hidden / pointercancel). */
export function panic(): void {
  stopHum();
  stopRain();
}
