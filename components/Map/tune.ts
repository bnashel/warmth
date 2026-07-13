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
  corePeak: 1.25,
  /** How far the core whitens toward "hot filament" (0 = pure hue).
   *  Dropped for the woven wash (2026-07-08): the finish is MATTE — the
   *  core burns in the hue's own light, never toward glassy white. */
  coreWhiteness: 0.12,
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
  /** Kernel footprint in METERS — ELI'S DIAL (has ranged 1/16 → 1/8 mile,
   *  may yet go toward 1/2; retune HERE, one line). Currently 1/8 mile:
   *  entries read as present local glows that genuinely overlap where
   *  people cluster — the density-to-intensity read is the product's
   *  coolest moment and needs real overlap to exist. The WASH layer
   *  below carries the between-space so the city never fragments. */
  radiusM: 200,
  /** + meters per unit intensity (1..10 → up to ~2.4× wider). */
  radiusPerIntensityM: 30,
  /** Pixel clamps: min keeps one lonely commit visibly present at every
   *  zoom (a tight ember, no longer a whole-neighborhood bloom); max
   *  protects DPR-3 fill-rate. CSS px. */
  minRadiusPx: 38,
  maxRadiusPx: 300,
  /** THE UNDER-WASH, disciplined (Eli round-2, 2026-07-08): the lattice
   *  no longer carries a continuous glowing field — "the void is gone and
   *  nothing reads as special." It survives only as faint pooling that
   *  darkness (FIELD.floor) mostly swallows; the city at rest is NIGHT
   *  with distinct luminous islands. Footprint cut (56→44px floors were
   *  inflating each splat to ~1.8 km at rest, pooling 4-6 deep). */
  wash: { radiusM: 900, minRadiusPx: 44, gain: 0.26 },
  /** Kernel falloff exponent on (1 − t²): higher = tighter heart,
   *  longer relative skirt. The edge ALWAYS reaches zero — no rims. */
  kernelSoftness: 2.5,
  /** Filmic knee: brightness = 1 − exp(−exposure · pooledWeight).
   *  Raises how fast pooled feeling brightens; never clips to white.
   *  Raised 2026-07-08 (Eli: brighter, still warm/matte) — with the knee
   *  and the never-white cap, extra exposure deepens the DENSITY read:
   *  stacked feeling climbs visibly faster than a lone entry. */
  exposure: 1.2,
  /** THE DARKNESS BUDGET (Eli round-2, 2026-07-08): below `from` pooled
   *  feeling the land stays night; full presence by `to`. Kills the
   *  wall-to-wall carpet at rest — most of the city is dark and feelings
   *  are luminous islands (the mid-zoom look, now at every zoom). Sits on
   *  pooled TOTAL right after the knee, so tiers/heart/grain inherit it.
   *  Reference pooled weights: lone wash splat ≈ 0.12, wash pooling ≈
   *  0.2-0.3, pocket seeds ≈ 0.3-0.5, fresh real commit ≈ 0.75. */
  floor: { from: 0.09, to: 0.3 },
  /** THE LUMINOUS HEART: where density peaks, the hue itself lifts toward
   *  light (OKLab L, capped well below white) — aurora over a dark planet,
   *  never fog banks. Rides the knee output b across [from, to]. Lift
   *  halved for the woven wash: matte depth, not a glassy hot spot. */
  /** Lift raised 2026-07-08: where entries STACK, the pooled heart must
   *  read obviously warmer and more alive — the density payoff. Still
   *  hard-capped by the never-white ceiling. */
  heart: { from: 0.5, to: 0.92, lift: 0.09 },
  /** LAND MASK: the field clips to the coastline (rivers and harbor stay
   *  pure void; fields inherit the city's silhouette). Built by
   *  scripts/build-landmask.mjs from the neighborhood polygons; sampled in
   *  mercator space. waterAtten = what survives over open water. */
  landMask: { url: "/data/nyc-landmask.png", waterAtten: 0.12 },
  /** ZOOM NARRATIVE: wide = weather systems, mid = neighborhood pools,
   *  close = the field THINS into breathing ambient light so the city
   *  shows through (never to zero). Applies to the field + bloom passes;
   *  the streetlight stays — it IS the city glowing through. */
  /** Floor raised 2026-07-08 (was 0.35): approaching a cluster must make
   *  it MORE intense, never thinner — the zoom narrative now only takes
   *  the field down to a strong ambient, and density does the talking. */
  zoomThin: { from: 13.0, to: 16.3, floor: 0.55 },
  /** CLOSE-ZOOM GRAIN (2026-07-08): fine geographic texture inside the
   *  glow — anchored in mercator space (meters, not pixels), so zooming
   *  in reveals real structure instead of a scaled-up blur. Fades in
   *  across zoomIn; amp is brightness modulation (matte, never sparkle);
   *  cellM is the coarsest cell (fbm adds 2 finer octaves below it). */
  grain: { amp: 0.16, cellM: 260, zoomIn: { from: 12.0, to: 14.0 } },
  /** Dominance power (the mud rule knob): hues mix by Iᵖ share in OKLab.
   *  Higher p = dominant emotion snaps harder, narrower weather fronts.
   *  Lowered for the woven wash (2026-07-08): wide melding fronts — the
   *  weave threads give them fabric, the chroma floor keeps them COLOR, so
   *  neighbors flow into each other with no seam and no mud. (2.2 washed
   *  whole boroughs toward one mauve average — regions lost their names.) */
  dominance: 2.8,
  /** LOW-DENSITY DOMINANCE (round 2, item 2b): in thin connective tissue
   *  the local winner takes the pixel (power p — the emotion stays
   *  nameable, never averaged soup); the woven `dominance` above takes
   *  over as pooled total climbs from→to. */
  dominanceLow: { p: 4.6, from: 0.1, to: 0.4 },
  /** Minimum front chroma as a fraction of the anchors' own chroma —
   *  fronts rotate hue but can never wash to gray. High on purpose: where
   *  two feelings meet, the in-between color must be BEAUTIFUL, never mud. */
  chromaFloor: 0.8,
  /** Shared OKLab lightness for all six anchors: equal feeling = equal
   *  light (raw brand hues span L .62–.87). */
  anchorL: 0.78,
  /** Anchor chroma push (2026-07-08, Eli: "pop more, never neon"): the
   *  five hues carry a touch more pigment. Rides every path — the field,
   *  the fronts (chromaFloor is relative to the boosted anchors), the
   *  streetlight catch. 1 = the raw First Light palette. */
  anchorChroma: 1.15,
  /** Overall field gain on the additive composite. Trimmed 1.15→0.95 in
   *  round 2: brightness now scales the LINEAR color (gamma-correct), which
   *  reads brighter at the same number — the trim keeps peaks where Eli
   *  left them while dims stay hue-true instead of olive. */
  gain: 0.95,
  /** Pocket-seed weight dimmer: the placeholder neighborhood moods sit
   *  below any real feeling — a commit burns through at full strength.
   *  (The lattice wash has its own, quieter gain: FIELD.wash.gain.) */
  seedGain: 0.45,
  /** The wash is a CITY-SCALE impression: as you zoom into a neighborhood
   *  it thins (real commits stay). Kills the giant murky blobs a single
   *  dim seed became at street zoom (Ben's field report) — and drops most
   *  of the wash's GPU overdraw right when tiles are loading. `floor` keeps
   *  a quiet ambient base at street zoom: no place ever reads as a void
   *  (Eli, 2026-07-08 — was 0, which re-opened dead space up close). */
  /** Pushed later + shallower 2026-07-08 (medium-zoom valley): the wash
   *  was dropping exactly where entries were still small, opening dead
   *  gaps at z12.5–13.5. It now holds full through the middle distance
   *  and settles higher, so the ground never falls out of the picture. */
  seedZoomFade: { from: 13.2, to: 14.8, floor: 0.38 },
  /** THE HELD BREATH: master multiplier on every flow clock (drift,
   *  shimmer, weave, crawl, curtains, ripples). 1 = the old nervous
   *  pace; 0.22 = alive only if you watch (Eli's pick, 2026-07-09). */
  tempo: 0.22,
  /** POOLS BREATHE SOLO (Eli, 2026-07-09: uniform stillness read as
   *  dead): each island inhales/exhales on its own slow rhythm, seeded
   *  by WHERE it is (cellM noise cells), out of phase with neighbors —
   *  at any moment some pool is quietly alive while the rest rest.
   *  periodMs is the BASE; each pool lands on 0.7-2.2× of it. */
  breath: { periodMs: 11000, amp: 0.06, cellM: 1600 },
  /** THE PULSE OF ARRIVAL: each new feeling sends one slow luminous
   *  ring outward from its exact spot, then dissolves — a raindrop on
   *  the pond; you see the city being felt in. Real commits ripple via
   *  new-id detection; until realtime lands, the ambient city re-pulses
   *  one seed every everyS (clearly-labeled placeholder life). */
  ripple: { lifeMs: 5500, spanM: 850, widthM: 140, gain: 0.14, everyS: [14, 26] },
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
  /** Quieted 2026-07-08 (Eli: the private view rendered too LOUD for an
   *  intimate space) — same matte, non-neon bar as the public field. */
  gain: 0.8,
  /** The paper-day stain is a MARK, not a glow (Ben: the glow tail read as
   *  180p blur). Real watercolor: flat wash to `edge` of the radius with a
   *  short hand-soft feather (0.74 read as blur — Eli), pigment pooling
   *  `ring` deeper at the rim, and a `heart` faintly lighter at the center
   *  (water pushes pigment outward as it dries) so it never reads as a disc. */
  stain: { edge: 0.88, ring: 0.28, radiusScale: 0.85, gainBoost: 1.25, heart: 0.12,
    /** PIGMENT EMBER (paper world): the heart pools DEEPER, not lighter —
     *  a memory soaks in. */
    heartPool: 0.3 },
  /** THE EMBER (round 2, item 3 — the agreed middle between candle and
   *  ink). Primary private rendering: an id-seeded sea-glass silhouette
   *  (2-4 gentle undulations, ±~18%, FROZEN forever — a memory has a
   *  shape the way a pebble does) with a soft warm heart glowing slightly
   *  off-center. Two passes: a matte body (overlaps DEEPEN) and a dim
   *  additive heart (repeat places WARM). `?trail=splat` shows the old
   *  matte-gem renderer for the side-by-side judging; the loser gets
   *  deleted after Ben + Eli decide on phones. */
  renderer: "ember" as "ember" | "splat",
  ember: {
    /** Body edge feather start (fraction of the shaped radius). */
    edge: 0.8,
    /** Heart falloff radius + off-center reach (fractions of the shape). */
    heartR: 0.5,
    heartOff: 0.22,
    /** Heart hue lift toward warm candle-white on the additive pass. */
    warmth: 0.35,
    /** Body alpha gain and the dim additive heart gain — between the old
     *  unlit stains and the too-bright candles. */
    bodyGain: 0.95,
    /** Trimmed 0.3→0.22 (design review): 25 stacked hearts read milky at
     *  0.3 — deepen and warm, never wash pale. */
    heartGain: 0.22,
  },
  /** THE MEMORY NODE (2026-07-08 redesign; now the `?trail=splat` judging
   *  alternative): a matte pigment gem — solid hue at pigment depth with a
   *  darker rim (sealing-wax edge), a small pure-hue glint at the heart,
   *  and the living-blot silhouette. ZERO white anywhere in the node. */
  node: {
    /** Solid to this fraction of the radius, then a short soft edge. */
    edge: 0.86,
    /** How much darker the pigment pools at the rim (0..1). */
    rim: 0.34,
    /** Pure-hue glint at the heart (additive within the matte pass). */
    glint: 0.5,
  },
  /** THE THREAD (round 2, item 4 — Ben + Eli: the always-on beaded
   *  network is gone). ONE continuous quiet path through the moments in
   *  time order, revealed on entering the private view, then gone.
   *  `affordance` is Ben's pick between the two proposals:
   *    "onEnter" — draws once softly on entering private, holds, fades
   *                (current: zero new chrome);
   *    "control" — a small quiet "thread" chip toggles it (build on pick).
   *  Geometry keeps the aurora's good bones: Catmull-Rom with adaptive
   *  tautness + a gentle meander, as one multi-vertex path (no beads). */
  thread: {
    affordance: "onEnter" as "onEnter" | "control",
    widthPx: 2,
    /** Peak opacity of the quiet line (whisper-ink, never a ribbon). */
    alpha: 0.22,
    subdiv: 12,
    tautness: 0.72,
    /** Perpendicular meander, near-zero on purpose: repeat trips (home ↔
     *  work) must lie on the SAME worn path — one footpath deepened by
     *  use, never a braid of strands (0.12 read as a cable). */
    meander: 0.03,
    /** The reveal envelope: inhale, hold a breath, exhale. */
    inMs: 900,
    holdMs: 3600,
    outMs: 1400,
  },
  /** THE JOURNAL EXTRAS (2026-07-07): the candle keeps the LAMP's core and
   *  falloff — but its SILHOUETTE is free-form (Eli: "less circular").
   *  These are only what a journal adds: the living-blot wobble, memory
   *  rings, and world-scale constellations. */
  spark: {
    /** Max inward dent of the silhouette (fraction of radius). 0 = circle;
     *  ~0.4 = a clearly organic, slowly-shifting blot, unique per entry. */
    wobble: 0.42,
    /** THE WOVEN WASH in the journal (2026-07-08): the spark's skirt
     *  settles into this many translucent tiers — the same layered matte
     *  depth as the public field, at diary scale. 0 = smooth skirt. */
    tiers: 3,
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
  /** THE PAPER WORLD material: the grain becomes the sheet's TOOTH (dark
   *  fibers, multiply blend) and the vignette warms — desk light, not void. */
  paper: { grain: 0.14, vignette: 0.3 },
} as const;

