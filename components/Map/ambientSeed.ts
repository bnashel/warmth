/**
 * components/Map/ambientSeed.ts
 *
 * ⚠️ AMBIENT SEED DATA — a placeholder city, clearly labeled. ⚠️
 * Ben's call: the public map should open onto a city that already feels —
 * "a thin layer of water over the entire city, different colors at different
 * intensities" — never a black void waiting for the first commit. Until
 * Supabase realtime lands (Phase 3b), this module IS that existing feeling.
 * Every moment it makes carries `seed: true`; the day real data flows, the
 * one call site in OneScreen gets deleted and the water becomes real.
 *
 * Deterministic on purpose (seeded RNG, no Math.random): the city's mood is
 * the same on every load — a place, not a slot machine.
 *
 * Two layers of feeling:
 *   pockets — hand-placed neighborhood moods (Williamsburg runs energetic,
 *             Park Slope calm…): the bright places where the water deepens.
 *   wash    — a jittered ~1.5km lattice across each borough's landmass,
 *             low intensity, colored by the nearest pocket so emotions form
 *             coherent weather regions instead of confetti.
 */
import type { Moment } from "@/lib/momentsStore";
import type { Emotion } from "@/lib/theme";

/* Deterministic RNG — same city every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Neighborhood moods: [lng, lat, emotion, strength 1..10]. Plausible NYC
 *  character, hand-authored — the same taste as labSeed, densified. */
const POCKETS: [number, number, Emotion, number][] = [
  // Brooklyn
  [-73.958, 40.714, "energy", 8.5], // Williamsburg
  [-73.95, 40.729, "calm", 6], // Greenpoint
  [-73.941, 40.686, "joy", 7.5], // Bed-Stuy
  [-73.99, 40.703, "awe", 8], // DUMBO
  [-73.977, 40.669, "calm", 7], // Park Slope
  [-73.969, 40.661, "calm", 8], // Prospect Park
  [-73.944, 40.668, "love", 6.5], // Crown Heights
  [-74.005, 40.645, "love", 5.5], // Sunset Park
  [-73.985, 40.578, "joy", 6.5], // Coney Island
  [-73.917, 40.695, "energy", 6], // Bushwick
  [-73.902, 40.635, "reflective", 4.5], // Canarsie-ish
  // Manhattan
  [-73.984, 40.727, "joy", 8], // East Village
  [-73.997, 40.716, "reflective", 6], // Chinatown
  [-74.012, 40.705, "awe", 7], // FiDi
  [-74.003, 40.735, "love", 8.5], // West Village
  [-73.985, 40.755, "energy", 9], // Times Square
  [-73.978, 40.765, "awe", 6.5], // Columbus Circle
  [-73.966, 40.782, "calm", 7.5], // Central Park
  [-73.978, 40.788, "love", 6], // UWS
  [-73.955, 40.777, "calm", 5.5], // UES
  [-73.945, 40.809, "joy", 8], // Harlem
  [-73.938, 40.845, "reflective", 6], // Washington Heights
  [-73.99, 40.744, "energy", 6.5], // Flatiron
  // Queens
  [-73.923, 40.771, "love", 6.5], // Astoria
  [-73.94, 40.745, "awe", 7], // Long Island City
  [-73.883, 40.748, "love", 5.5], // Jackson Heights
  [-73.83, 40.759, "joy", 6.5], // Flushing
  [-73.858, 40.7, "reflective", 5], // Forest Hills
  [-73.795, 40.707, "joy", 5], // Jamaica
  // The Bronx
  [-73.92, 40.827, "energy", 6.5], // South Bronx
  [-73.877, 40.86, "calm", 5.5], // Bronx Park
  [-73.905, 40.881, "reflective", 4.5], // Riverdale-ish
  // Staten Island
  [-74.077, 40.641, "reflective", 5.5], // St. George
  [-74.15, 40.58, "calm", 5], // mid-island
  [-74.19, 40.54, "calm", 4.5], // south shore
];

/** Borough landmasses as (optionally rotated) ellipses — coarse on purpose;
 *  the field's soft kernels forgive a little shoreline spill. */
