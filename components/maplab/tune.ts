/**
 * components/map/tune.ts — every tunable style/motion decision for the map,
 * in one place, commented. "Make the water darker" is a one-line edit here.
 *
 * THE ONE LAW: nothing in this file may carry saturation worth noticing.
 * The base city is ink — the six emotion hues (lib/theme.ts) are the only
 * vivid color allowed on screen, and they arrive via the glow, never the base.
 */

/* ------------------------------------------------------------------ */
/* Camera & motion — the Apple Maps half of the bar                    */
/* ------------------------------------------------------------------ */
export const CAMERA = {
  /** Opening shot: lower-Manhattan-and-bridges sweep. The wide "at rest" view. */
  initial: { longitude: -73.975, latitude: 40.72, zoom: 10.8 },
  /** Hard clamps: the map is NYC, not the world. */
  maxBounds: [
    [-74.35, 40.45],
    [-73.6, 41.0],
  ] as [[number, number], [number, number]],
  minZoom: 9.3,
  maxZoom: 16.5,
  /**
   * Rotation & pitch are OFF — deliberate. The map is a composed canvas:
   * north-up keeps neighborhood shapes and screenshots stable, and the ink
   * aesthetic is a drawing, not a diorama. Revisit if 3D buildings land.
   */
  rotationEnabled: false,
} as const;

export const MOTION = {
  /** Pan glide: lower deceleration = longer, heavier glide (glass feel). */
  dragPan: { linearity: 0.28, maxSpeed: 1200, deceleration: 1900 },
  /** Wheel/pinch zoom rate — lower = weightier, more anchored zoom. */
  wheelZoomRate: 1 / 460,
  /** Cross-fade for tile/label raster fades, ms. Longer = dreamier arrivals. */
  fadeDurationMs: 600,
} as const;

/* ------------------------------------------------------------------ */
/* The zoom journey — where detail fades in (all continuous, no steps) */
/* ------------------------------------------------------------------ */
export const JOURNEY = {
  /** Streets are absent at rest; arterials breathe in first, then locals. */
  arterialFade: { from: 11.6, to: 13.2 }, // motorway/trunk/primary/secondary
  localFade: { from: 13.0, to: 14.8 }, // tertiary/street
  serviceFade: { from: 14.6, to: 15.8 }, // service/alley/path
  /** Buildings (Graphite's mass texture). */
  buildingFade: { from: 13.2, to: 15.0 },
  /** Neighborhood boundaries: present at rest, dissolving as streets take over. */
  boundaryFade: { peak: 11.0, gone: 14.5 },
} as const;

/* ------------------------------------------------------------------ */
/* Neighborhood labels (deck.gl TextLayer, Inter)                      */
/* ------------------------------------------------------------------ */
export const LABELS = {
  /** Area tiers (deg², from the data's `area`): big places whisper first. */
  tierAreas: [3.0e-4, 1.2e-4], // ≥t1 = tier1, ≥t2 = tier2, else tier3
  /** Px sizes per tier — hierarchy by opacity/spacing, never size wars. */
  sizePx: [13, 11.5, 10.5],
  /** White alpha per tier (0-255). Whisper, not shout. */
  alpha: [150, 112, 88],
  /** Zoom at which each tier begins to appear (fades over ~0.8z). */
  tierZoom: [9.3, 11.0, 12.3],
  /** Letterspacing feel comes from uppercase + tracking. */
  uppercase: false,
  /** All labels dissolve as the street texture takes the stage. */
  globalFadeOut: { from: 14.6, to: 15.6 },
} as const;

/* ------------------------------------------------------------------ */
/* Fake glow — TEST SCAFFOLDING for judging candidates (not Phase 3)   */
/* ------------------------------------------------------------------ */
export const GLOW_TEST = {
  radiusPx: 96, // bigger = softer, more aurora (dots read as fields, not dabs)
  intensity: 1.15,
  threshold: 0.018, // lower = wider soft skirt
  opacity: 0.85,
} as const;

/* ------------------------------------------------------------------ */
/* The three candidates' palettes — ALL ink, zero saturation           */
/* ------------------------------------------------------------------ */

/** C1 — INK & GLOW: near-black glass city; streets as hairlines of light. */
export const INK = {
  bg: "#0A0B0F", // the void itself — land is the absence of feature
  water: "#06070A", // water darker than land: rivers as deep cuts
  park: "#0D0F13", // parks: the faintest lift above land (a held breath)
  building: "#12141B", // human-scale mass at street zoom — still ink
  buildingAlpha: 0.6,
  plateBase: 0.03, // neighborhood tonal plates: lift land off the water…
  plateStep: 0.011, // …varied per-plate so the city reads as patchwork
  boundary: "rgba(233,236,244,0.075)", // hand-drawn seams between places
  boundaryWidth: 1.0,
  road: "#E9ECF4", // streets are LIGHT (hairlines), faded in by JOURNEY
  roadAlpha: { arterial: 0.3, local: 0.17, service: 0.09 },
  roadWidth: { arterial: 1.2, local: 0.8, service: 0.5 }, // px at fade-in end
} as const;

/** C2 — CARVED GRAPHITE: the city as sculpted mass; streets are carved voids. */
export const GRAPHITE = {
  bg: "#131519", // the graphite block: land carries visible mass
  water: "#050608", // polished black stone
  park: "#0E1013", // carved hollows
  building: "#1A1D22", // the volume texture (fades in via JOURNEY)
  buildingAlpha: 0.85,
  plateBase: 0.012, // faint plates so places exist at rest, not just labels
  plateStep: 0.008,
  boundary: "rgba(0,0,0,0.42)", // seams carved INTO the block
  boundaryWidth: 1.2,
  road: "#07080B", // streets as dark channels cut from the mass
  roadAlpha: { arterial: 0.85, local: 0.7, service: 0.5 },
  roadWidth: { arterial: 2.6, local: 1.7, service: 1.0 },
} as const;

/** C3 — FOG & VOID: land is luminous haze; water/parks are pure void;
 *  streets are etchings through the fog. Structure by absence. */
export const FOG = {
  bg: "#1C1F26", // the haze — lifted well above graphite so the thesis reads:
  // land glows faintly, and water/parks/streets are absences cut from it
  water: "#030406", // the deepest void on screen — THE void, singular
  park: "#12141A", // parks recede quietly; they must not out-shout the glow
  building: "#252932", // denser fog clumps (density texture)
  buildingAlpha: 0.55,
  plateBase: 0.012, // plates as gentle pressure differences in the fog
  plateStep: 0.008,
  boundary: "rgba(4,5,7,0.35)", // darker seams pressed into the haze
  boundaryWidth: 1.4,
  road: "#0B0D12", // etched through the fog at close zoom
  roadAlpha: { arterial: 0.7, local: 0.55, service: 0.35 },
  roadWidth: { arterial: 2.0, local: 1.3, service: 0.8 },
} as const;

export type CandidatePalette = typeof INK | typeof GRAPHITE | typeof FOG;
export const CANDIDATES = {
  1: { name: "Ink & Glow", palette: INK },
  2: { name: "Carved Graphite", palette: GRAPHITE },
  3: { name: "Fog & Void", palette: FOG },
} as const;
export type CandidateId = keyof typeof CANDIDATES;
