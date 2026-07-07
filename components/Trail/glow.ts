/**
 * components/Trail/glow.ts — the glow render path: live moments → light layers.
 *
 * Data comes from lib/momentsStore (stable array identity; weights mutate in
 * place). `version` keys deck.gl's updateTriggers so weight changes actually
 * reach the GPU — without it, in-place mutation is invisible.
 */
import { ScatterplotLayer, TextLayer } from "deck.gl";
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
/* ---- constellations: the journal at world scale --------------------- */

type SparkCluster = {
  position: [number, number];
  hue: [number, number, number];
  weight: number;
  count: number;
};

/** Grid-cluster sparks into constellations (~cellPx cells at this zoom).
 *  Position is the weight-averaged center; hue is the dominant emotion's. */
function clusterSparks(data: LivePoint[], zoom: number): SparkCluster[] {
  const degPerPx = 360 / (512 * Math.pow(2, zoom));
  const cell = TRAIL.spark.cluster.cellPx * degPerPx;
  const cells = new Map<
    string,
    { lng: number; lat: number; w: number; count: number; byEmotion: Map<string, { w: number; hue: [number, number, number] }> }
  >();
  for (const p of data) {
    const key = `${Math.round(p.position[0] / cell)}:${Math.round(p.position[1] / cell)}`;
    let c = cells.get(key);
    if (!c) {
      c = { lng: 0, lat: 0, w: 0, count: 0, byEmotion: new Map() };
      cells.set(key, c);
    }
    const w = Math.max(0.05, p.weight);
    c.lng += p.position[0] * w;
    c.lat += p.position[1] * w;
    c.w += w;
    c.count++;
    const e = c.byEmotion.get(p.emotion) ?? { w: 0, hue: p.hue };
    e.w += w;
    c.byEmotion.set(p.emotion, e);
  }
  const out: SparkCluster[] = [];
  for (const c of cells.values()) {
    let hue: [number, number, number] = [233, 236, 244];
    let top = -1;
    for (const e of c.byEmotion.values()) {
      if (e.w > top) {
        top = e.w;
        hue = e.hue;
      }
    }
    out.push({
      position: [c.lng / c.w, c.lat / c.w],
      hue,
      weight: Math.min(1, c.w / c.count + 0.15), // pooled presence, capped
      count: c.count,
    });
  }
  return out;
}

const getClusterRadius = (d: SparkCluster) =>
  Math.min(
    TRAIL.spark.cluster.maxRadiusPx,
    TRAIL.spark.cluster.baseRadiusPx + TRAIL.spark.cluster.radiusPerLog2 * Math.log2(d.count),
  );

/* Per-frame identity caches: the trail rebuilds layers every push while
 * visible (the breath rides a time uniform), but deck re-uploads attributes
 * whenever DATA identity changes — so clusters and ring subsets are cached
 * on (version, quantized zoom) and reused across frames (code review). */
let clusterCache: { key: string; clusters: SparkCluster[] } | null = null;
let ringCache: { version: number; data: LivePoint[]; remembered: LivePoint[] } | null = null;

function cachedClusters(data: LivePoint[], version: number, zoom: number): SparkCluster[] {
  const key = `${version}:${Math.round(zoom * 4) / 4}`;
  if (!clusterCache || clusterCache.key !== key) {
    clusterCache = { key, clusters: clusterSparks(data, zoom) };
  }
  return clusterCache.clusters;
}

function cachedRemembered(data: LivePoint[], version: number): LivePoint[] {
  if (!ringCache || ringCache.version !== version || ringCache.data !== data) {
    ringCache = { version, data, remembered: data.filter((p) => p.hasMemory) };
  }
  return ringCache.remembered;
}

export function buildTrailLayers(
  data: LivePoint[],
  version: number,
  timeSec: number,
  zoom: number,
  fade: number,
  paper = 0,
  onTapEntry?: (id: string) => void,
  onTapCluster?: (lngLat: [number, number]) => void,
) {
  if (fade < 0.01 || data.length === 0) return [];

  // THE CONSTELLATION VIEW: zoomed out, the journal gathers. One breathing
  // point per cell, sized by how many moments it holds; tap to descend.
  if (zoom < TRAIL.spark.cluster.belowZoom && data.length > 1) {
    const clusters = cachedClusters(data, version, zoom);
    return [
      new EmotionGlowLayer({
        id: "journal-constellations",
        data: clusters,
        getPosition: (d: GlowDatum) => d.position,
        getRadius: getClusterRadius as unknown as (d: GlowDatum) => number,
        getFillColor,
        updateTriggers: { getRadius: version, getFillColor: version },
        radiusUnits: "pixels" as const,
        stroked: false,
        filled: true,
        antialiasing: false,
        pickable: true,
        onClick: (info: { object?: SparkCluster }) => {
          if (info.object && onTapCluster) onTapCluster(info.object.position);
          return true;
        },
        timeSec,
        radiusScale: 1,
        radiusMaxPixels: TRAIL.spark.cluster.maxRadiusPx,
        light: { ...TRAIL.spark.light, gain: TRAIL.gain * fade },
        parameters: ADDITIVE_LIGHT,
      }),
      new TextLayer<SparkCluster>({
        id: "journal-constellation-counts",
        data: clusters.filter((c) => c.count > 1),
        getPosition: (d) => d.position,
        getText: (d) => String(d.count),
        getSize: TRAIL.spark.countLabel.sizePx,
        getColor: [233, 236, 244, Math.round(TRAIL.spark.countLabel.alpha * fade)],
        getPixelOffset: [0, -18],
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 500,
        fontSettings: { sdf: true, smoothing: 0.32 },
        sizeUnits: "pixels" as const,
        characterSet: "auto",
        billboard: true,
        parameters: { depthWriteEnabled: false },
      }),
    ];
  }
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
          stainHeart: TRAIL.stain.heart,
        },
        parameters: PIGMENT_STAIN,
      }),
    );
  }
  if (night > 0.01) {
    // THE SPARKS: each moment a star — pinpoint filament core, fast-dying
    // skirt, the per-point breath reading as a slow twinkle. Tappable.
    layers.push(
      new EmotionGlowLayer({
        id: "journal-sparks",
        ...shared,
        pickable: true,
        onClick: (info: { object?: LivePoint }) => {
          if (info.object && onTapEntry) onTapEntry(info.object.id);
          return true;
        },
        light: { ...TRAIL.spark.light, gain: TRAIL.gain * fade * night },
        parameters: ADDITIVE_LIGHT,
      }),
    );
    // Named stars: a delicate ring around entries that carry a memory.
    const remembered = cachedRemembered(data, version);
    if (remembered.length > 0) {
      layers.push(
        new ScatterplotLayer<LivePoint>({
          id: "journal-memory-rings",
          data: remembered,
          getPosition: (d) => d.position,
          getRadius: (d) => getTrailRadius(d) * TRAIL.spark.ring.radiusFactor,
          getLineColor: (d) =>
            [d.hue[0], d.hue[1], d.hue[2], Math.round(TRAIL.spark.ring.alpha * fade)] as [
              number,
              number,
              number,
              number,
            ],
          updateTriggers: { getRadius: version, getLineColor: version },
          radiusUnits: "pixels" as const,
          radiusScale: shared.radiusScale,
          radiusMaxPixels: TRAIL.maxRadiusPx * TRAIL.spark.ring.radiusFactor,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels" as const,
          getLineWidth: TRAIL.spark.ring.widthPx,
          antialiasing: true,
          pickable: false,
          parameters: { depthWriteEnabled: false },
        }),
      );
    }
  }
  return layers;
}
