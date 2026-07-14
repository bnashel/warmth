/**
 * components/Trail/glow.ts — the glow render path: live moments → light layers.
 *
 * Data comes from lib/momentsStore (stable array identity; weights mutate in
 * place). `version` keys deck.gl's updateTriggers so weight changes actually
 * reach the GPU — without it, in-place mutation is invisible.
 */
import { PathLayer, ScatterplotLayer, TextLayer } from "deck.gl";
import {
  ADDITIVE_LIGHT,
  SCREEN_LIGHT,
  MATTE_OVER,
  PIGMENT_STAIN,
  STREET_LIGHT,
  EmotionGlowLayer,
  type GlowDatum,
} from "./GlowLayer";
import { journalTestMode, journalTestPoints, JOURNAL_TEST_VERSION } from "./testJournal";
import { currentLook } from "@/components/Map/lookState";
import { buildGalleryTrailLayers } from "./galleryGlow";
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
let clusterCache: { key: string; data: LivePoint[]; clusters: SparkCluster[] } | null = null;
let ringCache: { version: number; data: LivePoint[]; remembered: LivePoint[] } | null = null;
/** The newest entry (the "now" cue) — same version-keyed reuse. */
let newestCache: { version: number; data: LivePoint[]; last: LivePoint } | null = null;

/* ---- THE THREAD (round 2, item 4 — off by default, on demand) --------
 * The always-on beaded network is gone (Ben + Eli). What remains is ONE
 * single continuous quiet path through the moments in time order —
 * revealed briefly when you enter the private view, then gone. Never a
 * permanent network, never radiating strings.
 *
 * PROPOSED AFFORDANCES (Ben picks; TRAIL.thread.affordance flips it):
 *   "onEnter"  — the path draws once, softly, on entering private view,
 *                holds a breath, and fades. No new chrome. (Current.)
 *   "control"  — a small quiet "thread" chip in the private view that
 *                toggles it. (Not built until Ben chooses it.)
 * -------------------------------------------------------------------- */

/** One smoothed polyline through the journal's PLACES in first-visit
 *  order — never through raw entries (review blocker: a real journal
 *  ping-pongs home-work-home dozens of times, and an entry-ordered path
 *  fanned into a radiating cable). Entries cluster to ~250m visit-places;
 *  each place appears ONCE, so home-work is a single worn line. Then the
 *  same Catmull-Rom + adaptive tautness + gentle meander, one multi-vertex
 *  path: no per-segment caps, so no beads. */