/* ------------------------------------------------------------------ */
/* THE SHAPE OF FEELING — how the field's edges move. One shape now:   */
/* the woven wash (Eli's silk+pigment merge, 2026-07-08). Units:       */
/* warpAmp is a fraction of the screen the edges may wander; scale is  */
/* noise cells across the width; drift is how fast the flow crawls;    */
/* streak stretches the flow along the wind (0 round, 1 ribboned);     */
/* band modulates brightness into slow luminous curtains (0 = off).    */
/* ------------------------------------------------------------------ */
/** THE HELD BREATH (Eli, 2026-07-09): one master tempo on every flow
 *  clock — drift, shimmer, weave, crawl, curtains, ripples. The field is
 *  nearly still; you sense it's alive only after a few seconds. (The 2.5s
 *  breath heartbeat rides the unscaled clock at a whisper amp.) */
// tempo lives in FIELD (FIELD.tempo) so the shader plumbing stays in one place.

/* ------------------------------------------------------------------ */
/* THE LOOKS — the 2026-07-09 bake-off (Eli: "the aesthetic isn't       */
/* working; give me options"). Four genuinely different artistic        */
/* directions, all geographic (warpM/cellM are METERS — the texture     */
/* belongs to the city and zooms with it), all held-breath slow, all    */
/* the same shader: switching is instant (?look= or the dev pill).      */
/* Judged on phones; the winner becomes THE look, losers to later.md.   */
/* ------------------------------------------------------------------ */
export const LOOKS = {
  /** STILL WATER — luminous pools that barely breathe. Depth and color
   *  instead of motion: koi pond at night. */
  "still-water": {
    warpM: 240, cellM: 2400, drift: 0.003, streak: 0.1, band: 0,
    shimmer: 0.1, weaveAmp: 0.25,
    ripple: { amp: 0, rings: 0, speed: 0 },
  },
  /** LIVING WATER — Eli's instinct: one dark sheet over the whole city;
   *  feeling disturbs it. Slow rings ride the density contours and
   *  interfere where feelings meet. */
  "living-water": {
    warpM: 260, cellM: 2400, drift: 0.004, streak: 0.15, band: 0,
    shimmer: 0.12, weaveAmp: 0.3,
    ripple: { amp: 0.13, rings: 3.0, speed: 0.22 },
  },
  /** INK IN WATER — pigment curling and diffusing in a glass; motion you
   *  only notice when you stare. Strong organic warp, near-zero drift. */
  ink: {
    warpM: 620, cellM: 1500, drift: 0.006, streak: 0.2, band: 0,
    shimmer: 0.2, weaveAmp: 0.5,
    ripple: { amp: 0, rings: 0, speed: 0 },
  },
  /** AURORA — curtains of light hanging over neighborhoods, swaying on
   *  the wind axis. Vertical shimmer instead of blobs. */
  aurora: {
    warpM: 420, cellM: 3200, drift: 0.008, streak: 0.85, band: 0.55,
    shimmer: 0.3, weaveAmp: 0.35,
    ripple: { amp: 0, rings: 0, speed: 0 },
  },
} as const;
export type LookName = keyof typeof LOOKS;
export const DEFAULT_LOOK: LookName = "still-water";

