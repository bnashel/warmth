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
// or avenues flicker between tiers. Links ride with their parent class.
const HIGHWAY = ["motorway", "motorway_link", "trunk", "trunk_link"];
const AVENUE = ["primary", "secondary", "tertiary", "primary_link", "secondary_link", "tertiary_link"];
const LOCAL = ["street", "street_limited"];
const SERVICE = ["service", "track"];

/** Linear zoom fade 0 → alpha across [from, to]. Nothing ever pops. */
const fadeIn = (from: number, to: number, alpha: number) =>
  ["interpolate", ["linear"], ["zoom"], from, 0, to, alpha] as unknown as number;

/** Road width breathes wider as you approach street level. */
const widthRamp = (from: number, w: number) =>
  [
    "interpolate",
    ["exponential", 1.5],
    ["zoom"],
    from,
    w * 0.35,
    16.5,
    w * 2.4,
  ] as unknown as number;

function roadLayer(
  id: string,
  classes: string[],
  fade: { from: number; to: number },
  color: string,
  alpha: number,
  width: number,
): LayerSpecification {
  return {
    id,
    type: "line",
    source: "streets",
    "source-layer": "road",
    filter: [
      "all",
      ["match", ["get", "class"], classes, true, false],
      ["!=", ["get", "structure"], "tunnel"], // tunnels are not visible city
    ],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-opacity": fadeIn(fade.from, fade.to, alpha),
      "line-width": widthRamp(fade.from, width),
    },
  };
}

export function buildStyle(p: CandidatePalette, name: string): StyleSpecification {
  const layers: LayerSpecification[] = [
    // The ground the city rests on.
    { id: "bg", type: "background", paint: { "background-color": p.bg } },
  ];

  // Neighborhood tonal plates — whisper-white fills, varied per place so the
  // city reads as a hand-laid patchwork (skipped when the palette says 0).
  if (p.plateBase > 0) {
    layers.push({
      id: "nbhd-plates",
      type: "fill",
      source: "neighborhoods",
      paint: {
        "fill-color": "#E9ECF4",
        "fill-opacity": [
          "+",
          p.plateBase,
          ["*", p.plateStep, ["%", ["length", ["get", "name"]], 3]],
        ] as unknown as number,
      },
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
      paint: { "fill-color": p.park },
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
  if ("building" in p && p.building) {
    layers.push({
      id: "buildings",
      type: "fill",
      source: "streets",
      "source-layer": "building",
      minzoom: JOURNEY.buildingFade.from - 0.2,
      paint: {
        "fill-color": p.building,
        "fill-opacity": fadeIn(
          JOURNEY.buildingFade.from,
          JOURNEY.buildingFade.to,
          p.buildingAlpha,
        ),
      },
    });
  }

  layers.push(
    // The street journey, four waves: highways → avenues → side streets →
    // alleys. Weight and opacity step down per wave so the grid has rhythm.
    roadLayer("roads-service", SERVICE, JOURNEY.serviceFade, p.road, p.roadAlpha.service, p.roadWidth.service),
    roadLayer("roads-local", LOCAL, JOURNEY.localFade, p.road, p.roadAlpha.local, p.roadWidth.local),
    roadLayer("roads-avenue", AVENUE, JOURNEY.avenueFade, p.road, p.roadAlpha.avenue, p.roadWidth.avenue),
    roadLayer("roads-highway", HIGHWAY, JOURNEY.highwayFade, p.road, p.roadAlpha.highway, p.roadWidth.highway),
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
