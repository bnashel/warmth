/**
 * components/map/styles.ts — hand-authored Mapbox style JSON, from scratch.
 *
 * NOT a restyled dark-v11: every layer below exists because we chose it.
 * Source is Mapbox's streets-v8 vector tiles; we draw water, parks, roads,
 * (optionally) buildings, and our own neighborhood shapes. There are ZERO
 * symbol layers — no default fonts, halos, POIs, shields, or transit can
 * exist by construction. All text is ours (deck.gl TextLayer, Inter).
 *
 * The three candidates share this skeleton; their entire difference lives in
 * the palettes in tune.ts (where Ben's feedback lands as one-line edits).
 */
import type { StyleSpecification, LayerSpecification } from "mapbox-gl";
import { JOURNEY, type CandidatePalette } from "./tune";

// NYC tagging note: avenues alternate primary/secondary/tertiary block to
// block (Bedford Ave does all three) — tertiary belongs with avenues here,
// or avenues flicker between tiers. Links are their OWN quiet tier
// (2026-07-08): riding with their parents, every interchange helix and
// tunnel-portal rotary arrived early at arterial brightness and read as
// overlapping scribbles (Eli: Holland/Lincoln "duplication artifacts").
const HIGHWAY = ["motorway", "trunk"];
const AVENUE = ["primary", "secondary", "tertiary"];
const RAMP = ["motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"];
const LOCAL = ["street", "street_limited"];
const SERVICE = ["service", "track"];

/** Linear zoom fade 0 → alpha across [from, to]. Nothing ever pops. */
const fadeIn = (from: number, to: number, alpha: number) =>
  ["interpolate", ["linear"], ["zoom"], from, 0, to, alpha] as unknown as number;

/**
 * Road width breathes wider as you approach street level. Bridges run a
 * touch heavier at every zoom — a river crossing is a landmark, and the
 * tile split at z13 (where `structure` appears) was letting the spans
 * thin out into ghosts (Ben: "the bridge disappears"). `widen` scales the
 * whole curve — solar.ts drives it with the paper weight so the day map
 * has real mass while night keeps its hairlines. Exported: the style and
 * the atmosphere MUST agree or the 1s re-ink would fight the base look.
 */
export const roadWidthExpr = (from: number, w: number, widen = 1) => {
  const stop = (v: number) =>
    ["match", ["get", "structure"], "bridge", v * 1.35, v] as const;
  return [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    from,
    stop(w * 0.35 * widen),
    16.5,
    stop(w * 2.4 * widen),
  ] as unknown as number;
};

/**
 * Parks arrive by size. Each ladder rung holds the sizeranks that enter at
 * that tile zoom to 0 — solid at ≤ `solid`, gone at ≥ `gone` — and the zoom
 * axis brushes them in across the next zoom level. Ranks 1–4 (Central Park
 * scale) sit solid from the rest view: every dark patch stays a park.
 */
const parkOpacityExpr = () => {
  const expr: unknown[] = ["interpolate", ["linear"], ["zoom"]];
  for (const { zoom, solid, gone } of JOURNEY.parkFade.ladder)
    expr.push(zoom, ["interpolate", ["linear"], ["get", "sizerank"], solid, 1, gone, 0]);
  return expr as unknown as number;
};

/**
 * Road presence. Bridges ride JOURNEY.bridgeFade — the earliest ramp — in
 * every wave; the rest of the wave keeps its stagger. At z13 the tiles
 * re-cut spans into structure pieces that can land in a later class, and a
 * bridge would fade OUT as you zoom IN (Eli: bridges vanish z12–14).
 * Mapbox forbids ["zoom"] inside "case", so this is one TOP-LEVEL zoom
 * interpolate whose stops output a match on structure — sampling both
 * linear ramps at the union of their breakpoints reproduces each exactly.
 * Exported: the style and the 1s re-ink MUST agree.
 */
