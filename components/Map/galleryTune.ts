/**
 * components/Map/galleryTune.ts — THE VERSION GALLERY's own dial book.
 *
 * A frozen snapshot of the tune values Eli's nine gallery looks were
 * tuned against (night-pass, 2026-07-05 → 07-10). The gallery engine
 * (GalleryFieldLayer) reads THESE, never the live tune.ts — so Ben's
 * later retunes (darkness budget, pond, paper) can never silently
 * shift a preserved look. Shared plumbing (CAMERA, WEATHER, LAMP,
 * GLOW) still comes from tune.ts. NOTHING GETS THROWN AWAY.
 */

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
  /** THE UNDER-WASH (the no-dead-space layer): the ambient lattice keeps
   *  its wide soft skirt — much dimmer and quieter than any entry — so
   *  zoomed out the city still reads as one continuous glowing field
   *  while entries stay tight and defined up close. */
  wash: { radiusM: 900, minRadiusPx: 56, gain: 0.42 },
  /** Kernel falloff exponent on (1 − t²): higher = tighter heart,
   *  longer relative skirt. The edge ALWAYS reaches zero — no rims. */
  kernelSoftness: 2.5,
  /** Filmic knee: brightness = 1 − exp(−exposure · pooledWeight).
   *  Raises how fast pooled feeling brightens; never clips to white.
   *  Raised 2026-07-08 (Eli: brighter, still warm/matte) — with the knee
   *  and the never-white cap, extra exposure deepens the DENSITY read:
   *  stacked feeling climbs visibly faster than a lone entry. */
  exposure: 1.2,
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
  /** Overall field gain on the additive composite. 1.15 (2026-07-08):
   *  a touch more luminosity across the board — warm pop, hue untouched. */
  gain: 1.15,
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
  /** Living tide: subtle brightness breath. Slowed 2026-07-09 (Eli's
   *  final pass): 6.4s soft-clipped swell — a slow exhale, not a throb. */
  breath: { periodMs: 6400, amp: 0.04 },
  /** THE TONE CEILING (2026-07-09, the red-hot fix): HDR-style soft knee
   *  on the resolve's peak channel — identity below kneeFrom, asymptote
   *  at cap. Density now deepens color instead of running hot. */
  tone: { kneeFrom: 0.58, cap: 0.8 },
  /** Streetlight signature: the field multiplied onto the base map so
   *  streets inside a feeling catch its color. 0 kills it. */
  streetlightGain: 0.55,
  /** Internal render-target scale (0.5 = half res — soft field, 4× cheaper). */
  resolutionScale: 0.5,
} as const;

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
  stain: { edge: 0.88, ring: 0.28, radiusScale: 0.85, gainBoost: 1.25, heart: 0.12 },
  /** THE MEMORY NODE (2026-07-08 full redesign, Eli): a matte pigment
   *  gem, not a point of light — solid hue at pigment depth with a
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
  /** THE AURORA (2026-07-08, Eli): connections between memories as
   *  flowing curtains — soft feathered ribbons whose light drifts and
   *  shimmers along real geography, dimming into the past. Tap one to
   *  learn how far apart the two moments were. Geometry: Catmull-Rom
   *  with adaptive tautness + a gentle meander; shading: AuroraLayer. */
  aurora: {
    widthPx: 13,
    /** Peak curtain opacity (feather/flow reduce from here). */
    alpha: 0.5,
    subdiv: 18,
    tautness: 0.72,
    /** Perpendicular meander amplitude as a fraction of span length. */
    meander: 0.12,
    /** Noise cells per degree (curtain texture scale). */
    noiseScale: 620,
    flowSpeed: 0.055,
    /** The far past dims to this fraction (newest span = 1). */
    oldDim: 0.4,
  },
  /** THE GARDEN (2026-07-10, from-scratch journal): entries are blooms
   *  that MATURE — a bud when fresh, opening petals and growth rings as
   *  weeks pass, a ring added when a memory attaches. matureDays = how
   *  long a bloom takes to fully open; petals carry each emotion's felt
   *  character (calm broad+few, energy many+sharp). Growth is the design:
   *  the month-old journal visibly out-blooms the week-old one. */
  garden: {
    matureDays: 21,
    memoryBoost: 0.15,
    petals: { calm: 4, love: 5, gratitude: 6, joy: 8, energy: 10 } as Record<string, number>,
    /** Blooms grow in size too: radius × (min + span·growth). */
    sizeMin: 0.55,
    sizeSpan: 0.45,
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

export const SHAPES = {
  /** THE WOVEN WASH: edges brushed out along the flow, alive but quiet.
   *  warpAmp/drift cut 2026-07-08 (Eli: an emotion's LOCATION is a fact):
   *  edges undulate in place and centers stay pinned to the data.
   *  RESHAPED 2026-07-09 (the germ fix): scale dropped 11 → 4.6 and the
   *  warp now rides `swell` (one big octave) — a few slow sweeping waves
   *  in the outline, ink-in-water, never a scalloped cell wall. `streak`
   *  is now a STANDING baseline (wind adds on top in MapStage): every
   *  silhouette is pulled gently along the flow axis — directional
   *  asymmetry reads as intention, radial wobble read as biology. */
  woven: { warpAmp: 0.058, scale: 4.6, drift: 0.01, streak: 0.32, band: 0.25 },
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
  tiers: { count: 5, rim: 0.16, richen: 0.55, crawl: 0.05, keep: 0.85 },
} as const;

export const FELT: Record<
  string,
  {
    period: number; amp: number; skew: number; crisp: number;
    flicker: number; rise: number; radiusMul: number; warpMul: number; scaleMul: number;
  }
> = {
  /** Still water settling: slowest, widest, softest — sustained + light. */
  calm: { period: 10.5, amp: 0.045, skew: -0.15, crisp: 0, flicker: 0, rise: 0, radiusMul: 1.3, warpMul: 0.55, scaleMul: 0.5 },
  /** Buoyant, catching light: quicker swell, slow settle, light RISES. */
  joy: { period: 4.6, amp: 0.075, skew: 0.5, crisp: 0, flicker: 0, rise: 0.14, radiusMul: 1.0, warpMul: 1.0, scaleMul: 1.0 },
  /** Enveloping: wide reaching skirt, roundest lowest-frequency edges. */
  love: { period: 7.2, amp: 0.07, skew: 0, crisp: 0, flicker: 0, rise: 0, radiusMul: 1.18, warpMul: 0.8, scaleMul: 0.55 },
  /** Candlelight: near-still, a gentle fine inner flicker, quiet glow. */
  gratitude: { period: 8.5, amp: 0.028, skew: 0, flicker: 0.06, crisp: 0, rise: 0, radiusMul: 0.95, warpMul: 0.6, scaleMul: 0.8 },
  /** Alert and direct: fastest, crisp-edged pulse, tighter footprint.
   *  warp/scale trimmed 2026-07-10: at 1.2/1.7 the extra edge business on
   *  a small tight kernel tore it into slivers (the flame shapes) — the
   *  emotion's identity lives in its speed and crispness, not a torn edge. */
  energy: { period: 2.7, amp: 0.09, skew: 0, crisp: 2.4, flicker: 0, rise: 0, radiusMul: 0.85, warpMul: 0.85, scaleMul: 1.35 },
};
