/**
 * components/map/tune.ts — every tunable style/motion decision for the map,
 * in one place, commented. "Make the water darker" is a one-line edit here.
 *
 * THE ONE LAW: nothing in this file may carry saturation worth noticing.
 * The base city is ink — the five emotion hues (lib/theme.ts) are the only
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
  /** Bridges ride the earliest ramp in EVERY wave — at z13 the tiles re-cut
   *  spans into structure pieces that can land in a later class; without this
   *  a bridge fades OUT as you zoom IN (Eli: bridges vanish z12–14). */
  bridgeFade: { from: 11.2, to: 12.4 },
  /** Parks arrive by size (low sizerank = big park). Each tile zoom admits
   *  a new band of ranks, and without a fade every band POPPED in at full
   *  ink (Eli). Each rung pins the ranks that ENTER at that zoom to zero so
   *  they brush in over the next zoom level. Probed 2026-07-06: rest (z10.8)
   *  holds ranks 1–4; z11 adds 5–8; z12 adds 9–12; z13 adds 13–14; z14 adds 15. */
  parkFade: {
    ladder: [
      { zoom: 11, solid: 4, gone: 5 },
      { zoom: 12, solid: 8, gone: 9 },
      { zoom: 13, solid: 12, gone: 13 },
      { zoom: 14, solid: 14, gone: 15 },
      { zoom: 15, solid: 16, gone: 17 },
    ],
  },
  /** Buildings (mass texture). Geometry enters the tiles ~z13; the ramp
   *  starts after it has loaded so arrival never pops (Eli). */
  buildingFade: { from: 13.6, to: 15.4 },
  /** Neighborhood boundaries: present at rest, dissolving as streets take over. */
  boundaryFade: { peak: 11.0, gone: 14.5 },
  /** STREET PRESENCE — the quiet human scale at max zoom. The city was
   *  nearly empty at street level; over the last 1.5 zoom levels the quiet
   *  tiers lift into a fine hairline grid. Arterials barely move (rule 3:
   *  nothing on the base may compete with a feeling). */
  streetPresence: {
    from: 15.0,
    to: 16.5,
    boost: { highway: 1.15, avenue: 1.4, local: 1.9, service: 2.2 },
  },
  /** Building footprints: whisper-faint outlines arriving with the grid. */
  footprintFade: { from: 15.0, to: 16.5, alpha: 0.075 },
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
  /** Below the city (the journal unlocked the world): borough caps fade
   *  OUT going down too, or all five collapse onto one constellation as
   *  garbled text at world zoom (design review). */
  boroughFadeIn: { from: 8.6, to: 9.4 },
  /** Borough caps dim further when bright feeling pools beneath them —
   *  no label ever fights a feeling. Pooled weight within radiusDeg of the
   *  anchor dims alpha by up to dimMax (half-effect at halfWeight). */
  boroughFieldDim: { radiusDeg: 0.035, halfWeight: 2.5, dimMax: 0.55 },
} as const;

/* ------------------------------------------------------------------ */
/* THE ONE GLOW RECIPE (constitution rule 5): every point of light in   */
/* the product — trail candles, lab glows, the streetlight catch — is   */
/* the same lamp: tight luminous core, exponential falloff, zoom-aware  */
/* radius with min/max caps. A structureless blur is a bug.             */
/* ------------------------------------------------------------------ */
export const LAMP = {
  /** Hot core: fraction of radius that burns near-peak before falloff. */
  coreRadius: 0.26,
  /** Extra brightness of the core above the tail's own peak. */
  corePeak: 1.35,
  /** How far the core whitens toward "hot filament" (0 = pure hue). */
  coreWhiteness: 0.35,
  /** Falloff exponent — higher = tighter, more jewel-like skirt. */
  tailFalloff: 4.2,
  /** Brightness floor + intensity gain: dim moments glow, big ones blaze. */
  peakBase: 0.45,
  peakPerIntensity: 0.55,
  /** Radius curve: px at z12 × zoomGrowth^(zoom−12), clamped to caps.
   *  1.12 keeps candles crisp at mid zoom — 1.18 inflated them to fuzz. */
  zoomGrowth: 1.12,
  /** Floor: a candle never dissolves below a visible point. */
  minRadiusPx: 9,
} as const;

