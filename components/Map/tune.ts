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
   * Rotation is ON (Ben's call — the map should turn under your fingers like
   * Apple Maps). Pitch stays off: the ink aesthetic is a drawing, not a
   * diorama. A quiet north chip appears only while rotated.
   */
  rotationEnabled: true,
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
  /** Streets are absent at rest and arrive in four waves — highways first,
   *  then avenues, then side streets, then alleys — so the grid has rhythm
   *  instead of uniform wireframe density. */
  highwayFade: { from: 11.2, to: 12.4 }, // motorway/trunk (FDR, BQE)
  avenueFade: { from: 11.8, to: 13.4 }, // primary/secondary (5th Ave, Bedford)
  localFade: { from: 13.2, to: 14.9 }, // tertiary/street (the residential grid)
  serviceFade: { from: 14.8, to: 15.9 }, // service/alley
  /** Buildings (mass texture). */
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
  /** White alpha per tier (0-255). Whisper, not shout — and always
   *  quieter than the dimmest glow (the brightness law). */
  alpha: [132, 100, 78],
  /**
   * Zoom at which each tier begins to appear (fades over ~0.8z).
   * NO neighborhood names at the rest view (Ben: cluttered) — the wide city
   * is shapes, water, and glow. Names arrive as you commit to a place.
   */
  tierZoom: [11.2, 12.2, 13.0],
  /** Letterspacing feel comes from uppercase + tracking. */
  uppercase: false,
  /** All labels dissolve as the street texture takes the stage. */
  globalFadeOut: { from: 14.6, to: 15.6 },
  /**
   * At rest, only the five boroughs whisper — enough to orient, nothing to
   * clutter. They dissolve as neighborhoods take over. Set alpha 0 to kill.
   */
  boroughs: [
    { name: "MANHATTAN", anchor: [-73.972, 40.783] },
    { name: "BROOKLYN", anchor: [-73.949, 40.652] },
    { name: "QUEENS", anchor: [-73.818, 40.727] },
    { name: "THE BRONX", anchor: [-73.878, 40.853] },
    { name: "STATEN ISLAND", anchor: [-74.148, 40.58] },
  ] as { name: string; anchor: [number, number] }[],
  boroughAlpha: 76,
  boroughSizePx: 11.5,
  boroughFadeOut: { from: 10.9, to: 11.6 },
} as const;

/* ------------------------------------------------------------------ */
/* Glow — emotion rendered as LIGHT (additive shader; test data only)  */
/* ------------------------------------------------------------------ */
export const GLOW = {
  /** Radius in px at zoom 12: base + perIntensity × intensity (0..1). */
  baseRadiusPx: 26,
  radiusPerIntensityPx: 54,
  /** Glow grows as you approach: radius × zoomGrowth^(zoom − 12). */
  zoomGrowth: 1.24,
  /** Hard pixel ceiling — fill-rate protection for DPR-3 phones. */
  maxRadiusPx: 220,
  /** Hot core: fraction of radius that burns near-peak before falloff. */
  coreRadius: 0.16,
  /** Extra brightness of the core above the tail's own peak. */
  corePeak: 0.9,
  /** How far the core whitens toward "hot filament" (0 = pure hue). */
  coreWhiteness: 0.18,
  /** Brightness floor + intensity gain: dim moments glow, big ones blaze. */
  peakBase: 0.32,
  peakPerIntensity: 0.55,
  /** Long-tail falloff exponent — lower = longer, softer skirt. */
  tailFalloff: 2.6,
  /** Breathing: ±radius and ±brightness over one slow cycle. Pulse frames
   *  are driven at half rate when the camera is still (battery, phones). */
  pulse: { periodMs: 2500, radiusAmp: 0.05, brightnessAmp: 0.1 },
  /** Weight an intensity-1 moment starts at (intensity-10 → 1.0): the
   *  gentlest feeling still visibly glows; fading continues below it. */
  weightFloor: 0.25,
  /**
   * EXPERIMENT (Ink & Glow only): feeling lights the streets around it.
   * A second glow pass multiplied by what's beneath — dark land absorbs it,
   * light street hairlines catch it, so blocks near a glow switch on and
   * fade with distance. Set gain 0 to kill the experiment.
   */
  streetlight: {
    gain: 0.5,
    radiusFactor: 1.6,
    maxRadiusPx: 300,
    tailFalloff: 1.5,
  },
} as const;

