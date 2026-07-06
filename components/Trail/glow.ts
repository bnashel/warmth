/**
 * components/Trail/glow.ts — the glow render path: live moments → light layers.
 *
 * Data comes from lib/momentsStore (stable array identity; weights mutate in
 * place). `version` keys deck.gl's updateTriggers so weight changes actually
 * reach the GPU — without it, in-place mutation is invisible.
 */
import {
  ADDITIVE_LIGHT,
  PIGMENT_STAIN,
  STREET_LIGHT,
  EmotionGlowLayer,
  type GlowDatum,
} from "./GlowLayer";
import type { LivePoint } from "@/lib/momentsStore";
import { GLOW, TRAIL } from "@/components/Map/tune";

/** Radius growth as the camera approaches — light gets room to breathe. */
const zoomScale = (zoom: number) => Math.pow(GLOW.zoomGrowth, zoom - 12);

/* Stable accessor identities (deck diffs by reference). LivePoint is a
 * structural superset of GlowDatum — the layer only reads these fields. */
const getPosition = (d: GlowDatum) => d.position;
const getRadius = (d: GlowDatum) =>
  GLOW.baseRadiusPx + GLOW.radiusPerIntensityPx * Math.min(1, Math.max(0, d.weight));
// rgb = hue; alpha carries WEIGHT into the shader (see GlowLayer).
const getFillColor = (d: GlowDatum) =>
  [
    d.hue[0],
    d.hue[1],
    d.hue[2],
    Math.round(Math.min(1, Math.max(0, d.weight)) * 255),
  ] as [number, number, number, number];

/**
 * The emotion light. `streetlight` adds the Ink & Glow signature pass:
 * a wider, coreless copy multiplied by the base map, so street hairlines
 * near a feeling catch its color and fade with distance.
 */
export function buildGlowLayers(
  data: LivePoint[],
  version: number,
  timeSec: number,
  zoom: number,
  streetlight: boolean,
) {
  const shared = {
    data,
    getPosition,
    getRadius,
    getFillColor,
    updateTriggers: { getRadius: version, getFillColor: version },
    radiusUnits: "pixels" as const,
    stroked: false,
    filled: true,
    antialiasing: false,
    pickable: false,
  };
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
      radiusMaxPixels: GLOW.maxRadiusPx,
      parameters: ADDITIVE_LIGHT,
    }),
  );
  return layers;
}

/* Trail dot sizing: small, precise marks — the diary, not the weather. */
const getTrailRadius = (d: GlowDatum) =>
  TRAIL.baseRadiusPx + TRAIL.radiusPerIntensityPx * Math.min(1, Math.max(0, d.weight));

/**
 * THE TRAIL (private view): your own moments as exact marks on the city.
 * `fade` is the public↔private crossfade (0 = hidden, 1 = fully private);
 * `paper` is the solar day-weight (0 = ink night, 1 = light paper day).
 * At night the dots are additive light; on paper — where added light is
 * invisible — they hand off to watercolor pigment stains, the same trade
 * the field makes (its uMode 2). Both ride uniforms: switching is free.
 */
export function buildTrailLayers(
  data: LivePoint[],
  version: number,
  timeSec: number,
  zoom: number,
  fade: number,
  paper = 0,
) {
  if (fade < 0.01 || data.length === 0) return [];
  const shared = {
    data,
    getPosition,
    getRadius: getTrailRadius,
    getFillColor,
    updateTriggers: { getRadius: version, getFillColor: version },
    radiusUnits: "pixels" as const,
    stroked: false,
    filled: true,
    antialiasing: false,
    pickable: false,
    timeSec,
    radiusScale: Math.pow(TRAIL.zoomGrowth, zoom - 12),
    radiusMaxPixels: TRAIL.maxRadiusPx,
  };
  const night = 1 - paper;
  const layers = [];
  // Stains BEFORE glow (same pass order as the field): through twilight the
  // glow must add on top of the stained paper, never be darkened by it.
  if (paper > 0.01) {
    layers.push(
      new EmotionGlowLayer({
        id: "trail-stains",
        ...shared,
        // Pigment pools, light spills: the stain is a flat wash with a
        // defined edge and a pooled rim (see GlowLayer's pigment path) on
        // a smaller quad — a diary mark, not an out-of-focus glow.
        radiusScale: shared.radiusScale * TRAIL.stain.radiusScale,
        light: {
          ...TRAIL.light,
          gain: TRAIL.gain * TRAIL.stain.gainBoost * fade,
          pigment: paper,
          stainEdge: TRAIL.stain.edge,
          stainRing: TRAIL.stain.ring,
        },
        parameters: PIGMENT_STAIN,
      }),
    );
  }
  if (night > 0.01) {
    layers.push(
      new EmotionGlowLayer({
        id: "trail-dots",
        ...shared,
        light: { ...TRAIL.light, gain: TRAIL.gain * fade * night },
        parameters: ADDITIVE_LIGHT,
      }),
    );
  }
  return layers;
}