/* ------------------------------------------------------------------ */
/* Glow — emotion rendered as LIGHT (additive shader; LAB HARNESS ONLY */
/* — the product's area feeling is THE FIELD; its points are TRAIL).   */
/* Shape comes from LAMP; only the lab's sizing lives here.            */
/* ------------------------------------------------------------------ */
export const GLOW = {
  /** Radius in px at zoom 12: base + perIntensity × intensity (0..1). */
  baseRadiusPx: 26,
  radiusPerIntensityPx: 54,
  /** Glow grows as you approach: radius × zoomGrowth^(zoom − 12). */
  zoomGrowth: 1.24,
  /** Hard pixel ceiling — fill-rate protection for DPR-3 phones. */
  maxRadiusPx: 220,
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
  kernelSoftness: 2.5,
  /** Filmic knee: brightness = 1 − exp(−exposure · pooledWeight).
   *  Raises how fast pooled feeling brightens; never clips to white. */
  exposure: 1.05,
  /** THE LUMINOUS HEART: where density peaks, the hue itself lifts toward
   *  light (OKLab L, capped well below white) — aurora over a dark planet,
   *  never fog banks. Rides the knee output b across [from, to]. */
  heart: { from: 0.55, to: 0.95, lift: 0.1 },
  /** LAND MASK: the field clips to the coastline (rivers and harbor stay
   *  pure void; fields inherit the city's silhouette). Built by
   *  scripts/build-landmask.mjs from the neighborhood polygons; sampled in
   *  mercator space. waterAtten = what survives over open water. */
  landMask: { url: "/data/nyc-landmask.png", waterAtten: 0.12 },
  /** ZOOM NARRATIVE: wide = weather systems, mid = neighborhood pools,
   *  close = the field THINS into breathing ambient light so the city
   *  shows through (never to zero). Applies to the field + bloom passes;
   *  the streetlight stays — it IS the city glowing through. */
  zoomThin: { from: 13.0, to: 16.3, floor: 0.35 },
  /** Dominance power (the mud rule knob): hues mix by Iᵖ share in OKLab.
   *  Higher p = dominant emotion snaps harder, narrower weather fronts.
   *  Lowered in the wow pass: wider, lusher blend bands between feelings. */
  dominance: 4.0,
  /** Minimum front chroma as a fraction of the anchors' own chroma —
   *  fronts rotate hue but can never wash to gray. High on purpose: where
   *  two feelings meet, the in-between color must be BEAUTIFUL, never mud. */
  chromaFloor: 0.8,
  /** Shared OKLab lightness for all six anchors: equal feeling = equal
   *  light (raw brand hues span L .62–.87). */
  anchorL: 0.78,
  /** Overall field gain on the additive composite. */
  gain: 1.0,
  /** Ambient-seed weight dimmer: the placeholder city is a thin translucent
   *  water layer — REAL feelings (your commit, realtime) burn through it at
   *  full strength. Applies to `seed: true` moments only. */
  seedGain: 0.45,
  /** The wash is a CITY-SCALE impression: as you zoom into a neighborhood
   *  it dissolves (real commits stay). Kills the giant murky blobs a single
   *  dim seed became at street zoom (Ben's field report) — and drops ~290
   *  max-size kernels of GPU overdraw right when tiles are loading, which
   *  is most of the zoom-in stutter. */
  seedZoomFade: { from: 12.6, to: 14.0 },
  /** GLOW V2 (Eli's reference pass, 2026-07-07 — light-pollution heatmap +
   *  river basins): the fill is never flat — slow-drifting noise variation
   *  in brightness (fraction, ±amp/2 around 1). Screen-space, half-res. */
  fillNoise: { amp: 0.2, scale: 22, driftPerSec: 0.008 },
  /** TRIBUTARIES: at neighborhood zoom, ridged-noise veins brighten between
   *  a glow's heart and its edge — world-locked (they belong to the city),
   *  thinning as they leave the light. Invisible at rest zoom (LOD: the
   *  strength ramps over fromZoom→toZoom; below it the branch costs 0). */
  veins: { fromZoom: 12.2, toZoom: 14.0, gain: 0.5, cellPx: 26, ridge: 0.82, sharp: 1.6 },
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
  /** Caps on the LAMP zoom curve: candles stay jewels, never fuzz. */
  maxRadiusPx: 64,
  /** A week-old whisper still shows as a dim ember (0..1 weight floor). */
  weightFloor: 0.4,
  /** Freshness floor for entries OLDER than the window: the journal is
   *  forever — an old spark settles to this steady ember, never to zero. */
  emberFloor: 0.35,
  gain: 1.15,
  /** The paper-day stain is a MARK, not a glow (Ben: the glow tail read as
   *  180p blur). Real watercolor: flat wash to `edge` of the radius with a
   *  short hand-soft feather (0.74 read as blur — Eli), pigment pooling
   *  `ring` deeper at the rim, and a `heart` faintly lighter at the center
   *  (water pushes pigment outward as it dries) so it never reads as a disc. */
  stain: { edge: 0.88, ring: 0.28, radiusScale: 0.85, gainBoost: 1.25, heart: 0.12 },
  /** THE JOURNAL EXTRAS (2026-07-07): the candle keeps the LAMP's core and
   *  falloff — but its SILHOUETTE is free-form (Eli: "less circular").
   *  These are only what a journal adds: the living-blot wobble, memory
   *  rings, and world-scale constellations. */
  spark: {
    /** Max inward dent of the silhouette (fraction of radius). 0 = circle;
     *  ~0.4 = a clearly organic, slowly-shifting blot, unique per entry. */
    wobble: 0.42,
    /** A named star: entries carrying a memory wear a delicate ring. */
    ring: { radiusFactor: 1.55, widthPx: 1.2, alpha: 130 },
    /** Constellations: below this zoom, nearby sparks gather into one
     *  breathing point sized by how many it holds (grid ≈ cellPx). */
    cluster: { belowZoom: 10.5, cellPx: 72, baseRadiusPx: 10, radiusPerLog2: 7, maxRadiusPx: 44 },
    /** Count whisper beside a constellation. */
    countLabel: { sizePx: 10.5, alpha: 120 },
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
/* THE SHAPE OF FEELING — how the field draws emotion (Look panel).    */
/* All four are the same shader; a mode is just uniform values, so     */
/* switching is instant and free. Units: warpAmp is a fraction of the  */
/* screen the edges may wander; scale is noise cells across the width; */
/* drift is how fast the flow crawls; streak stretches the flow along  */
/* one axis (0 = round, 1 = fully ribboned); band modulates brightness */
/* into aurora curtains (0 = off).                                     */
/* ------------------------------------------------------------------ */
export const SHAPES = {
  /** The original: soft circular blooms, edges untouched. */
  bloom: { warpAmp: 0, scale: 8, drift: 0, streak: 0, band: 0 },
  /** Ink on wet paper: blotted, seeping edges; barely-moving weather.
   *  warpAmp raised 2026-07-06: silhouettes come from data + geography,
   *  never perfect circles (constitution / phase 3). */
  watercolor: { warpAmp: 0.085, scale: 10, drift: 0.01, streak: 0, band: 0 },
  /** Drops dispersing in water: streakier, curling, visibly alive. */
  ink: { warpAmp: 0.095, scale: 14, drift: 0.05, streak: 0.5, band: 0 },
  /** Northern lights: feeling stretched into flowing ribbons. */
  aurora: { warpAmp: 0.09, scale: 6.5, drift: 0.02, streak: 0.9, band: 0.5 },
} as const;

/* ------------------------------------------------------------------ */
/* Solar drift — the ink follows the real sun. Three intensities       */
/* (Look panel): subtle keeps the original whisper; bold is unmissable */
/* at a glance; sky lets the map take on real sky color (the one mode  */
/* allowed to bend the ink-only law — Eli's call, 2026-07-02).         */
/* Night is INK itself in every mode, untouched.                       */
/* ------------------------------------------------------------------ */
export const SOLAR = {
  /** THE PARKED DAY (constitution rule 1: Warmth is always night).
   *  false = the product: time of day modulates the dark canvas via
   *  nightDay/nightEmber below, and `paper` is clamped to 0 so every
   *  pigment path sleeps. true (or `?daylight=1`) = the 2026-07-02
   *  paper-day look, kept compiling so it can return (docs/later.md). */
  dayMode: false,
  /** Always-night tonal modulation: what "daytime" does to the dark canvas
   *  when dayMode is off — a slightly lifted, warmed charcoal. Midnight is
   *  the frozen INK itself; the sun's `light` blends toward these. */
  nightDay: { bg: "#17161A", water: "#0A0A0E", park: "#1C1B20", building: "#1E1D24", road: "#D2D3DA" },
  /** …and dawn/dusk: a gentle warm tint riding the ember ramp — a breath
   *  of amber in the charcoal, never the paper-transition brown. */
  nightEmber: { bg: "#191412", water: "#0B0808", park: "#1E1813", building: "#211A14", road: "#D8CCBC" },
  /** Master dial: 0 kills the effect entirely, 1 = full. */
  strength: 1,
  /** Sun elevation (deg) across which night becomes day. Starts at civil
   *  twilight (−6°), lands at mid-morning sun (10°) — the blend spans the
   *  real dawn, so there is never a moment of switching. */
  dayRamp: { from: -6, to: 10 },
  /** The ember rises through late twilight and burns off as the sun
   *  climbs — nonzero only around sunrise and sunset. */
  emberRamp: { rise: { from: -8, to: -1 }, fade: { from: 3, to: 11 } },
  /** Re-apply the graded ink this often (12 paint sets — trivial); paint
   *  eases over transitionMs on top of the atmosphere's own easing.
   *  transitionMs === updateMs so the pulses CHAIN — and the cadence is
   *  FINE (1s, was 2.5s): a preview jump is a smooth ramp, not three
   *  visible pulses (Ben: switching should be smoother). */
  updateMs: 1_000,
  transitionMs: 1_000,
  /** Paper (glow→pigment handoff) rides a LATER ramp than the base ink:
   *  the glow holds full strength through the ember twilight and pigment
   *  takes over only once the ground is genuinely light (design-review). */
  paperRamp: { from: 2, to: 8 },
  /** THE palette pair (no modes — the app has one default; Ben, 2026-07-05):
   *  true Apple-Maps day/night. By day the city is light paper, streets
   *  white, water a soft cool gray-blue; twilight passes through a warm
   *  mid-dark ember on its way to the ink night. Emotion is watercolor
   *  pigment on the paper (FieldLayer uMode 2), glow on the night ink.
   *  Deepened 2026-07-06 (Ben: "so bright and white you can't see roads") —
   *  the ground dropped a step so the white road network actually reads,
   *  water holds real weight, parks are visibly green-gray. */
  day: { bg: "#DFE2E8", water: "#B7C4D6", park: "#CDD8CA", building: "#D2D5DD", road: "#FDFDFE" },
  ember: { bg: "#3A2C26", water: "#241A16", park: "#40332B", building: "#4A3A30", road: "#E8C9A4" },
  /** Day roads: the night opacities (0.05–0.26) are hairline whispers that
   *  vanish on paper — white-on-white was Ben's report. By day the road
   *  network brightens toward Apple-Maps presence; the boost rides `paper`
   *  continuously through applyAtmosphereInk. ×4 ≈ full white arterials. */
  dayRoadBoost: 3.2,
  /** …and WIDENS: the width curve is tuned for night hairlines, and at
   *  mid-zoom on paper a 1.5px 83%-white line dissolves — the "bridge
   *  disappears" dead zone. Day mass, night hairlines, same curve. */
  dayRoadWiden: 1.55,
} as const;

/* ------------------------------------------------------------------ */
/* THE LIVING ATMOSPHERE — the map reflects the real weather outside.  */
/* Not a mode: one continuously-eased state (lib/atmosphere.ts) that   */
/* every visual reads. All mappings are SUBTLE — you notice the vibe,  */
/* never the trick. Full plan: docs/atmosphere-plan.md.                */
/* ------------------------------------------------------------------ */
export const WEATHER = {
  /** Open-Meteo refetch cadence (free, keyless; NYC coords like solar). */
  refetchMs: 15 * 60_000,
  /** Exponential ease for every atmosphere value: real weather rolls in
   *  like weather (~20s to settle a big change); nothing ever switches. */
  easeTauMs: 6_000,
  /** Under a dev-preview override the ease runs fast (~6s to settle) —
   *  Ben toggles to SEE, not to wait (his field report, 2026-07-06). */
  previewTauMs: 1_800,

  /* CONSTITUTION RULE 2 (2026-07-06): weather modulates the BASE MAP ONLY.
   * The old field couplings (cloudFieldDim, cloudSoften, wetStreak, wetWarp,
   * snowDriftSlow, snowSparkle, and the field-pass fog dim) are GONE — the
   * emotion layer renders identically in every sky. Wind still drives the
   * field's living flow: it is the field's own breath, not a sky state. */

  /* -- overcast: the sky's gray weight (base ink only) ---------------- */
  cloudDesat: 0.32, // base-ink desaturation at full overcast
  cloudDayDim: 0.1, // parked-day paper darkens a touch under clouds

  /* -- fog: the milk-glass veil (base ink; streetlight catch only) ----- */
  fogLift: 0.42, // base ink lifts toward the mist color
  fogStreetDim: 0.22, // the veil dims what the STREETS catch — never the field
  fogMist: { night: "#20242C", day: "#DFE3E9" },

  /* -- rain: glistening streets (base response) ------------------------ */
  wetWaterDarken: 0.16, // rivers deepen in the rain
  glistenGain: 0.8, // streetlight boost on wet nights (×1+this×wet)

  /* -- snow: the hush (base ink only) ---------------------------------- */
  snowDayCool: 0.35, // parked-day paper toward cold bright white
  snowNightLift: 0.06, // ink lifts a breath (snow-lit sky)

  /* -- wind: the flow follows the real air --------------------------- */
  windWarp: 0.05, // + warp amplitude at full wind
  windDrift: 0.06, // + drift speed at full wind
  windStreak: 0.35, // anisotropy along the real wind axis

  /* -- the night sky (v2): weather must READ at night ----------------- */
  /** Overcast night: real cities glow under clouds — the ink lifts toward
   *  a warm sky-glow instead of staying void-black. */
  skyGlow: { color: "#231F1A", lift: 0.5 },
  /** Moonlight: clear nights take a faint cool wash, scaled by the moon's
   *  illuminated fraction while it's up (suncalc). */
  moonLift: { color: "#131722", weight: 0.55 },

  /* -- bloom (v2): feeling blooms real light into the night ---------- */
  bloom: {
    gain: 0.7, // strength of the halo pass (night only; 0 kills it)
    /** Above the ambient wash (~0.22 pooled), below pockets (~0.46) and
     *  commits (~0.66): concentrated feeling blooms, the wash never does —
     *  the darkness between the lights is what makes the lights read. */
    threshold: 0.26,
    scale: 0.25, // blur-target scale vs field target (quarter = soft+cheap)
  },

  /* -- precipitation (v2): visible weather between you and the city --- */
  precip: {
    count: 320, // instanced streaks/flakes — capped, fill-rate friendly
    rain: { speed: 1.1, lengthPx: 46, widthPx: 1.4, alpha: 0.20, windTilt: 0.55 },
    snow: { speed: 0.12, sizePx: 3.2, alpha: 0.5, sway: 0.35 },
    /** Streaks are pale light on the ink night, graphite mist on paper. */
    night: "#C9D2E4",
    day: "#5A6478",
  },

  /* -- rain sound v3 (patter under everything; gesture-unlocked) ------ */
  /** Two detuned copies of one LONG noise bed (their loop points drift
   *  apart, so the repeat is inaudible — v2's 0.5s loop read as a cycle,
   *  Ben's report), gusts as slow FILTER drift (gain wobbles read as ocean
   *  waves — same report), and randomized droplet ticks so it's rain on
   *  YOUR window, never a texture. */
  rainSound: {
    maxGain: 0.045,
    bedSeconds: 6, // noise bed length; second copy at detune rate
    detune: 0.913, // playbackRate of copy #2 (irrational-ish vs 1.0)
    breathDepth: 0.08, // tiny residual gain breath (was 0.35 = waves)
    breathHz: 0.11,
    /** Gusts: the window-glass lowpass wanders instead of the volume. */
    filterBaseHz: 2200,
    filterWetHz: 1100, // + cutoff at full wet (harder rain = brighter hiss)
    driftHz: [0.071, 0.023], // two incommensurate wander rates
    driftDepthHz: [320, 520],
    /** Droplets: sparse bandpassed ticks, panned, level-scaled. */
    droplet: { gain: 0.05, minMs: 70, maxMs: 380, bandHz: [1400, 4200], decayS: [0.02, 0.06] },
  },

  /* -- storm (v3): lightning + thunder ------------------------------- */
  /** Real thunderstorms (WMO 95/96/99, or the panel's storm preset) flash
   *  the sky and answer with distant thunder. Sparse and felt, never a
   *  strobe: strikes seconds-to-a-minute apart, thunder delayed like it's
   *  streets away. Flash is one composited opacity layer — costs nothing. */
  lightning: {
    /** Seconds between strikes at full storm (randomized ±50%). */
    intervalS: [8, 26],
    /** First strike lands quickly once a storm settles in — the arrival. */
    firstS: [2.5, 7],
    flashAlphaNight: 0.16,
    flashAlphaDay: 0.05, // daylight swallows lightning; a breath, no more
    /** Thunder trails the flash like distance (seconds). */
    thunderDelayS: [1.4, 4.5],
    thunderGain: 0.055,
  },
} as const;

/* ------------------------------------------------------------------ */
/* THE palette — Ink & Glow, Ben's pick. All ink, zero saturation.     */
/*                                                                     */
/* THE BRIGHTNESS LAW: nothing on the base may outshine the dimmest    */
/* emotion glow. glow > neighborhood labels > arterials > side streets.*/
/* ------------------------------------------------------------------ */

/** INK & GLOW: near-black glass city; streets as quiet hairlines. */
export const INK = {
  /** The land tone carries what the neighborhood plates used to add: the
   *  plates ride a polygon file with GAPS (Stuy Town, plazas, slivers
   *  between NTAs), and every gap read as a hard-edged darker patch after
   *  dark (Ben: "weird shapes of darkness"). The ground itself is lifted
   *  instead — gapless by construction — and the plates drop to a whisper. */
  bg: "#0E0F14", // the land — one even ink, no polygon seams
  water: "#06070A", // water darker than land: rivers as deep cuts
  park: "#12141A", // parks: the faintest lift above land (a held breath)
  building: "#151720", // human-scale mass at street zoom — still ink
  buildingAlpha: 0.6,
  plateBase: 0.01, // neighborhood tonal plates — now just a breath of
  // landmass identity; every dark patch is a park or water, never a gap
  boundary: "rgba(233,236,244,0.075)", // hand-drawn seams between places
  boundaryWidth: 1.0,
  road: "#C7CBD6", // hairlines in cool gray — structure, not light
  roadAlpha: { highway: 0.26, avenue: 0.16, local: 0.09, service: 0.05 },
  roadWidth: { highway: 2.2, avenue: 1.35, local: 0.7, service: 0.45 }, // px at fade-in end
} as const;

export type CandidatePalette = typeof INK;