/* ------------------------------------------------------------------ */
/* THE FIELD — emotion as standing weather over the city (public map)  */
/* Contributions pool into a continuous field: hue = locally dominant  */
/* emotion, brightness = amount of feeling. No individual points.      */
/* ------------------------------------------------------------------ */
export const FIELD = {
  /** Kernel footprint in METERS (geographic; a feeling warms its area). */
  radiusM: 900,
  /** + meters per unit intensity (1..10 → up to ~60% wider). */
  radiusPerIntensityM: 55,
  /** Pixel clamps: min keeps one lonely commit a NEIGHBORHOOD bloom at
   *  every zoom (never a pin); max protects DPR-3 fill-rate. CSS px. */
  minRadiusPx: 92,
  maxRadiusPx: 300,
  /** The ambient seed's own floor: the wash is a continuous SHEET, so its
   *  kernels don't need the lonely-commit clamp — a small floor keeps the
   *  lattice overlapping at rest zoom without the 92px blobs that pooled
   *  hard enough to out-vote a real commit's hue (and cost ~26× overdraw). */
  seedMinRadiusPx: 56,
  /** Kernel falloff exponent on (1 − t²): higher = tighter heart,
   *  longer relative skirt. The edge ALWAYS reaches zero — no rims. */
  kernelSoftness: 2.0,
  /** Filmic knee: brightness = 1 − exp(−exposure · pooledWeight).
   *  Raises how fast pooled feeling brightens; never clips to white. */
  exposure: 0.78,
  /** Dominance power (the mud rule knob): hues mix by Iᵖ share in OKLab.
   *  Higher p = dominant emotion snaps harder, narrower weather fronts. */
  dominance: 5.0,
  /** Minimum front chroma as a fraction of the anchors' own chroma —
   *  fronts rotate hue but can never wash to gray (design-review fix). */
  chromaFloor: 0.62,
  /** Shared OKLab lightness for all six anchors: equal feeling = equal
   *  light (raw brand hues span L .62–.87). */
  anchorL: 0.76,
  /** Overall field gain on the additive composite. */
  gain: 0.88,
  /** Ambient-seed weight dimmer: the placeholder city is a thin translucent
   *  water layer — REAL feelings (your commit, realtime) burn through it at
   *  full strength. Applies to `seed: true` moments only. */
  seedGain: 0.38,
  /** Living tide: subtle brightness breath. */
  breath: { periodMs: 2500, amp: 0.045 },
  /** Streetlight signature: the field multiplied onto the base map so
   *  streets inside a feeling catch its color. 0 kills it. */
  streetlightGain: 0.55,
  /** Internal render-target scale (0.5 = half res — soft field, 4× cheaper). */
  resolutionScale: 0.5,
} as const;

/* ------------------------------------------------------------------ */
/* THE TRAIL — your own feelings as precise dots (the PRIVATE view).   */
/* Where the field is weather over everyone, the trail is a diary:     */
/* exact points, exact places, a week of memory, visible only to you.  */
/* ------------------------------------------------------------------ */
export const TRAIL = {
  /** The diary remembers longer than the weather: days, not hours. */
  windowDays: 7,
  /** Dot radius in px at zoom 12: base + perWeight × weight (0..1).
   *  Deliberately small — these are POINTS, the opposite of the field. */
  baseRadiusPx: 12,
  radiusPerIntensityPx: 30,
  maxRadiusPx: 96,
  zoomGrowth: 1.18,
  /** A week-old whisper still shows as a dim ember (0..1 weight floor). */
  weightFloor: 0.4,
  gain: 1.15,
  /** Dot shading: tighter core, harder falloff than the old area glow —
   *  reads as a mark on the map, not a weather cell. */
  light: {
    coreRadius: 0.3,
    corePeak: 1.25,
    coreWhiteness: 0.35,
    tailFalloff: 3.4,
    peakBase: 0.45,
    peakPerIntensity: 0.55,
  },
} as const;

