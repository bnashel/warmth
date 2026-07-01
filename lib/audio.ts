/**
 * Web Audio helpers for Warmth's tactile feedback.
 * Audio must be unlocked by a user gesture, so `primeAudio()` is called from the
 * first interaction. Everything degrades to a no-op on the server / when Web
 * Audio is unavailable.
 */

let ctx: AudioContext | null = null;

/** Create/resume the shared AudioContext on a user gesture. */
export function primeAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  }
  if (ctx?.state === "suspended") void ctx.resume();
  return ctx;
}

/**
 * A soft, short (~8ms perceived) tick — played each time the intensity handle
 * crosses an integer. Pitch rises with the value so climbing feels like it's
 * going "up". Quiet by design.
 */
export function playTick(value = 5): void {
  const ac = primeAudio();
  if (!ac) return;
  const t = ac.currentTime;
  const norm = Math.min(1, Math.max(0, (value - 1) / 9));

  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = 540 + norm * 620; // ~540 → ~1160 Hz

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.055, t + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);

  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.06);
}

/**
 * A gentle rising swell — played on release, as the rating "lifts off" to join
 * the map. A soft root + fifth gliding upward. Brighter at higher intensity.
 */
export function playCommitSwell(intensity = 5): void {
  const ac = primeAudio();
  if (!ac) return;
  const t = ac.currentTime;
  const norm = Math.min(1, Math.max(0, (intensity - 1) / 9));
  const base = 300 + norm * 180; // 300 → 480 Hz

  const master = ac.createGain();
  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(0.07, t + 0.09);
  master.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  master.connect(ac.destination);

  [1, 1.5].forEach((mult, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(base * mult, t);
    osc.frequency.exponentialRampToValueAtTime(base * mult * 1.5, t + 0.42);
    g.gain.value = i === 0 ? 1 : 0.5;
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + 0.6);
  });
}
