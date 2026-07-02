/**
 * components/map/fakeGlow.ts
 *
 * ⚠️ TEST SCAFFOLDING — NOT PRODUCT CODE. ⚠️
 * A static, plausible spread of emotion points across NYC so the three style
 * candidates are judged the only way that's honest: WITH glow rendered.
 * The real realtime glow is Phase 3 work and replaces this wholesale.
 */
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { EMOTIONS, EMOTION_HUES, type Emotion } from "@/lib/theme";
import { GLOW_TEST } from "./tune";

type TestPoint = { p: [number, number]; e: Emotion; w: number };

/* Hand-placed clusters — real neighborhoods, all six hues, varied intensity. */
const PTS: [number, number, Emotion, number][] = [
  // Brooklyn
  [-73.941, 40.686, "joy", 0.9], [-73.936, 40.683, "joy", 0.6], [-73.947, 40.69, "joy", 0.5],
  [-73.957, 40.714, "energy", 1.0], [-73.962, 40.717, "energy", 0.7], [-73.952, 40.71, "energy", 0.5],
  [-73.917, 40.695, "energy", 0.8], [-73.911, 40.699, "energy", 0.5],
  [-73.989, 40.703, "awe", 0.9], [-73.986, 40.7, "awe", 0.5],
  [-73.978, 40.671, "calm", 0.8], [-73.982, 40.667, "calm", 0.5],
  [-73.969, 40.66, "calm", 1.0], [-73.964, 40.655, "calm", 0.6],
  [-73.944, 40.668, "love", 0.8], [-73.938, 40.672, "love", 0.5],
  [-74.01, 40.675, "reflective", 0.7],
  [-73.95, 40.73, "calm", 0.7], [-73.955, 40.727, "calm", 0.4],
  [-73.974, 40.686, "awe", 0.6],
  [-74.005, 40.645, "love", 0.7], [-74.0, 40.649, "love", 0.4],
  // Manhattan
  [-73.984, 40.727, "joy", 0.9], [-73.98, 40.73, "joy", 0.6],
  [-73.987, 40.715, "energy", 0.7],
  [-73.997, 40.716, "reflective", 0.8], [-73.994, 40.713, "reflective", 0.5],
  [-74.001, 40.723, "awe", 0.8],
  [-74.003, 40.735, "love", 0.9], [-74.006, 40.739, "love", 0.6],
  [-74.001, 40.746, "joy", 0.7],
  [-73.984, 40.754, "energy", 1.0], [-73.988, 40.758, "energy", 0.8], [-73.98, 40.75, "energy", 0.6],
  [-73.992, 40.763, "energy", 0.7],
  [-73.975, 40.787, "love", 0.8], [-73.97, 40.79, "love", 0.5],
  [-73.958, 40.774, "calm", 0.7], [-73.953, 40.778, "calm", 0.5],
  [-73.945, 40.81, "joy", 0.9], [-73.94, 40.814, "joy", 0.6], [-73.95, 40.806, "joy", 0.5],
  [-73.94, 40.84, "reflective", 0.8], [-73.936, 40.845, "reflective", 0.5],
  [-73.972, 40.6, "calm", 0.4],
  // Queens
  [-73.923, 40.771, "love", 0.8], [-73.918, 40.775, "love", 0.5],
  [-73.94, 40.745, "awe", 0.9], [-73.945, 40.748, "awe", 0.6],
  [-73.883, 40.748, "love", 0.7],
  [-73.83, 40.76, "joy", 0.8], [-73.825, 40.764, "joy", 0.5],
  [-73.858, 40.7, "reflective", 0.5],
  // Bronx
  [-73.92, 40.81, "energy", 0.8], [-73.915, 40.815, "energy", 0.5],
  [-73.905, 40.89, "calm", 0.7],
  [-73.88, 40.86, "joy", 0.5],
  // Staten Island
  [-74.09, 40.64, "reflective", 0.7], [-74.085, 40.635, "reflective", 0.4],
  [-74.15, 40.58, "calm", 0.5],
];

const POINTS: TestPoint[] = PTS.map(([lng, lat, e, w]) => ({ p: [lng, lat], e, w }));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Transparent → hue ramp so overlapping fields brighten like aurora. */
function rampFor(emotion: Emotion) {
  const [r, g, b] = hexToRgb(EMOTION_HUES[emotion]);
  return [0, 40, 90, 150, 210, 255].map(
    (a) => [r, g, b, a] as [number, number, number, number],
  );
}

/** One additive heatmap field per emotion — hue is identity, never mixed. */
export function buildFakeGlowLayers() {
  return EMOTIONS.map(
    (emotion) =>
      new HeatmapLayer<TestPoint>({
        id: `test-glow-${emotion}`,
        data: POINTS.filter((d) => d.e === emotion),
        getPosition: (d) => d.p,
        getWeight: (d) => d.w,
        radiusPixels: GLOW_TEST.radiusPx,
        intensity: GLOW_TEST.intensity,
        threshold: GLOW_TEST.threshold,
        colorRange: rampFor(emotion),
        opacity: GLOW_TEST.opacity,
        aggregation: "SUM",
      }),
  );
}
