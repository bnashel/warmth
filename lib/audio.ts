/**
 * Web Audio helpers for Warmth's ambient soundscape.
 * Placeholder until the sound layer lands. Audio must be unlocked by a user
 * gesture, so `primeAudio()` is called from the first interaction.
 */

let ctx: AudioContext | null = null;

/** Create/resume the shared AudioContext on a user gesture. */
export function primeAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    ctx = Ctor ? new Ctor() : null;
  }
  if (ctx?.state === "suspended") void ctx.resume();
  return ctx;
}
