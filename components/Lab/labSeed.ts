/**
 * components/Lab/labSeed.ts
 *
 * ⚠️ LAB-ONLY TEST DATA. ⚠️
 * A plausible spread of feelings across NYC so the /maplab workshop always
 * has light to judge against. Seeded into the moments store by MapLab and
 * swept by the product screen (`test: true`). Never rendered in production.
 */
import type { Moment } from "@/lib/momentsStore";
import type { Emotion } from "@/lib/theme";

/* Hand-placed clusters — real neighborhoods, all five hues, varied intensity. */
const PTS: [number, number, Emotion, number][] = [
  // Brooklyn
  [-73.941, 40.686, "joy", 0.9], [-73.936, 40.683, "joy", 0.6], [-73.947, 40.69, "joy", 0.5],
  [-73.957, 40.714, "energy", 1.0], [-73.962, 40.717, "energy", 0.7], [-73.952, 40.71, "energy", 0.5],
  [-73.917, 40.695, "energy", 0.8], [-73.911, 40.699, "energy", 0.5],
  [-73.989, 40.703, "gratitude", 0.9], [-73.986, 40.7, "gratitude", 0.5], // DUMBO (was awe)
  [-73.978, 40.671, "calm", 0.8], [-73.982, 40.667, "calm", 0.5],
  [-73.969, 40.66, "calm", 1.0], [-73.964, 40.655, "calm", 0.6],
  [-73.944, 40.668, "love", 0.8], [-73.938, 40.672, "love", 0.5],
  [-74.01, 40.675, "gratitude", 0.7],
  [-73.95, 40.73, "calm", 0.7], [-73.955, 40.727, "calm", 0.4],
  [-73.974, 40.686, "gratitude", 0.6], // (was awe)
  [-74.005, 40.645, "love", 0.7], [-74.0, 40.649, "love", 0.4],
  // Manhattan
  [-73.984, 40.727, "joy", 0.9], [-73.98, 40.73, "joy", 0.6],
  [-73.987, 40.715, "energy", 0.7],
  [-73.997, 40.716, "gratitude", 0.8], [-73.994, 40.713, "gratitude", 0.5],
  [-74.001, 40.723, "joy", 0.8], // (was awe)
  [-74.003, 40.735, "love", 0.9], [-74.006, 40.739, "love", 0.6],
  [-74.001, 40.746, "joy", 0.7],
  [-73.984, 40.754, "energy", 1.0], [-73.988, 40.758, "energy", 0.8], [-73.98, 40.75, "energy", 0.6],
  [-73.992, 40.763, "energy", 0.7],
  [-73.975, 40.787, "love", 0.8], [-73.97, 40.79, "love", 0.5],
  [-73.958, 40.774, "calm", 0.7], [-73.953, 40.778, "calm", 0.5],
  [-73.945, 40.81, "joy", 0.9], [-73.94, 40.814, "joy", 0.6], [-73.95, 40.806, "joy", 0.5],
  [-73.94, 40.84, "gratitude", 0.8], [-73.936, 40.845, "gratitude", 0.5],
  [-73.972, 40.6, "calm", 0.4],
  // Queens
  [-73.923, 40.771, "love", 0.8], [-73.918, 40.775, "love", 0.5],
  [-73.94, 40.745, "energy", 0.9], [-73.945, 40.748, "energy", 0.6], // LIC (was awe)
  [-73.883, 40.748, "love", 0.7],
  [-73.83, 40.76, "joy", 0.8], [-73.825, 40.764, "joy", 0.5],
  [-73.858, 40.7, "gratitude", 0.5],
  // Bronx
  [-73.92, 40.81, "energy", 0.8], [-73.915, 40.815, "energy", 0.5],
  [-73.905, 40.89, "calm", 0.7],
  [-73.88, 40.86, "joy", 0.5],
  // Staten Island
  [-74.09, 40.64, "gratitude", 0.7], [-74.085, 40.635, "gratitude", 0.4],
  [-74.15, 40.58, "calm", 0.5],
];

/** Seed moments: staggered ages so the recency fade is visible in the lab. */
export function labSeedMoments(): Moment[] {
  const now = Date.now();
  return PTS.map(([lng, lat, emotion, w], i) => ({
    id: `lab-seed-${i}`,
    emotion,
    intensity: 1 + w * 9, // old 0..1 test weights → the orb's 1..10
    lng,
    lat,
    createdAt: now - (i % 12) * 3600_000, // 0..11h old
    test: true,
  }));
}