export const roadOpacityExpr = (
  fade: { from: number; to: number },
  alpha: number,
  /** Street-presence lift (JOURNEY.streetPresence.boost.*): ×1 at sp.from
   *  easing to ×lift at sp.to — the quiet human grid returns at max zoom. */
  lift = 1,
) => {
  const b = JOURNEY.bridgeFade;
  const sp = JOURNEY.streetPresence;
  const t01 = (z: number, from: number, to: number) =>
    Math.min(1, Math.max(0, (z - from) / (to - from)));
  const liftAt = (z: number) => 1 + (lift - 1) * t01(z, sp.from, sp.to);
  const ramp = (z: number, f: { from: number; to: number }) => alpha * t01(z, f.from, f.to);
  const stops = [
    ...new Set([b.from, b.to, fade.from, fade.to, sp.from, (sp.from + sp.to) / 2, sp.to]),
  ].sort((x, y) => x - y);
  const expr: unknown[] = ["interpolate", ["linear"], ["zoom"]];
  for (const z of stops)
    expr.push(z, [
      "match",
      ["get", "structure"],
      "bridge",
      ramp(z, b) * liftAt(z),
      ramp(z, fade) * liftAt(z),
    ]);
  return expr as unknown as number;
};

function roadLayer(
  id: string,
  classes: string[],
  fade: { from: number; to: number },
  color: string,
  alpha: number,
  width: number,
  lift = 1,
): LayerSpecification {
  return {
    id,
    type: "line",
    source: "streets",
    "source-layer": "road",
    filter: [
      "all",
      ["match", ["get", "class"], classes, true, false],
      ["!=", ["get", "structure"], "tunnel"], // tunnels get their own whisper
      // ONE DECK PER BRIDGE (2026-07-08): double-deck spans (Queensboro,
      // GW) ship as one tile feature PER DECK at layer 1/2/3 — stacked
      // translucent strokes read as a doubled bridge (Eli). Only the
      // lowest deck draws; ramps (their own layer) fly over freely.
      [
        "any",
        ["!=", ["get", "structure"], "bridge"],
        ["<=", ["coalesce", ["get", "layer"], 0], 1],
      ],
    ],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-opacity": roadOpacityExpr(fade, alpha, lift),
      "line-width": roadWidthExpr(fade.from, width),
    },
  };
}

