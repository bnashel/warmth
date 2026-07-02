/**
 * components/maplab/fakeGlow.ts
 *
 * ⚠️ TEST DATA — the points below are scaffolding for judging the map. ⚠️
 * The RENDERER (GlowLayer) is real: emotion drawn as additive light with a
 * hot core, long falloff, and a breathing pulse. Phase 3 swaps the static
 * points for realtime ones; the light itself is meant to ship.
 */
import { EMOTION_HUES, type Emotion } from "@/lib/theme";
import {
  ADDITIVE_LIGHT,
  STREET_LIGHT,
  EmotionGlowLayer,
  type GlowDatum,
} from "./GlowLayer";
import { GLOW } from "./tune";

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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const POINTS: GlowDatum[] = PTS.map(([lng, lat, e, w]) => ({
  position: [lng, lat],
  hue: hexToRgb(EMOTION_HUES[e]),
  intensity: w,
}));

/** Radius growth as the camera approaches — light gets room to breathe. */
const zoomScale = (zoom: number) => Math.pow(GLOW.zoomGrowth, zoom - 12);

const shared = {
  data: POINTS,
  getPosition: (d: GlowDatum) => d.position,
  getRadius: (d: GlowDatum) => GLOW.baseRadiusPx + GLOW.radiusPerIntensityPx * d.intensity,
  // rgb = hue; alpha carries INTENSITY into the shader (see GlowLayer).
  getFillColor: (d: GlowDatum) =>
    [d.hue[0], d.hue[1], d.hue[2], Math.round(d.intensity * 255)] as [
      number, number, number, number,
    ],
  radiusUnits: "pixels" as const,
  // Fill-rate guard: without a clamp, deep zoom grows quads past the whole
  // viewport and stacked additive passes melt DPR-3 phones.
  radiusMaxPixels: GLOW.maxRadiusPx,
  stroked: false,
  filled: true,
  antialiasing: false,
  pickable: false,
};

/**
 * The emotion light. `streetlight` adds the Ink & Glow experiment pass:
 * a wider, coreless copy multiplied by the base map, so street hairlines
 * near a feeling catch its color and fade with distance.
 */
export function buildGlowLayers(timeSec: number, zoom: number, streetlight: boolean) {
  const layers = [];
  if (streetlight && GLOW.streetlight.gain > 0) {
    layers.push(
      new EmotionGlowLayer({
        id: "glow-streetlight",
        ...shared,
        timeSec,
        radiusScale: zoomScale(zoom) * GLOW.streetlight.radiusFactor,
        radiusMaxPixels: GLOW.streetlight.maxRadiusPx,
        light: {
          corePeak: 0,
          coreWhiteness: 0,
          tailFalloff: GLOW.streetlight.tailFalloff,
          gain: GLOW.streetlight.gain,
        },
        parameters: STREET_LIGHT,
        // Under the boundary seams: the lit streets stay part of the map.
        beforeId: "nbhd-boundaries",
      }),
    );
  }
  layers.push(
    new EmotionGlowLayer({
      id: "glow-main",
      ...shared,
      timeSec,
      radiusScale: zoomScale(zoom),
      parameters: ADDITIVE_LIGHT,
    }),
  );
  return layers;
}
