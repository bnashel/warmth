/**
 * The film's three demonstration feelings — "every light is someone" is
 * SHOWN, not claimed: mid-caption, these ignite live on the public field
 * with the real arrival choreography. All `test: true`: they enter the
 * field, never anyone's journal, and the walkthrough sweeps them on the
 * private step (while the field is faded out) or on unmount.
 *
 * Spots are borrowed from the judging journal's scatter — all visible in
 * the opening camera. Deterministic apart from createdAt (stamped at
 * injection so the 24h recency window treats them as newborn).
 */
import type { Moment } from "@/lib/momentsStore";
import type { Emotion } from "@/lib/theme";

const SPOTS: Array<{ lng: number; lat: number; emotion: Emotion; intensity: number }> = [
  { lng: -73.9442, lat: 40.7181, emotion: "joy", intensity: 7 }, // Williamsburg
  { lng: -73.9903, lat: 40.7336, emotion: "love", intensity: 6 }, // Union Square
  { lng: -73.9632, lat: 40.6791, emotion: "calm", intensity: 8 }, // Prospect Park
];

export function demoMoments(): Moment[] {
  const now = Date.now();
  return SPOTS.map((s, i) => ({
    id: `welcome-demo-${i}`,
    emotion: s.emotion,
    intensity: s.intensity,
    lng: s.lng,
    lat: s.lat,
    createdAt: now,
    test: true,
  }));
}