/* ------------------------------------------------------------------ */
/* THE WOVEN WASH — the field's one identity (Eli's pick, 2026-07-08:  */
/* silk's living color motion through pigment's layered matte depth).  */
/* From SILK: the hue itself flows with the field's motion (shimmer),  */
/* and neighboring feelings INTERLEAVE in threads where they meet      */
/* (weave) instead of averaging. From PIGMENT: pooled feeling settles  */
/* into translucent tiers with a breath of edge-darkening at every     */
/* contour (tiers) — depth from stacked layers, matte, never glassy.   */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* THE PAPER WORLD's PIGMENT (?world=paper) — feelings soak the sheet: */
/* saturation instead of luminance, watercolor physics throughout.     */
/* All inert in the night world (the pigment pass never runs there).   */
/* ------------------------------------------------------------------ */
export const PIGMENT = {
  /** Pigment color: OKLab L + chroma push. L below the old 0.64 and
   *  chroma above 1.35 = wetter, fresher pigment (the old values sent
   *  joy's lemon toward olive on bone). */
  L: 0.6,
  chroma: 1.5,
  /** Stain ceiling + slope (was 0.58/0.8 literals): emotionally loud,
   *  never neon, never a bruise. */
  cap: 0.66,
  slope: 0.9,
  /** GRANULATION: watercolor granules in mercator METERS — pigment
   *  settling into the sheet's tooth, loudest at a wash's wet edge
   *  (the b-band below), rising as you approach (rides the grain zoom
   *  smoothstep ×zoomBoost). */
  gran: {
    amp: 0.38,
    cellM: 90,
    edgeIn: [0.03, 0.14] as const,
    edgeOut: [0.4, 0.7] as const,
    zoomBoost: 1.8,
  },
  /** SLATE LUMINANCE: at slate hours the pigments pick up faint light —
   *  a screen-blend whisper crossfaded by (1 − sun). Ink under moonlight. */
  slateLum: 0.2,
  /** THE INK DROP (commit 3): a commit blooms as spreading pigment.
   *  own = ring strength for YOUR commit; fill = the blot behind the
   *  front; rim = the darker wet edge pooling ahead of it; labPull =
   *  how hard the drop drags local hue toward its feeling. */
  drop: { own: 2.4, ringStain: 1.6, fill: 0.5, rim: 0.45, labPull: 0.6 },
  /** Paper-only hue overrides (Eli, 07-13): joy's brand lemon goes muddy
   *  as pigment on bone — on the sheet it is true sun-yellow. Night hues
   *  are untouched. */
  hues: { joy: "#F2C010" } as Partial<Record<string, string>>,
} as const;