export function buildStyle(p: CandidatePalette, name: string): StyleSpecification {
  const layers: LayerSpecification[] = [
    // The ground the city rests on.
    { id: "bg", type: "background", paint: { "background-color": p.bg } },
  ];

  // Neighborhood tonal plates — one uniform whisper-white lift so land
  // separates from water. Uniform on purpose: per-plate variance read as
  // accidental shadows. Every dark patch on the map is a park or water.
  if (p.plateBase > 0) {
    layers.push({
      id: "nbhd-plates",
      type: "fill",
      source: "neighborhoods",
      paint: { "fill-color": "#E9ECF4", "fill-opacity": p.plateBase },
    });
  }

  layers.push(
    // Parks and green voids — tone, never green.
    {
      id: "parks",
      type: "fill",
      source: "streets",
      "source-layer": "landuse",
      // No pitch/scrub: playground-sized rectangles read as glitches, not
      // places, and their contrast competes with the glow.
      filter: ["match", ["get", "class"], ["park", "grass", "wood", "cemetery"], true, false],
      paint: { "fill-color": p.park, "fill-opacity": parkOpacityExpr() },
    },
    // Water — its own darkness, never blue.
    {
      id: "water",
      type: "fill",
      source: "streets",
      "source-layer": "water",
      paint: { "fill-color": p.water },
    },
  );

  // Buildings — the mass texture (Graphite; faint density in Fog).
  // NO minzoom: crossing a layer's minzoom makes mapbox build the building
  // geometry for every loaded tile in one burst — the zoom-in hitch Ben
  // felt. Always-on costs nothing below ~z13 (the source has no building
  // features there) and the opacity ramp alone stages the arrival.
  if ("building" in p && p.building) {
    layers.push({
      id: "buildings",
      type: "fill",
      source: "streets",
      "source-layer": "building",
      paint: {
        "fill-color": p.building,
        "fill-opacity": fadeIn(
          JOURNEY.buildingFade.from,
          JOURNEY.buildingFade.to,
          p.buildingAlpha,
        ),
      },
    });
    // Footprints: whisper-faint outlines that arrive with the street-zoom
    // grid — the quiet human scale the empty max-zoom city was missing.
    layers.push({
      id: "buildings-outline",
      type: "line",
      source: "streets",
      "source-layer": "building",
      paint: {
        "line-color": p.road,
        "line-opacity": fadeIn(
          JOURNEY.footprintFade.from,
          JOURNEY.footprintFade.to,
          JOURNEY.footprintFade.alpha,
        ),
        "line-width": 0.5,
      },
    });
  }

  layers.push(
    // TUNNELS — a whisper of continuation (2026-07-08): with tunnels fully
    // absent, every portal read as a dead-ended or broken street (Eli).
    // The thread is faint, arrives late, and never competes with surface
    // structure — you sense the road continues; you never mistake it for
    // one. Plain fade (no bridge/street-presence machinery).
    {
      id: "roads-tunnels",
      type: "line",
      source: "streets",
      "source-layer": "road",
      filter: [
        "all",
        ["match", ["get", "class"], [...HIGHWAY, ...AVENUE], true, false],
        ["==", ["get", "structure"], "tunnel"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.road,
        "line-opacity": fadeIn(12.8, 14.0, p.roadAlpha.tunnel),
        "line-width": roadWidthExpr(12.8, p.roadWidth.tunnel),
      },
    } as LayerSpecification,
    // RAMPS — interchange links as their own quiet tier (2026-07-08):
    // late arrival, hairline weight, no early-bridge boost — the Lincoln
    // helix and Holland rotary become quiet knots, not scribbles.
    {
      id: "roads-ramps",
      type: "line",
      source: "streets",
      "source-layer": "road",
      filter: [
        "all",
        ["match", ["get", "class"], RAMP, true, false],
        ["!=", ["get", "structure"], "tunnel"],
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.road,
        "line-opacity": fadeIn(JOURNEY.localFade.from, JOURNEY.localFade.to, p.roadAlpha.ramp),
        "line-width": roadWidthExpr(JOURNEY.localFade.from, p.roadWidth.ramp),
      },
    } as LayerSpecification,
    // The street journey, four waves: highways → avenues → side streets →
    // alleys. Weight and opacity step down per wave so the grid has rhythm;
    // the quiet tiers lift again at street zoom (streetPresence).
    roadLayer("roads-service", SERVICE, JOURNEY.serviceFade, p.road, p.roadAlpha.service, p.roadWidth.service, JOURNEY.streetPresence.boost.service),
    roadLayer("roads-local", LOCAL, JOURNEY.localFade, p.road, p.roadAlpha.local, p.roadWidth.local, JOURNEY.streetPresence.boost.local),
    roadLayer("roads-avenue", AVENUE, JOURNEY.avenueFade, p.road, p.roadAlpha.avenue, p.roadWidth.avenue, JOURNEY.streetPresence.boost.avenue),
    roadLayer("roads-highway", HIGHWAY, JOURNEY.highwayFade, p.road, p.roadAlpha.highway, p.roadWidth.highway, JOURNEY.streetPresence.boost.highway),
    // Neighborhood boundaries — hand-softened seams that dissolve as the
    // street texture takes over.
    {
      id: "nbhd-boundaries",
      type: "line",
      source: "neighborhoods",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": p.boundary,
        "line-width": p.boundaryWidth,
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9.3,
          0.75,
          JOURNEY.boundaryFade.peak,
          1,
          JOURNEY.boundaryFade.gone,
          0,
        ] as unknown as number,
      },
    },
  );

  return {
    version: 8,
    name: `warmth-${name}`,
    // No glyphs, no sprite — symbol layers cannot exist in this style.
    sources: {
      streets: { type: "vector", url: "mapbox://mapbox.mapbox-streets-v8" },
      neighborhoods: { type: "geojson", data: "/data/nyc-neighborhoods.json" },
    },
    transition: { duration: 300, delay: 0 },
    layers,
  };
}
