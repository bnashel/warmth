/**
 * The replay bus: anywhere in the app (the AccountChip's quiet row) can ask
 * the welcome to play again. A module event keeps the two ends decoupled —
 * the chip doesn't import the gate, the gate doesn't import the chip.
 */
const subs = new Set<() => void>();

export function replayWelcome(): void {
  subs.forEach((cb) => cb());
}

export function onReplayWelcome(cb: () => void): () => void {
  subs.add(cb);
  return () => subs.delete(cb);
}
