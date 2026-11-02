/**
 * components/Map/looks.ts — THE VERSION GALLERY (Eli, 2026-07-09).
 *
 * Nothing gets thrown away: every design iteration of the public field is
 * preserved here as a selectable dial snapshot. The renderer (FieldLayer +
 * MapStage) reads every overridable dial through lookState.currentLook(),
 * so switching looks is instant and adding a NEW iteration means adding an
 * entry to LOOKS — never replacing the code that implements an old one.
 *
 * Historical entries are reconstructions from git history: the dials are
 * faithful; shader-structural details that no longer exist (e.g. the old
 * pre-gamut-fix channel clipping) can't be resurrected and are noted.
 * Likewise the 07-10 zoom fix (noise domains world-anchored so zooming
 * magnifies a silhouette instead of re-rolling it) applies to every look:
 * the old screen-anchored boil was a bug, not a style.
 */

export type LookConfig = {
  /** Silhouette: amplitude/frequency/motion of the edge warp.
   *  smoothWarp 1 = the 07-09 `swell` (few sweeping waves); 0 = 3-octave
   *  fbm (the older, busier edge). */
  shape: {
    warpAmp: number;
    scale: number;
    drift: number;
    streak: number;
    band: number;
    smoothWarp: 0 | 1;
  };
  /** Field dials (the overridable subset of FIELD/WOVEN). */
  dials: {
    radiusM: number;
    radiusPerIntensityM: number;
    minRadiusPx: number;
    washGain: number;
    exposure: number;
    gain: number;
    heartLift: number;
    dominance: number;
    breathPeriodMs: number;
    breathAmp: number;
    /** 1 = the soft-clipped exhale; 0 = plain sine (the old throb). */
    breathShaped: 0 | 1;
    /** 1 = hue-preserving tone ceiling (07-09); 0 = raw output. */
    toneKnee: 0 | 1;
    tierKeep: number;
    richen: number;
    weaveAmp: number;
    shimmer: number;
    /** 1 = colors interact only at genuine overlap; 0 = ungated (pre-07-08). */
    overlapGate: 0 | 1;
    /** 1 = FELT EMOTIONS: per-emotion form + motion signatures. */
    felt: 0 | 1;
    /** THE VEIL (07-10, "night air"): 1 = unbounded ambient field — soft
     *  presence curve + heat-shimmer, no tiers, no silhouettes at all. */
    veil: 0 | 1;
    /** Kernel falloff exponent (accumulate pass). Low = long diffuse
     *  skirts that merge into continuum; high = defined pools. */
    kernelSoftness: number;
    /** NIGHT WEATHER (07-10) — all optional; absent = the older behavior.
     *  breathVary: 0..1 — each area's breath wanders in rhythm and
     *  waxes/wanes in depth (no metronome). meld: 0..1 — at genuine
     *  overlap, dominance relaxes so colors truly interpenetrate.
     *  overlapFrom/To: per-look gate range (open the interaction earlier). */
    breathVary?: number;
    meld?: number;
    overlapFrom?: number;
    overlapTo?: number;
  };
  /** Which private-journal rendering this look pairs with:
   *  thread = Eli's aurora curtains, garden = Eli's growing blooms,
   *  ember = Ben's forever-ember (his trunk's journal),
   *  lantern = THE KEEPSAKE LANTERN (private redesign, 07-17): a small
   *  crisp point of warm light, still and precise — never a blob. */
  journal: "thread" | "garden" | "ember" | "lantern";
};

export type LookDef = {
  id: string;
  name: string;
  date: string;
  note: string;
  /** Which field machinery renders this look (THE ONE WORLD merge,
   *  2026-07-13): "gallery" = Eli's engine (GalleryFieldLayer — felt
   *  emotions, veil, world-anchored silhouettes); "pond" = Ben's engine
   *  (FieldLayer — bake-off geographic flow, solo pool breathing, ripple
   *  arrivals, paper pigment). Both live whole; MapStage mounts one.
   *  Absent = "gallery". */
  engine?: "gallery" | "pond";
  /** Ben's preset key in tune.LOOKS when engine is "pond". */
  pond?: "still-water" | "living-water" | "ink" | "aurora";
  /** Which base city this look stands on. Absent = "night"; "paper"
   *  rebuilds the base style live (no reload). */
  world?: "night" | "paper";
  config: LookConfig;
};

/** Dial stand-in for Ben's pond-engine entries: only washGain reaches
 *  shared plumbing (momentsStore feeds both engines); the rest is inert —
 *  the pond's real dials live in tune.LOOKS. washGain matches Ben's
 *  FIELD.wash.gain (his darkness-budget retune). */
const POND_DIALS = {
  radiusM: 200, radiusPerIntensityM: 30, minRadiusPx: 38, washGain: 0.26,
  exposure: 1.2, gain: 1.15, heartLift: 0.09, dominance: 4.0,
  breathPeriodMs: 6400, breathAmp: 0.04, breathShaped: 1 as const, toneKnee: 1 as const,
  tierKeep: 0, richen: 0, weaveAmp: 0, shimmer: 0, overlapGate: 1 as const, felt: 0 as const,
  veil: 0 as const, kernelSoftness: 2.5,
};

