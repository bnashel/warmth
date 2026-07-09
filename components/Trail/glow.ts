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
  SCREEN_LIGHT,
  MATTE_OVER,
  PIGMENT_STAIN,
  STREET_LIGHT,
  EmotionGlowLayer,
  type GlowDatum,
} from "./GlowLayer";
import { AuroraLayer, type AuroraDatum } from "./AuroraLayer";
import { journalTestMode, journalTestPoints, JOURNAL_TEST_VERSION } from "./testJournal";
import type { LivePoint } from "@/lib/momentsStore";
import { GLOW, LAMP, TRAIL } from "@/components/Map/tune";

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

/* ---- THE AURORA (Eli's redesign, 2026-07-08): the journey between ---- */

/** Catmull-Rom through the entries in time order with a gentle meander,
 *  chopped into short 2-point paths whose colors lerp between the
 *  entries' hues. Older spans dim toward the past (the journey has a
 *  direction); every span carries the time gap it bridges (tap = reveal).
 *  Shading (feather/flow/rays) lives in AuroraLayer. Cached by version. */
function auroraSegments(data: LivePoint[]): AuroraDatum[] {
  const pts = [...data].sort((a, b) => a.createdAt - b.createdAt);
  if (pts.length < 2) return [];
  const A = TRAIL.aurora;
  const n = A.subdiv;
  const segs: AuroraDatum[] = [];
  const P = (i: number) => pts[Math.min(pts.length - 1, Math.max(0, i))].position;
  const spans = pts.length - 1;
  for (let i = 0; i < spans; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    // Adaptive tautness: short hops curve like handwriting; a long jump
    // across the city runs nearly straight (full Catmull-Rom overshoots
    // into wide loops over the river on distant consecutive entries).
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const t = A.tautness * Math.min(1, 0.012 / Math.max(len, 1e-6));
    // The meander: a soft perpendicular sway, unique per span — the
    // curtain wanders like weather, never a surveyor's line.
    const perp: [number, number] = len > 1e-9 ? [-(p2[1] - p1[1]) / len, (p2[0] - p1[0]) / len] : [0, 0];
    const phase = i * 2.399; // golden-angle-ish: no two spans sway alike
    // The past dims: the newest span glows fullest.
    const age = spans === 1 ? 1 : i / (spans - 1);
    const dim = A.oldDim + (1 - A.oldDim) * age;
    const gapMs = pts[i + 1].createdAt - pts[i].createdAt;
    let prev: [number, number] = [p1[0], p1[1]];
    for (let k = 1; k <= n; k++) {
      const s = k / n;
      const s2 = s * s;
      const s3 = s2 * s;
      const cr = (a: number, b: number, c: number, d: number) =>
        b + t * ((-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3) * 0.5 +
        (1 - t) * ((c - b) * s);
      const sway = Math.sin(s * Math.PI * 1.7 + phase) * Math.sin(s * Math.PI) * len * A.meander;
      const pt: [number, number] = [
        cr(p0[0], p1[0], p2[0], p3[0]) + perp[0] * sway,
        cr(p0[1], p1[1], p2[1], p3[1]) + perp[1] * sway,
      ];
      const mix = (a: number, b: number) => Math.round(a + (b - a) * s);
      segs.push({
        path: [prev, pt],
        color: [
          mix(pts[i].hue[0], pts[i + 1].hue[0]),
          mix(pts[i].hue[1], pts[i + 1].hue[1]),
          mix(pts[i].hue[2], pts[i + 1].hue[2]),
          Math.round(255 * A.alpha * dim),
        ],
        gapMs,
      });
      prev = pt;
    }
  }
  return segs;
}

let auroraCache: { version: number; segs: AuroraDatum[] } | null = null;

function cachedAurora(data: LivePoint[], version: number): AuroraDatum[] {
  if (!auroraCache || auroraCache.version !== version) {
    auroraCache = { version, segs: auroraSegments(data) };
  }
  return auroraCache.segs;
}

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

/** Which private renderer draws the memory marks. Default = THE EMBER
 *  (round 2, item 3); `?trail=splat` shows the old matte-gem for the
 *  side-by-side judging (loser gets deleted once Ben + Eli decide). */
function trailRenderer(): "ember" | "splat" {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("trail");
    if (p === "splat" || p === "ember") return p;
  }
  return TRAIL.renderer;
}

