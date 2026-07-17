/**
 * components/Trail/lanternGlow.ts — THE KEEPSAKE LANTERN (private-mode
 * redesign, 2026-07-17, Eli's pick from the bake-off).
 *
 * A memory is a small, crisp point of warm light: a firefly, a tiny paper
 * lantern hung exactly where you felt something. Perfectly still — no
 * shape breath, only the faintest brightness sigh — with a soft halo
 * contained in the feeling's own hue. The orb's porcelain-lamp language
 * at map scale; deliberately NOT organic (the ember/garden read as
 * amoebas — Eli). Moments that carry words or a photo burn a touch
 * larger and wear a fine ring: something kept.
 *
 * The older renderers are untouched and reachable — Ben's ember lives in
 * glow.ts, Eli's thread + garden in galleryGlow.ts; looks pair with them
 * via config.journal, and `?trail=` forces any of them for judging.
 * Dials: tune.ts TRAIL.lantern.
 */
import { ScatterplotLayer, TextLayer } from "deck.gl";
import {
  ADDITIVE_LIGHT,
  MATTE_OVER,
  PIGMENT_STAIN,
  EmotionGlowLayer,
  type GlowDatum,
} from "./GlowLayer";
import type { LivePoint } from "@/lib/momentsStore";
import { LAMP, TRAIL } from "@/components/Map/tune";

const L = TRAIL.lantern;

/* Stable accessor identities (deck diffs by reference). */
const getPosition = (d: GlowDatum) => d.position;
const getFillColor = (d: GlowDatum) =>
  [
    d.hue[0],
    d.hue[1],
    d.hue[2],
    Math.round(Math.min(1, Math.max(0, d.weight)) * 255),
  ] as [number, number, number, number];

/** Small and precise; a remembered moment stands a touch larger. */
const getLanternRadius = (d: GlowDatum) => {
  const base = L.baseRadiusPx + L.radiusPerIntensityPx * Math.min(1, Math.max(0, d.weight));
  return (d as LivePoint).hasMemory ? base * L.memoryGrow : base;
};

/* ---- constellations: the journal at world scale --------------------- */

type LanternCluster = {
  position: [number, number];
  hue: [number, number, number];
  weight: number;
  count: number;
};

/** Grid-cluster into gathered lanterns (same cells as the sibling
 *  renderers, so zooming across the threshold lands familiarly). */
function clusterLanterns(data: LivePoint[], zoom: number): LanternCluster[] {
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
  const out: LanternCluster[] = [];
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
      weight: Math.min(1, c.w / c.count + 0.15),
      count: c.count,
    });
  }
  return out;
}

const getClusterRadius = (d: LanternCluster) =>
  Math.min(
    TRAIL.spark.cluster.maxRadiusPx,
    TRAIL.spark.cluster.baseRadiusPx + TRAIL.spark.cluster.radiusPerLog2 * Math.log2(d.count),
  );

/* Per-frame identity caches — the trail rebuilds layers every push while
 * visible, but attribute uploads only happen when DATA identity changes,
 * so derived arrays are cached on version (same story as the siblings). */
let clusterCache: { key: string; data: LivePoint[]; clusters: LanternCluster[] } | null = null;
let ringCache: { version: number; data: LivePoint[]; remembered: LivePoint[] } | null = null;
let cueCache: {
  version: number;
  data: LivePoint[];
  first: LivePoint;
  last: LivePoint;
  began: string;
} | null = null;

function cachedClusters(data: LivePoint[], version: number, zoom: number): LanternCluster[] {
  const key = `${version}:${Math.round(zoom * 4) / 4}`;
  if (!clusterCache || clusterCache.key !== key || clusterCache.data !== data) {
    clusterCache = { key, data, clusters: clusterLanterns(data, zoom) };
  }
  return clusterCache.clusters;
}

function cachedRemembered(data: LivePoint[], version: number): LivePoint[] {
  if (!ringCache || ringCache.version !== version || ringCache.data !== data) {
    ringCache = { version, data, remembered: data.filter((p) => p.hasMemory) };
  }
  return ringCache.remembered;
}

/** The two lamp passes, shared by entries and constellations: a soft
 *  dim contained halo (additive, coreless) under a solid porcelain body
 *  blended OVER with its color capped at the hue — stacked nights at one
 *  place deepen toward pure hue and structurally cannot whiten (rule 3).
 *  Still: no radius breath, only the faintest brightness sigh. */