export const WOVEN = {
  /** Thread interleave at emotion fronts: amp = how far a thread can
   *  tilt the local vote; scale = threads across the screen width. */
  weave: { amp: 0.6, scale: 11 },
  /** Hue flow along the wind axis (max OKLab rotation, radians): the
   *  color genuinely moves — motion is never just alpha. */
  shimmer: 0.35,
  /** DATA-DRIVEN MOTION (Eli, 2026-07-08): the colors-interacting effects
   *  (shimmer + weave) only run where two feelings GENUINELY overlap in
   *  the pooled data. Gate = runner-up emotion's local intensity as a
   *  share of the leader's, smoothstepped across [from, to]: below from,
   *  a blob is alone and its hue holds perfectly still; above to, a true
   *  meeting of feelings flows at full strength. */
  overlap: { from: 0.12, to: 0.45 },
  /** Layered matte depth: count = translucent tiers; rim = pigment
   *  pooling darker along each contour; richen = deep pools carry more
   *  pigment (more chroma, slightly deeper — matte); crawl = how far
   *  the contours wander, like paint still deciding where to dry;
   *  keep = how much of the tiering shows over the live wash beneath
   *  (1 = full posterization, 0 = none). */
  /** Round 2, item 2a: rim 0.16→0.05 (the dark ring at every contour WAS
   *  the banding), crawl 0.05→0.22 (contours wander — no closed circles),
   *  keep 0.85→0.5 (tiering is texture over the live wash, not structure).
   *  The step transition also widened in the shader (0.35-0.65 → 0.12-0.88). */
  tiers: { count: 5, rim: 0.05, richen: 0.55, crawl: 0.22, keep: 0.5 },
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
  /** THE PAPER WORLD sky trio (?world=paper): the sheet itself follows the
   *  sun — gradeInk blends paperNight → paperNoon by `light`, warmed by
   *  paperDusk on the ember. paperNight.bg stays ≥ ~0x40 luminance: the
   *  pigment multiply needs a light-enough ground; the slate-hours
   *  luminance pass carries the rest. */
  paperNoon: { bg: "#EAE3D3", water: "#C2C8C6", park: "#E0DCC6", building: "#DFD7C4", road: "#2E2B25" },
  paperDusk: { bg: "#C9B2AE", water: "#9E979E", park: "#BFAC9E", building: "#C2ABA4", road: "#382B26" },
  paperNight: { bg: "#42464F", water: "#2F323A", park: "#3E4340", building: "#464B55", road: "#14161B" },
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
  windWarpM: 110, // + warp amplitude at full wind, METERS (geographic flow)
  windWarp: 0.02, // retired uv-space value (kept for the parked day refs)
  // (trimmed 2026-07-08:
  // even at full storm, no feeling may visibly leave its place)
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
    gain: 0.35, // halo strength — halved for the woven wash (2026-07-08):
    // the finish is MATTE; the halo is a whisper of night air, never gloss
    /** Above the ambient wash (~0.22 pooled), below pockets (~0.46) and
     *  commits (~0.66): concentrated feeling blooms, the wash never does —
     *  the darkness between the lights is what makes the lights read. */
    threshold: 0.32, // raised with the gamma-correct output (dims got brighter);
    // the blur now soft-knees around it instead of hard-subtracting (item 2a)
    scale: 0.25, // blur-target scale vs field target (quarter = soft+cheap)
    /** The halo is a WIDE-VIEW grace: zoomed into a neighborhood the pooled
     *  interior exceeds the threshold everywhere, and halo-over-field
     *  converged the whole screen toward white (Eli: "I do not want it in
     *  white"). It bows out on approach. */
    /** Extended 2026-07-08: the halo was bowing out at 13.2 — the exact
     *  middle distance — taking the field's cohesion with it. It now
     *  holds through the valley and is gone by the close view. */
    closeFade: { from: 12.8, to: 14.2 },
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
  // ramp/tunnel (2026-07-08): interchange links as a quiet late tier
  // (portal rotaries read as scribbles at arterial weight — Eli), and a
  // whisper of tunnel continuation so no street dead-ends at a portal.
  roadAlpha: { highway: 0.26, avenue: 0.16, local: 0.09, service: 0.05, ramp: 0.07, tunnel: 0.055 },
  roadWidth: { highway: 2.2, avenue: 1.35, local: 0.7, service: 0.45, ramp: 0.6, tunnel: 1.0 }, // px at fade-in end
} as const;