/* ------------------------------------------------------------------ */
/* Device performance                                                  */
/* ------------------------------------------------------------------ */
export const PERF = {
  /** Cap the map canvas DPR: 3× iPhones render 2.25× fewer pixels at 2×,
   *  visually near-identical on a dark map. Ben's lag report, honored. */
  maxPixelRatio: 2,
  /** rAF cadence at rest (ms between pushes) — breath stays smooth. */
  restFrameMs: 66,
} as const;

/* ------------------------------------------------------------------ */
/* The commit choreography — orb burst → a beat → the city receives it */
/* ------------------------------------------------------------------ */
export const CHOREO = {
  /** Silence between the orb's burst igniting and the map bloom starting. */
  beatMs: 180,
  /** The bloom: light turning on — rise past full, then settle into breath.
   *  Overshoot is big on purpose: the field's filmic knee flattens it. */
  arrival: { durationMs: 1400, overshoot: 1.7, peakAt: 0.55 },
  /** Camera: glide to your bloom ONLY if it's off-screen (Ben's call). */
  glide: { marginPct: 0.1, durationMs: 1400 },
  /** Public ↔ private crossfade time constant (exponential settle, ms).
   *  ~3τ to rest: fast enough to feel like a switch, soft enough to breathe. */
  viewFade: { tauMs: 130 },
} as const;

/* ------------------------------------------------------------------ */
/* Recency — the map always shows NOW                                  */
/* ------------------------------------------------------------------ */
export const RECENCY = {
  /** Feelings are brightest fresh and fade to nothing over this window. */
  windowHours: 24,
  /** Hard cap on rendered moments — a loved map never becomes a slow map. */
  maxPoints: 500,
  /** How often the fade is re-derived at rest (ms). */
  refreshMs: 60_000,
} as const;

/* ------------------------------------------------------------------ */
/* Atmosphere — depth for the void. Static, composited once, no frames */
/* ------------------------------------------------------------------ */
export const ATMOSPHERE = {
  /** Edge vignette: max darkness at the corners (0 = off). */
  vignette: 0.42,
  /** Film grain opacity (0 = off). Static tile, masks gradient banding. */
  grain: 0.05,
} as const;

/* ------------------------------------------------------------------ */
/* THE palette — Ink & Glow, Ben's pick. All ink, zero saturation.     */
/*                                                                     */
/* THE BRIGHTNESS LAW: nothing on the base may outshine the dimmest    */
/* emotion glow. glow > neighborhood labels > arterials > side streets.*/
/* ------------------------------------------------------------------ */

/** INK & GLOW: near-black glass city; streets as quiet hairlines. */
export const INK = {
  bg: "#0A0B0F", // the void itself — land is the absence of feature
  water: "#06070A", // water darker than land: rivers as deep cuts
  park: "#0D0F13", // parks: the faintest lift above land (a held breath)
  building: "#12141B", // human-scale mass at street zoom — still ink
  buildingAlpha: 0.6,
  plateBase: 0.03, // neighborhood tonal plates — UNIFORM: every dark patch
  // on the map is a park or water, never an accident
  boundary: "rgba(233,236,244,0.075)", // hand-drawn seams between places
  boundaryWidth: 1.0,
  road: "#C7CBD6", // hairlines in cool gray — structure, not light
  roadAlpha: { highway: 0.26, avenue: 0.16, local: 0.09, service: 0.05 },
  roadWidth: { highway: 2.2, avenue: 1.35, local: 0.7, service: 0.45 }, // px at fade-in end
} as const;

export type CandidatePalette = typeof INK;