function lanternLight(gain: number) {
  return {
    halo: {
      corePeak: 0,
      coreWhiteness: 0,
      tailFalloff: L.halo.falloff,
      gain: L.halo.gain * gain,
      radiusAmp: 0,
      brightnessAmp: L.breath,
    },
    core: {
      matte: 1,
      wobble: 0, // a lantern is round and precise — never a blot
      stainEdge: L.core.edge,
      stainRing: L.core.rim,
      matteGlint: L.core.glint,
      gain: L.core.gain * gain,
      radiusAmp: 0,
      brightnessAmp: L.breath,
    },
  };
}

export function buildLanternTrailLayers(
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

  // THE GATHERED LANTERNS: zoomed out, nearby moments hang as one lamp
  // sized by how many it holds; tap to descend.
  if (zoom < TRAIL.spark.cluster.belowZoom && data.length > 1) {
    const clusters = cachedClusters(data, version, zoom);
    const clusterNight = 1 - paper;
    const light = lanternLight(fade);
    const shared = {
      data: clusters,
      getPosition: (d: GlowDatum) => d.position,
      getRadius: getClusterRadius as unknown as (d: GlowDatum) => number,
      getFillColor,
      updateTriggers: { getRadius: version, getFillColor: version },
      radiusUnits: "pixels" as const,
      stroked: false,
      filled: true,
      antialiasing: false,
      timeSec,
      radiusScale: 1,
    };
    return [
      // Halo only where added light is visible (the night worlds) — on
      // bone it was a wasted draw call (code review). Tighter than the
      // street-zoom halo: at world distance neighboring clusters must
      // stay separate lamps, never one soft mass (design review).
      ...(clusterNight > 0.01
        ? [
            new EmotionGlowLayer({
              id: "journal-lantern-cluster-halo",
              ...shared,
              pickable: false,
              radiusScale: L.halo.radiusFactor * 0.72,
              radiusMaxPixels: TRAIL.spark.cluster.maxRadiusPx * L.halo.radiusFactor * 0.72,
              light: { ...light.halo, gain: L.halo.gain * fade * 0.8 * clusterNight },
              parameters: ADDITIVE_LIGHT,
            }),
          ]
        : []),
      new EmotionGlowLayer({
        id: "journal-lantern-clusters",
        ...shared,
        pickable: true,
        onClick: (info: { object?: LanternCluster }) => {
          if (info.object && onTapCluster) onTapCluster(info.object.position);
          return true;
        },
        radiusMaxPixels: TRAIL.spark.cluster.maxRadiusPx,
        light: light.core,
        parameters: MATTE_OVER,
      }),
      new TextLayer<LanternCluster>({
        id: "journal-lantern-counts",
        data: clusters.filter((c) => c.count > 1),
        getPosition: (d) => d.position,
        getText: (d) => String(d.count),
        getSize: TRAIL.spark.countLabel.sizePx,
        // The count whispers in the cluster's own hue — no white lives
        // in the journal (Eli, 2026-07-08; the lantern keeps the law).
        getColor: (d: LanternCluster) =>
          [d.hue[0], d.hue[1], d.hue[2], Math.round(TRAIL.spark.countLabel.alpha * fade)] as [
            number,
            number,
            number,
            number,
          ],
        updateTriggers: { getColor: [version, Math.round(fade * 32)] },
        getPixelOffset: (d: LanternCluster) => [0, -(getClusterRadius(d) + 11)] as [number, number],
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
    getRadius: getLanternRadius,
    getFillColor,
    updateTriggers: { getRadius: version, getFillColor: version },
    radiusUnits: "pixels" as const,
    stroked: false,
    filled: true,
    antialiasing: false,
    pickable: false,
    timeSec,
    // THE ONE GLOW RECIPE's zoom curve — crisp at every distance.
    radiusScale: Math.pow(LAMP.zoomGrowth, zoom - 12),
    radiusMinPixels: L.minRadiusPx,
    radiusMaxPixels: L.maxRadiusPx,
  };
  const night = 1 - paper;
  const layers = [];

  // PAPER WORLD: added light is invisible on bone — the lantern soaks in
  // as a crisp round keepsake stain (deepest-mark-wins, never a bruise).
  if (paper > 0.01) {
    layers.push(
      new EmotionGlowLayer({
        id: "trail-stains",
        ...shared,
        pickable: true,
        onClick: (info: { object?: LivePoint }) => {
          if (info.object && onTapEntry) onTapEntry(info.object.id);
          return true;
        },
        radiusScale: shared.radiusScale * L.stain.radiusScale,
        light: {
          gain: TRAIL.gain * L.stain.gainBoost * fade,
          pigment: paper,
          stainEdge: L.stain.edge,
          stainRing: L.stain.ring,
          stainHeart: L.stain.heart,
          radiusAmp: 0,
          brightnessAmp: L.breath,
        },
        parameters: PIGMENT_STAIN,
      }),
    );
  }

  if (night > 0.01) {
    const light = lanternLight(fade * night);
    // The halo first — every lamp hangs above its own light.
    layers.push(
      new EmotionGlowLayer({
        id: "journal-lantern-halo",
        ...shared,
        radiusScale: shared.radiusScale * L.halo.radiusFactor,
        radiusMaxPixels: L.halo.maxRadiusPx,
        light: light.halo,
        parameters: ADDITIVE_LIGHT,
      }),
      new EmotionGlowLayer({
        id: "journal-lanterns",
        ...shared,
        pickable: true,
        onClick: (info: { object?: LivePoint }) => {
          if (info.object && onTapEntry) onTapEntry(info.object.id);
          return true;
        },
        light: light.core,
        parameters: MATTE_OVER,
      }),
    );

    // WHERE IT BEGAN → NOW: the journey stays legible at a cold glance.
    if (data.length > 1) {
      if (!cueCache || cueCache.version !== version || cueCache.data !== data) {
        let oldest = data[0];
        let newest = data[0];
        for (const p of data) {
          if (p.createdAt < oldest.createdAt) oldest = p;
          if (p.createdAt >= newest.createdAt) newest = p;
        }
        cueCache = {
          version,
          data,
          first: oldest,
          last: newest,
          // The year joins once the journal spans two of them — "began
          // July 14" is ambiguous across two Julys (code review).
          began: new Date(oldest.createdAt).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year:
              new Date(oldest.createdAt).getFullYear() === new Date().getFullYear()
                ? undefined
                : "numeric",
          }),
        };
      }
      const { first, last, began } = cueCache;
      layers.push(
        new TextLayer<LivePoint>({
          id: "journal-journey-cues",
          data: first === last ? [last] : [first, last],
          getPosition: (d) => d.position,
          getText: (d) => (d === first && first !== last ? `began ${began}` : "now"),
          getSize: 11,
          getColor: (d) => [d.hue[0], d.hue[1], d.hue[2], Math.round(190 * fade * night)],
          getPixelOffset: (d: LivePoint) => [0, -(getLanternRadius(d) + 13)] as [number, number],
          updateTriggers: {
            getText: version,
            getColor: [version, Math.round(fade * night * 32)],
            getPixelOffset: version,
          },
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 500,
          fontSettings: { sdf: true, smoothing: 0.32 },
          sizeUnits: "pixels" as const,
          characterSet: "auto",
          billboard: true,
          parameters: { depthWriteEnabled: false },
        }),
      );
    }

    // Something kept: a fine ring around moments that carry a memory.
    const remembered = cachedRemembered(data, version);
    if (remembered.length > 0) {
      layers.push(
        new ScatterplotLayer<LivePoint>({
          id: "journal-memory-rings",
          data: remembered,
          getPosition: (d) => d.position,
          getRadius: (d) => getLanternRadius(d) * L.ring.radiusFactor,
          // The ring follows its lantern's weight closely — a feeling
          // dimmed by the lens must not wear jewelry brighter than its
          // own body (design review).
          getLineColor: (d) =>
            [
              d.hue[0],
              d.hue[1],
              d.hue[2],
              Math.round(L.ring.alpha * fade * (0.15 + 0.85 * d.weight)),
            ] as [number, number, number, number],
          updateTriggers: { getRadius: version, getLineColor: version },
          radiusUnits: "pixels" as const,
          radiusScale: shared.radiusScale,
          radiusMaxPixels: L.maxRadiusPx * L.ring.radiusFactor,
          stroked: true,
          filled: false,
          lineWidthUnits: "pixels" as const,
          getLineWidth: L.ring.widthPx,
          antialiasing: true,
          pickable: false,
          parameters: { depthWriteEnabled: false },
        }),
      );
    }
  }
  return layers;
}