/** The ember's forever-shape seed: a hash of the entry ID — stable across
 *  sessions and zooms, unique even for two moments at the same cafe. */
const getSeed = (d: GlowDatum) => {
  const id = d.id ?? "";
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 100003) / 100003;
};

export function buildTrailLayers(
  data: LivePoint[],
  version: number,
  timeSec: number,
  zoom: number,
  fade: number,
  paper = 0,
  onTapEntry?: (id: string) => void,
  onTapCluster?: (lngLat: [number, number]) => void,
  /** A connection was tapped: how far apart its two memories are + where
   *  (screen px) — the screen shows the time-gap whisper. */
  onTapGap?: (gapMs: number, x: number, y: number) => void,
) {
  // DEV ONLY (`?journal=test`): the dense judging set — ~60 moments over
  // 3 months, home + work clusters + scatter. Never touches the store.
  if (journalTestMode()) {
    data = journalTestPoints();
    version = JOURNAL_TEST_VERSION;
  }
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
        // Constellations are MATTE GEMS like every memory node (Eli's
        // 2026-07-08 redesign) — solid pigment, free silhouette, no white.
        light: {
          gain: TRAIL.gain * fade,
          wobble: TRAIL.spark.wobble,
          matte: 1,
          matteGlint: TRAIL.node.glint,
          stainEdge: TRAIL.node.edge,
          stainRing: TRAIL.node.rim,
        },
        parameters: MATTE_OVER,
      }),
      new TextLayer<SparkCluster>({
        id: "journal-constellation-counts",
        data: clusters.filter((c) => c.count > 1),
        getPosition: (d) => d.position,
        getText: (d) => String(d.count),
        getSize: TRAIL.spark.countLabel.sizePx,
        // The count whispers in the constellation's own hue — nothing
        // white lives in the journal (Eli, 2026-07-08).
        getColor: (d: SparkCluster) =>
          [d.hue[0], d.hue[1], d.hue[2], Math.round(TRAIL.spark.countLabel.alpha * fade)] as [
            number,
            number,
            number,
            number,
          ],
        updateTriggers: { getColor: [version, Math.round(fade * 32)] },
        // Ride above the glow whatever its size (big clusters cap at 44px).
        getPixelOffset: (d: SparkCluster) => [0, -(getClusterRadius(d) + 8)] as [number, number],
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
    // THE ONE GLOW RECIPE's radius curve: zoom-aware, capped both ways —
    // candles stay crisp jewels at every zoom, never mid-zoom fuzz.
    radiusScale: Math.pow(LAMP.zoomGrowth, zoom - 12),
    radiusMinPixels: LAMP.minRadiusPx,
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
    // THE AURORA: the journey between the memories — flowing curtains of
    // light, drawn first so every node sits above its own history. Tap a
    // curtain to learn how far apart its two moments were.
    if (data.length > 1) {
      layers.push(
        new AuroraLayer({
          id: "journal-aurora",
          data: cachedAurora(data, version),
          getPath: (d: AuroraDatum) => d.path,
          getColor: (d: AuroraDatum) =>
            [d.color[0], d.color[1], d.color[2], Math.round(d.color[3] * fade * night)] as [
              number,
              number,
              number,
              number,
            ],
          updateTriggers: { getColor: [version, Math.round(fade * night * 32)] },
          timeSec,
          widthUnits: "pixels" as const,
          getWidth: TRAIL.aurora.widthPx,
          widthMinPixels: 4,
          capRounded: true,
          jointRounded: true,
          pickable: true,
          onClick: (info: { object?: AuroraDatum; x?: number; y?: number }) => {
            if (info.object && onTapGap) onTapGap(info.object.gapMs, info.x ?? 0, info.y ?? 0);
            return true;
          },
          parameters: { depthWriteEnabled: false },
        }),
      );
    }
    // THE MEMORY MARKS. Default: THE EMBER (round 2, item 3) — an
    // id-seeded sea-glass silhouette frozen forever, a matte body whose
    // overlaps DEEPEN, and a dim additive heart so repeat places WARM.
    // `?trail=splat`: the old matte-gem, kept only for the judging.
    if (trailRenderer() === "ember") {
      layers.push(
        new EmotionGlowLayer({
          id: "journal-ember-body",
          ...shared,
          getSeed,
          pickable: true,
          onClick: (info: { object?: LivePoint }) => {
            if (info.object && onTapEntry) onTapEntry(info.object.id);
            return true;
          },
          light: {
            gain: TRAIL.ember.bodyGain * fade * night,
            ember: 1,
            emberEdge: TRAIL.ember.edge,
            emberHeartR: TRAIL.ember.heartR,
            emberHeartOff: TRAIL.ember.heartOff,
            emberWarmth: TRAIL.ember.warmth,
          },
          parameters: MATTE_OVER,
        }),
        new EmotionGlowLayer({
          id: "journal-ember-heart",
          ...shared,
          getSeed,
          light: {
            gain: TRAIL.ember.heartGain * fade * night,
            ember: 2,
            emberEdge: TRAIL.ember.edge,
            emberHeartR: TRAIL.ember.heartR,
            emberHeartOff: TRAIL.ember.heartOff,
            emberWarmth: TRAIL.ember.warmth,
          },
          // SCREEN, not additive: stacked hearts saturate toward the warm
          // hue and structurally cannot bloom white (rule 3).
          parameters: SCREEN_LIGHT,
        }),
      );
    } else {
      layers.push(
        new EmotionGlowLayer({
          id: "journal-sparks",
          ...shared,
          pickable: true,
          onClick: (info: { object?: LivePoint }) => {
            if (info.object && onTapEntry) onTapEntry(info.object.id);
            return true;
          },
          light: {
            gain: TRAIL.gain * fade * night,
            wobble: TRAIL.spark.wobble,
            matte: 1,
            matteGlint: TRAIL.node.glint,
            stainEdge: TRAIL.node.edge,
            stainRing: TRAIL.node.rim,
          },
          parameters: MATTE_OVER,
        }),
      );
    }
    // WHERE IT BEGAN → NOW: two whispers that make the journey legible at
    // a cold glance — the oldest memory carries its date, the newest says
    // "now". Each speaks in its own entry's hue (no white in the journal).
    if (data.length > 1) {
      const byTime = [...data].sort((a, b) => a.createdAt - b.createdAt);
      const first = byTime[0];
      const last = byTime[byTime.length - 1];
      const began = new Date(first.createdAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
      });
      layers.push(
        new TextLayer<LivePoint>({
          id: "journal-journey-cues",
          data: [first, last],
          getPosition: (d) => d.position,
          getText: (d) => (d === first ? `began ${began}` : "now"),
          getSize: 11,
          getColor: (d) => [d.hue[0], d.hue[1], d.hue[2], Math.round(190 * fade * night)],
          getPixelOffset: (d: LivePoint) => [0, -(getTrailRadius(d) + 14)] as [number, number],
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
    // Named stars: a delicate ring around entries that carry a memory.
    const remembered = cachedRemembered(data, version);
    if (remembered.length > 0) {
      layers.push(
        new ScatterplotLayer<LivePoint>({
          id: "journal-memory-rings",
          data: remembered,
          getPosition: (d) => d.position,
          getRadius: (d) => getTrailRadius(d) * TRAIL.spark.ring.radiusFactor,
          // Ring brightness follows the entry's own weight — an ember's
          // ring must never outshine its spark (design review).
          getLineColor: (d) =>
            [
              d.hue[0],
              d.hue[1],
              d.hue[2],
              Math.round(TRAIL.spark.ring.alpha * fade * (0.45 + 0.55 * d.weight)),
            ] as [number, number, number, number],
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