/** Shared bones for the pre-tightening era (900m kernels, no wash split —
 *  washGain matched seedGain then). */
const ERA_WIDE = {
  radiusM: 900,
  radiusPerIntensityM: 55,
  minRadiusPx: 92,
  washGain: 0.45,
  exposure: 1.05,
  gain: 1.0,
  heartLift: 0.1,
  dominance: 4.0,
  breathPeriodMs: 2500,
  breathAmp: 0.045,
  breathShaped: 0 as const,
  toneKnee: 0 as const,
  veil: 0 as const,
  kernelSoftness: 2.5,
};

export const LOOKS: LookDef[] = [
  {
    id: "first-bloom",
    name: "first bloom",
    date: "07-05",
    note: "soft circular blooms, no tiers, no weave. reconstruction",
    config: {
      shape: { warpAmp: 0, scale: 8, drift: 0, streak: 0, band: 0, smoothWarp: 0 },
      dials: { ...ERA_WIDE, tierKeep: 0, richen: 0, weaveAmp: 0, shimmer: 0, overlapGate: 0, felt: 0, veil: 0, kernelSoftness: 2.5 },
      journal: "thread",
    },
  },
  {
    id: "watercolor-night",
    name: "watercolor night",
    date: "07-06",
    note: "blotted seeping edges, barely-moving weather. reconstruction",
    config: {
      shape: { warpAmp: 0.085, scale: 10, drift: 0.01, streak: 0, band: 0, smoothWarp: 0 },
      dials: { ...ERA_WIDE, tierKeep: 0, richen: 0, weaveAmp: 0, shimmer: 0, overlapGate: 0, felt: 0, veil: 0, kernelSoftness: 2.5 },
      journal: "thread",
    },
  },
  {
    id: "woven-wash",
    name: "woven wash",
    date: "07-08",
    note: "the silk+pigment merge: tiers, weave, shimmer (ungated)",
    config: {
      shape: { warpAmp: 0.105, scale: 9, drift: 0.035, streak: 0.5, band: 0.25, smoothWarp: 0 },
      dials: { ...ERA_WIDE, tierKeep: 0.85, richen: 0.4, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 0, felt: 0, veil: 0, kernelSoftness: 2.5 },
      journal: "thread",
    },
  },
  {
    id: "eighth-mile",
    name: "eighth mile",
    date: "07-08",
    note: "tight entries over the under-wash; overlap-gated color flow",
    config: {
      shape: { warpAmp: 0.045, scale: 11, drift: 0.01, streak: 0.35, band: 0.25, smoothWarp: 0 },
      dials: {
        radiusM: 200, radiusPerIntensityM: 30, minRadiusPx: 38, washGain: 0.42,
        exposure: 1.2, gain: 1.15, heartLift: 0.09, dominance: 4.0,
        breathPeriodMs: 2500, breathAmp: 0.045, breathShaped: 0, toneKnee: 0,
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 0, veil: 0, kernelSoftness: 2.5,
      },
      journal: "thread",
    },
  },
  {
    id: "adult-pass",
    name: "adult pass",
    date: "07-09",
    note: "silk silhouettes (swell warp), exhale breath, tone ceiling",
    config: {
      shape: { warpAmp: 0.058, scale: 4.6, drift: 0.01, streak: 0.32, band: 0.25, smoothWarp: 1 },
      dials: {
        radiusM: 200, radiusPerIntensityM: 30, minRadiusPx: 38, washGain: 0.42,
        exposure: 1.2, gain: 1.15, heartLift: 0.09, dominance: 4.0,
        breathPeriodMs: 6400, breathAmp: 0.04, breathShaped: 1, toneKnee: 1,
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 0, veil: 0, kernelSoftness: 2.5,
      },
      journal: "thread",
    },
  },
  {
    id: "felt-emotions",
    name: "felt emotions",
    date: "07-09",
    note: "each emotion has its own form + motion, not just a hue (Laban/Kandinsky pass)",
    config: {
      shape: { warpAmp: 0.058, scale: 4.6, drift: 0.01, streak: 0.32, band: 0.25, smoothWarp: 1 },
      dials: {
        radiusM: 200, radiusPerIntensityM: 30, minRadiusPx: 38, washGain: 0.42,
        exposure: 1.2, gain: 1.15, heartLift: 0.09, dominance: 4.0,
        breathPeriodMs: 6400, breathAmp: 0.04, breathShaped: 1, toneKnee: 1,
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 1, veil: 0, kernelSoftness: 2.5,
      },
      journal: "thread",
    },
  },
  {
    id: "night-air",
    name: "night air",
    date: "07-10",
    note: "FROM SCRATCH: an ambient field of feeling: light through night air, no bounded shapes at all. Pulse + overlap interaction kept; everything else rethought.",
    config: {
      shape: { warpAmp: 0.02, scale: 4.6, drift: 0.008, streak: 0.25, band: 0, smoothWarp: 1 },
      dials: {
        radiusM: 420, radiusPerIntensityM: 45, minRadiusPx: 64, washGain: 0.5,
        exposure: 0.85, gain: 0.78, heartLift: 0.06, dominance: 4.0,
        breathPeriodMs: 6400, breathAmp: 0.04, breathShaped: 1, toneKnee: 1,
        tierKeep: 0, richen: 0.35, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 1, veil: 1, kernelSoftness: 1.35,
      },
      journal: "thread",
    },
  },
  {
    id: "the-garden",
    name: "the garden",
    date: "07-10",
    note: "FROM SCRATCH (journal): entries bloom with age into a garden you've grown. opening after a month looks like what you've built. Public side = night air.",
    config: {
      shape: { warpAmp: 0.02, scale: 4.6, drift: 0.008, streak: 0.25, band: 0, smoothWarp: 1 },
      dials: {
        radiusM: 420, radiusPerIntensityM: 45, minRadiusPx: 64, washGain: 0.5,
        exposure: 0.85, gain: 0.78, heartLift: 0.06, dominance: 4.0,
        breathPeriodMs: 6400, breathAmp: 0.04, breathShaped: 1, toneKnee: 1,
        tierKeep: 0, richen: 0.35, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 1, veil: 1, kernelSoftness: 1.35,
      },
      journal: "garden",
    },
  },
  {
    id: "night-weather",
    name: "night weather",
    date: "07-10",
    note: "the felt city, un-metronomed: every area breathes in its own drifting rhythm, overlapping feelings genuinely interpenetrate (meld + earlier gate), and silhouettes run freer: bigger slower swells leaning with the flow, never cellular. Journal = the keepsake lantern (07-17; was the garden, still in ?trail=garden and the-garden look).",
    config: {
      shape: { warpAmp: 0.052, scale: 3.8, drift: 0.012, streak: 0.4, band: 0.25, smoothWarp: 1 },
      dials: {
        radiusM: 200, radiusPerIntensityM: 30, minRadiusPx: 38, washGain: 0.42,
        exposure: 1.2, gain: 1.15, heartLift: 0.09, dominance: 4.0,
        breathPeriodMs: 6400, breathAmp: 0.04, breathShaped: 1, toneKnee: 1,
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.85, shimmer: 0.5, overlapGate: 1, felt: 1, veil: 0, kernelSoftness: 2.5,
        breathVary: 1, meld: 0.4, overlapFrom: 0.08, overlapTo: 0.38,
      },
      journal: "lantern",
    },
  },
  // ---- BEN'S TRUNK (folded in whole by THE ONE WORLD merge, 07-13) ----
  // These render through Ben's engine; `config.dials` here only feeds the
  // shared store plumbing (washGain) — the pond presets in tune.LOOKS are
  // the real dials. Journal = Ben's forever-ember.
  {
    id: "ben-still-water",
    name: "still water · ben",
    date: "07-11",
    note: "Ben's bake-off pick: geographic flow, pools that breathe solo by WHERE they are, the held-breath tempo.",
    engine: "pond", pond: "still-water",
    config: { shape: { warpAmp: 0, scale: 0, drift: 0, streak: 0, band: 0, smoothWarp: 1 }, dials: { ...POND_DIALS }, journal: "ember" },
  },
  {
    id: "ben-living-water",
    name: "living water · ben",
    date: "07-11",
    note: "still water + THE POND: arrivals ripple outward through the field. you see the city being felt in.",
    engine: "pond", pond: "living-water",
    config: { shape: { warpAmp: 0, scale: 0, drift: 0, streak: 0, band: 0, smoothWarp: 1 }, dials: { ...POND_DIALS }, journal: "ember" },
  },
  {
    id: "ben-ink",
    name: "ink · ben",
    date: "07-11",
    note: "Ben's bake-off: wide slow undulations, ink settling in water.",
    engine: "pond", pond: "ink",
    config: { shape: { warpAmp: 0, scale: 0, drift: 0, streak: 0, band: 0, smoothWarp: 1 }, dials: { ...POND_DIALS }, journal: "ember" },
  },
  {
    id: "ben-aurora",
    name: "aurora · ben",
    date: "07-11",
    note: "Ben's bake-off: strongly streaked curtains riding the wind axis.",
    engine: "pond", pond: "aurora",
    config: { shape: { warpAmp: 0, scale: 0, drift: 0, streak: 0, band: 0, smoothWarp: 1 }, dials: { ...POND_DIALS }, journal: "ember" },
  },
  {
    id: "paper-world",
    name: "PAPER WORLD · ben",
    date: "07-12",
    note: "FROM SCRATCH (Ben): the bone sheet: a sky-graded paper city where feelings soak in as granulated pigment and a commit blooms as a spreading ink drop. Joy on paper is true sun-yellow (#F2C010).",
    engine: "pond", pond: "still-water", world: "paper",
    config: { shape: { warpAmp: 0, scale: 0, drift: 0, streak: 0, band: 0, smoothWarp: 1 }, dials: { ...POND_DIALS }, journal: "ember" },
  },
];
