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
  };
};

export type LookDef = {
  id: string;
  name: string;
  date: string;
  note: string;
  config: LookConfig;
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
};

export const LOOKS: LookDef[] = [
  {
    id: "first-bloom",
    name: "first bloom",
    date: "07-05",
    note: "soft circular blooms, no tiers, no weave — reconstruction",
    config: {
      shape: { warpAmp: 0, scale: 8, drift: 0, streak: 0, band: 0, smoothWarp: 0 },
      dials: { ...ERA_WIDE, tierKeep: 0, richen: 0, weaveAmp: 0, shimmer: 0, overlapGate: 0, felt: 0 },
    },
  },
  {
    id: "watercolor-night",
    name: "watercolor night",
    date: "07-06",
    note: "blotted seeping edges, barely-moving weather — reconstruction",
    config: {
      shape: { warpAmp: 0.085, scale: 10, drift: 0.01, streak: 0, band: 0, smoothWarp: 0 },
      dials: { ...ERA_WIDE, tierKeep: 0, richen: 0, weaveAmp: 0, shimmer: 0, overlapGate: 0, felt: 0 },
    },
  },
  {
    id: "woven-wash",
    name: "woven wash",
    date: "07-08",
    note: "the silk+pigment merge: tiers, weave, shimmer (ungated)",
    config: {
      shape: { warpAmp: 0.105, scale: 9, drift: 0.035, streak: 0.5, band: 0.25, smoothWarp: 0 },
      dials: { ...ERA_WIDE, tierKeep: 0.85, richen: 0.4, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 0, felt: 0 },
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
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 0,
      },
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
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 0,
      },
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
        tierKeep: 0.85, richen: 0.55, weaveAmp: 0.6, shimmer: 0.35, overlapGate: 1, felt: 1,
      },
    },
  },
];