const LAND: { cx: number; cy: number; rx: number; ry: number; rotDeg: number }[] = [
  { cx: -73.967, cy: 40.788, rx: 0.016, ry: 0.088, rotDeg: -17 }, // Manhattan (tilted)
  { cx: -73.944, cy: 40.655, rx: 0.066, ry: 0.056, rotDeg: 0 }, // Brooklyn
  { cx: -73.85, cy: 40.72, rx: 0.095, ry: 0.052, rotDeg: 0 }, // Queens
  { cx: -73.885, cy: 40.852, rx: 0.052, ry: 0.042, rotDeg: 0 }, // The Bronx
  { cx: -74.145, cy: 40.578, rx: 0.075, ry: 0.052, rotDeg: 35 }, // Staten Island
];

/** Wash lattice spacing (deg): ~1.5km — kernels overlap into one sheet. */
const SPACING_LNG = 0.018;
const SPACING_LAT = 0.0145;

function insideLand(lng: number, lat: number): boolean {
  for (const e of LAND) {
    const rad = (e.rotDeg * Math.PI) / 180;
    const dx = lng - e.cx;
    const dy = lat - e.cy;
    const u = dx * Math.cos(rad) - dy * Math.sin(rad);
    const v = dx * Math.sin(rad) + dy * Math.cos(rad);
    if ((u * u) / (e.rx * e.rx) + (v * v) / (e.ry * e.ry) <= 1) return true;
  }
  return false;
}

/** Nearest pocket's emotion (lat-corrected distance), blended with the
 *  runner-up by CLOSENESS: deep inside a region the winner owns it; near a
 *  border up to ~half the points flip — dappled weather fronts, never the
 *  hard Voronoi seams of a district map (design-review finding). */
function washEmotion(lng: number, lat: number, roll: number): Emotion {
  const kLng = Math.cos((lat * Math.PI) / 180);
  let best = 0;
  let second = 0;
  let bestD = Infinity;
  let secondD = Infinity;
  for (let i = 0; i < POCKETS.length; i++) {
    const dLng = (lng - POCKETS[i][0]) * kLng;
    const dLat = lat - POCKETS[i][1];
    const d = dLng * dLng + dLat * dLat;
    if (d < bestD) {
      second = best;
      secondD = bestD;
      best = i;
      bestD = d;
    } else if (d < secondD) {
      second = i;
      secondD = d;
    }
  }
  // bestD/secondD → 1 at an exact border, → 0 deep inside a region.
  const closeness = secondD > 0 ? bestD / secondD : 0;
  return POCKETS[roll < closeness * 0.5 ? second : best][2];
}

/**
 * The standing city: ~90 pocket moments + ~200 wash moments, ages staggered
 * across the last 12h so the recency fade gives the water natural depth.
 */
export function ambientSeedMoments(): Moment[] {
  const rng = mulberry32(0x5eed);
  const now = Date.now();
  const moments: Moment[] = [];
  let i = 0;
  const push = (lng: number, lat: number, emotion: Emotion, intensity: number) => {
    moments.push({
      id: `ambient-${i++}`,
      emotion,
      intensity: Math.min(10, Math.max(1, intensity)),
      lng,
      lat,
      createdAt: now - rng() * 12 * 3600_000,
      seed: true,
    });
  };

  // Pockets: 2–3 moments each, scattered ~600m, strength wobbling ±1.5.
  for (const [lng, lat, emotion, strength] of POCKETS) {
    const n = 2 + Math.round(rng());
    for (let k = 0; k < n; k++) {
      push(
        lng + (rng() - 0.5) * 0.012,
        lat + (rng() - 0.5) * 0.01,
        emotion,
        strength + (rng() - 0.5) * 3,
      );
    }
  }

  // Wash: the thin water itself. Jittered lattice over each landmass,
  // low intensity, 85% keep-rate so the sheet stays organic.
  for (let lng = -74.24; lng <= -73.72; lng += SPACING_LNG) {
    for (let lat = 40.5; lat <= 40.92; lat += SPACING_LAT) {
      if (!insideLand(lng, lat)) continue;
      if (rng() > 0.85) continue;
      push(
        lng + (rng() - 0.5) * 0.008,
        lat + (rng() - 0.5) * 0.006,
        washEmotion(lng, lat, rng()),
        1 + rng() * 2,
      );
    }
  }

  return moments;
}
