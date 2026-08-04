/**
 * lib/dev.ts — "are the dev/judging tools unlocked?"
 *
 * True in local dev, and on JUDGING PREVIEWS deployed with
 * NEXT_PUBLIC_WARMTH_JUDGE=1 (the phone bake-off needs ?wall=off,
 * ?field=seed, and the world/look pills on an HTTPS build). Real
 * production deploys never set the flag.
 */
export function devUnlocked(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_WARMTH_JUDGE === "1";
}