/** Widened from `typeof INK` (whose `as const` literals would reject any
 *  second palette): same SHAPE, free values — the paper world needs it. */
type Widen<T> = T extends string
  ? string
  : T extends number
    ? number
    : { readonly [K in keyof T]: Widen<T[K]> };
export type CandidatePalette = Widen<typeof INK>;

/** THE PAPER WORLD base sheet (?world=paper — style candidate, 2026-07-10).
 *  Warm bone, real ink streets (a pen, not a UI line), watercolor-gray
 *  water, dry-sage parks. Road presence rides dayRoadBoost/Widen at the
 *  forced paper=1, so the ink network has mass all day. */
export const PAPER: CandidatePalette = {
  bg: "#EAE3D3", // warm bone — good sketchbook paper, never office-gray
  water: "#C2C8C6", // a wash the brush left, never GPS blue
  park: "#E0DCC6", // dry sage, barely there
  building: "#DFD7C4", // settled mass, one step below the sheet
  buildingAlpha: 0.5,
  plateBase: 0, // the sheet is gapless bone; no plates
  boundary: "rgba(44,41,36,0.09)", // hand-drawn ink seams
  boundaryWidth: 1.0,
  road: "#2E2B25", // real ink, warm-black
  roadAlpha: { ...INK.roadAlpha },
  roadWidth: { ...INK.roadWidth },
};