function threadVertices(data: LivePoint[]): [number, number][] {
  const byTime = [...data].sort((a, b) => a.createdAt - b.createdAt);
  if (byTime.length < 2) return [];
  // Cluster to visit-places (~250m cells), keeping first-visit order.
  const CELL = 0.0025;
  const places = new Map<string, { lng: number; lat: number; n: number }>();
  for (const p of byTime) {
    const key = `${Math.round(p.position[0] / CELL)}:${Math.round(p.position[1] / CELL)}`;
    const c = places.get(key);
    if (c) {
      c.lng += p.position[0];
      c.lat += p.position[1];
      c.n++;
    } else {
      places.set(key, { lng: p.position[0], lat: p.position[1], n: 1 });
    }
  }
  const pts = [...places.values()].map(
    (c) => ({ position: [c.lng / c.n, c.lat / c.n] as [number, number] }),
  );
  if (pts.length < 2) return []; // one place: a journey needs two
  const T = TRAIL.thread;
  const P = (i: number) => pts[Math.min(pts.length - 1, Math.max(0, i))].position;
  const verts: [number, number][] = [[P(0)[0], P(0)[1]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    // Short hops curve like handwriting; long jumps run nearly straight
    // (full Catmull-Rom loops wide over the river between far entries).
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const t = T.tautness * Math.min(1, 0.012 / Math.max(len, 1e-6));
    const perp: [number, number] =
      len > 1e-9 ? [-(p2[1] - p1[1]) / len, (p2[0] - p1[0]) / len] : [0, 0];
    const phase = i * 2.399; // golden-angle-ish: no two spans sway alike
    for (let k = 1; k <= T.subdiv; k++) {
      const s = k / T.subdiv;
      const s2 = s * s;
      const s3 = s2 * s;
      const cr = (a: number, b: number, c: number, d: number) =>
        b + t * ((-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3) * 0.5 +
        (1 - t) * ((c - b) * s);
      const sway = Math.sin(s * Math.PI * 1.7 + phase) * Math.sin(s * Math.PI) * len * T.meander;
      verts.push([
        cr(p0[0], p1[0], p2[0], p3[0]) + perp[0] * sway,
        cr(p0[1], p1[1], p2[1], p3[1]) + perp[1] * sway,
      ]);
    }
  }
  return verts;
}

let threadCache: { version: number; verts: [number, number][] } | null = null;

function cachedThread(data: LivePoint[], version: number): [number, number][] {
  if (!threadCache || threadCache.version !== version) {
    threadCache = { version, verts: threadVertices(data) };
  }
  return threadCache.verts;
}

/** The on-enter reveal envelope: rises softly, holds a breath, exhales.
 *  Tracks the public→private crossing from the fade the caller already
 *  passes every frame — no new plumbing, no React. */
let lastFade = 0;
let enteredAtSec = -1e9;
function threadReveal(fade: number, timeSec: number): number {
  if (lastFade < 0.5 && fade >= 0.5) enteredAtSec = timeSec;
  lastFade = fade;
  const T = TRAIL.thread;
  const t = (timeSec - enteredAtSec) * 1000;
  if (t < 0) return 0;
  if (t < T.inMs) return t / T.inMs;
  if (t < T.inMs + T.holdMs) return 1;
  const out = (t - T.inMs - T.holdMs) / T.outMs;
  return Math.max(0, 1 - out);
}

function cachedClusters(data: LivePoint[], version: number, zoom: number): SparkCluster[] {
  const key = `${version}:${Math.round(zoom * 4) / 4}`;
  // Data identity matters like in the sibling caches (review fix, 07-14):
  // ?journal=test keeps a FIXED version but re-allocates its points with
  // fresh world-aware hues on a night ↔ paper switch — without this check
  // the constellations kept the old world's colors until zoom moved.
  if (!clusterCache || clusterCache.key !== key || clusterCache.data !== data) {
    clusterCache = { key, data, clusters: clusterSparks(data, zoom) };
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
 *  side-by-side judging (loser gets deleted once Ben + Eli decide).
 *  Memoized on the search string — this runs on every push while the
 *  private view breathes, and URLSearchParams allocates + parses
 *  (perf pass, 2026-07-14). */
let rendererCache: { search: string; value: "ember" | "splat" } | null = null;
function trailRenderer(): "ember" | "splat" {
  if (typeof window !== "undefined") {
    const search = window.location.search;
    if (!rendererCache || rendererCache.search !== search) {
      const p = new URLSearchParams(search).get("trail");
      rendererCache = {
        search,
        value: p === "splat" || p === "ember" ? p : TRAIL.renderer,
      };
    }
    return rendererCache.value;
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
  /** Chrome ink weight (inkWeight upstream): 0 = pale ink on dark ground,
   *  1 = graphite on light ground. Threads + cues follow it. */
  ink = 0,
  /** Thread looks only: an aurora connection was tapped (gapMs, x, y). */
  onTapGap?: (gapMs: number, x: number, y: number) => void,
) {
  // DEV ONLY (`?journal=test`): the dense judging set — ~60 moments over
  // 3 months, home + work clusters + scatter. Never touches the store.
  if (journalTestMode()) {
    data = journalTestPoints();
    version = JOURNAL_TEST_VERSION;
  }
  // THE ONE GALLERY (merge, 07-13): the active look chooses its journal.
  // Ben's forever-ember renders below; Eli's aurora THREAD and GARDEN
  // render in galleryGlow.ts, preserved whole.
  const journalKind = currentLook().config.journal;
  if (journalKind !== "ember") {
    return buildGalleryTrailLayers(
      data, version, timeSec, zoom, fade, paper, onTapEntry, onTapCluster, onTapGap,
    );
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
  // Threads and cues live in BOTH worlds; their ink follows the ground.
  const cueStrength = Math.max(night, paper);
  const inkMix = (a: number, b: number) => Math.round(a + (b - a) * ink);
  const threadColor: [number, number, number] = [inkMix(233, 52), inkMix(236, 58), inkMix(244, 70)];
  const layers = [];
  // Stains BEFORE glow (same pass order as the field): through twilight the
  // glow must add on top of the stained paper, never be darkened by it.
  if (paper > 0.01) {
    layers.push(
      new EmotionGlowLayer({
        id: "trail-stains",
        ...shared,
        // THE PIGMENT EMBER (paper world): the forever-shape silhouette
        // soaked into the sheet — wash on the undulated radius, heart as
        // DEEPER pooled pigment. Tappable: the journal opens from a stain
        // (the old flat stains never were — round-4 fix).
        getSeed,
        pickable: true,
        onClick: (info: { object?: LivePoint }) => {
          if (info.object && onTapEntry) onTapEntry(info.object.id);
          return true;
        },
        radiusScale: shared.radiusScale * TRAIL.stain.radiusScale,
        light: {
          gain: TRAIL.gain * TRAIL.stain.gainBoost * fade,
          pigment: paper,
          ember: 1,
          emberEdge: TRAIL.ember.edge,
          emberHeartR: TRAIL.ember.heartR,
          emberHeartOff: TRAIL.ember.heartOff,
          stainEdge: TRAIL.stain.edge,
          stainRing: TRAIL.stain.ring,
          stainHeart: TRAIL.stain.heartPool,
        },
        parameters: PIGMENT_STAIN,
      }),
    );
  }
  {
    // THE THREAD (item 4): one continuous quiet path through time,
    // revealed on entering the private view, then gone. Drawn first so
    // every mark sits above its own history. Graphite on paper, pale on
    // ink — and a touch MORE present on paper (thin lines vanish on bone).
    const reveal = threadReveal(fade, timeSec);
    if (data.length > 1 && reveal > 0.01) {
      // Graphite on bone carries FAR more contrast than pale-on-ink at the
      // same alpha — the paper thread runs quieter, not louder.
      const alpha = Math.round(
        255 * TRAIL.thread.alpha * reveal * fade * cueStrength * (1 - 0.35 * ink),
      );
      layers.push(
        new PathLayer({
          id: "journal-thread",
          data: [{ path: cachedThread(data, version) }],
          getPath: (d: { path: [number, number][] }) => d.path,
          getColor: [...threadColor, alpha] as [number, number, number, number],
          updateTriggers: { getColor: [version, alpha, Math.round(ink * 32)] },
          widthUnits: "pixels" as const,
          getWidth: TRAIL.thread.widthPx,
          widthMinPixels: 1.5,
          capRounded: true,
          jointRounded: true,
          pickable: false,
          parameters: { depthWriteEnabled: false },
        }),
      );
    }
    // THE MEMORY MARKS (night worlds only — on paper the pigment-ember
    // stains above ARE the marks). Default: THE EMBER (round 2, item 3).
    // `?trail=splat`: the old matte-gem, kept only for the judging.
    if (night > 0.01 && trailRenderer() === "ember") {
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
    } else if (night > 0.01) {
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
    // a cold glance — "now" on the newest moment ONLY (round 2, item 4).
    if (data.length > 1) {
      // Version-keyed like the other trail caches: this was a full copy +
      // sort on every push while the private view breathed (perf pass,
      // 2026-07-14). `>=` keeps the stable sort's tie behavior (last
      // occurrence of the newest timestamp wins).
      if (!newestCache || newestCache.version !== version || newestCache.data !== data) {
        let newest = data[0];
        for (const p of data) if (p.createdAt >= newest.createdAt) newest = p;
        newestCache = { version, data, last: newest };
      }
      const last = newestCache.last;
      layers.push(
        new TextLayer<LivePoint>({
          id: "journal-journey-cues",
          data: [last],
          getPosition: (d) => d.position,
          getText: () => "now",
          getSize: 11,
          getColor: (d) => [d.hue[0], d.hue[1], d.hue[2], Math.round(190 * fade * cueStrength)],
          getPixelOffset: (d: LivePoint) => [0, -(getTrailRadius(d) + 14)] as [number, number],
          updateTriggers: {
            getText: version,
            getColor: [version, Math.round(fade * cueStrength * 32)],
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
