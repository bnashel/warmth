/**
 * components/Trail/GlowLayer.ts — emotion rendered as LIGHT.
 *
 * A ScatterplotLayer whose fragment shader is replaced with a radial light
 * function: a bright hot core (slightly white-shifted, like a filament), a
 * long soft falloff, and additive blending so nearby glows pool into
 * continuous fields — same hue deepens into one pool, different hues bleed
 * into each other at the edges. A slow breathing pulse rides on a `timeSec`
 * uniform; per-point phase is hashed from hue + radius so the city never
 * throbs in lockstep.
 *
 * All look-tunables live in tune.ts (GLOW); this file is the machinery.
 */
import { ScatterplotLayer, type ScatterplotLayerProps } from "deck.gl";
import { GLOW, LAMP } from "@/components/Map/tune";

/* Extra uniform block (deck 9 shader-module pattern — see TripsLayer). */
const glowUniforms = {
  name: "glow" as const,
  fs: /* glsl */ `\
layout(std140) uniform glowUniforms {
  float timeSec;
  float coreRadius;
  float corePeak;
  float coreWhiteness;
  float tailFalloff;
  float radiusAmp;
  float brightnessAmp;
  float periodSec;
  float peakBase;
  float peakPerIntensity;
  float gain;
  float pigment;
  float stainEdge;
  float stainRing;
  float stainHeart;
  float wobble;
  float tiers;
  float matte;
  float matteGlint;
  float ember;
  float emberEdge;
  float emberHeartR;
  float emberHeartOff;
  float emberWarmth;
  float garden;
} glow;
`,
  uniformTypes: {
    timeSec: "f32" as const,
    coreRadius: "f32" as const,
    corePeak: "f32" as const,
    coreWhiteness: "f32" as const,
    tailFalloff: "f32" as const,
    radiusAmp: "f32" as const,
    brightnessAmp: "f32" as const,
    periodSec: "f32" as const,
    peakBase: "f32" as const,
    peakPerIntensity: "f32" as const,
    gain: "f32" as const,
    pigment: "f32" as const,
    stainEdge: "f32" as const,
    stainRing: "f32" as const,
    stainHeart: "f32" as const,
    wobble: "f32" as const,
    tiers: "f32" as const,
    matte: "f32" as const,
    matteGlint: "f32" as const,
    ember: "f32" as const,
    emberEdge: "f32" as const,
    emberHeartR: "f32" as const,
    emberHeartOff: "f32" as const,
    emberWarmth: "f32" as const,
    garden: "f32" as const,
  },
};

/* The light function. vFillColor carries the emotion hue in rgb and the
 * INTENSITY (0..1) in alpha — the layer's opacity prop must stay 1 (the
 * stock vertex shader premultiplies opacity into alpha, which would corrupt
 * intensity); overall gain is its own uniform. vPhase is a per-point hash
 * of world position, injected into the vertex shader below. */
const FS = /* glsl */ `\
#version 300 es
#define SHADER_NAME emotion-glow-layer-fragment-shader
precision highp float;
in vec4 vFillColor;
in vec2 unitPosition;
in float vPhase;
in vec4 vGarden; // growth, petal count/255, memory, seed (garden mode)
in float vSeed;
out vec4 fragColor;

void main(void) {
  geometry.uv = unitPosition;

  float w = vFillColor.a;              // weight of this moment (0..1)
  float r = length(unitPosition);      // 0 at center, 1 at quad edge

  // Breathing: per-point phase — the city never throbs in lockstep.
  float s = sin(6.2831853 * (glow.timeSec / glow.periodSec + vPhase));

  // THE GARDEN (2026-07-10, the journal that grows): an entry is a BLOOM
  // that matures with age — a near-round bud when fresh, opening into
  // petals with visible growth rings as weeks pass; attaching a memory
  // adds a ring. Same matte pigment language as the gems; the GROWTH is
  // the design: a month-old journal looks like something you've built.
  if (glow.garden > 0.5) {
    float grow = vGarden.x;
    float petals = max(3.0, floor(vGarden.y * 255.0 + 0.5));
    float seedPh = vGarden.w * 6.2831853;
    float theta = atan(unitPosition.y, unitPosition.x);
    // THE SILK BLOOM (07-10, the public germ fix at diary scale): the old
    // cos(petals·θ) rosette was radially-symmetric scallops — a burr, the
    // exact biological read banned from the public field. The emotion's
    // petal count now sets HOW MANY slow waves ride the edge (calm 2 …
    // energy 4 — integer, so the silhouette closes), and a strong 1θ term
    // makes every bloom LEAN — directional, like a flower toward light.
    float waves = clamp(floor(petals * 0.4 + 0.5), 2.0, 4.0);
    float lb = 0.38 * sin(theta + seedPh + glow.timeSec * 0.021)
             + 0.62 * sin(waves * theta + seedPh * 1.7 + glow.timeSec * 0.033);
    // Waves deepen as the bloom matures; a slow sway keeps it alive.
    float depth = 0.05 + 0.26 * grow;
    float edgeR = 1.0 - depth * (0.5 + 0.5 * lb);
    // Ben's shader declares rr later (the ember breathes in light, not
    // shape) — the garden computes its own breathing radius locally.
    float breatheG = (1.0 + glow.radiusAmp * s) / (1.0 + glow.radiusAmp);
    float rg = (r / breatheG) / max(edgeR, 0.25);
    if (rg >= 1.0) discard;
    float n0 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    // Growth rings, written outward by time; the memory ring rides along.
    float rings = 1.0 + floor(grow * 3.0 + vGarden.z + 0.001);
    float ringWave = 0.5 + 0.5 * cos(rg * rings * 4.6 - 1.2);
    float edge = smoothstep(1.0, 0.88, rg);
    float tone = (0.5 + 0.34 * w) * (0.86 + 0.14 * ringWave);
    vec3 col = vFillColor.rgb * tone;
    col += vFillColor.rgb * 0.45 * exp(-pow(rg / 0.16, 2.0)) * (0.5 + 0.5 * grow);
    col = min(col, vFillColor.rgb * 0.96); // nothing brighter than the hue
    float a = edge * (glow.peakBase + glow.peakPerIntensity * w) * glow.gain * (0.8 + 0.2 * grow);
    a *= smoothstep(0.0, 0.12, w);
    a *= 1.0 + 0.04 * s;
    a = clamp(a + (n0 - 0.5) * 0.006, 0.0, 0.92);
    fragColor = vec4(col * a, a);
    DECKGL_FILTER_COLOR(fragColor, geometry);
    return;
  }

  // THE EMBER (round 2, item 3 — the journal's memory mark). Sea-glass
  // silhouette: a roundish base with 2-4 gentle undulations, seeded by the
  // ENTRY'S ID and frozen forever — a memory has a shape the way a pebble
  // does. Low frequency only (harmonics 2/3/4, ±~18%): nothing that reads
  // as bacteria. The ember breathes in LIGHT, never in shape.
  if (glow.ember > 0.0) {
    float theta = atan(unitPosition.y, unitPosition.x);
    float p2 = vSeed * 6.2831853;
    float p3 = fract(vSeed * 7.5091) * 6.2831853;
    float p4 = fract(vSeed * 3.1371) * 6.2831853;
    float undul = 0.11 * sin(2.0 * theta + p2)
                + 0.06 * sin(3.0 * theta + p3)
                + 0.035 * sin(4.0 * theta + p4);
    float rE = r / (1.0 + undul);
    if (rE >= 1.0) discard;

    // The heart: a soft warm luminous center, slightly off-center (seeded),
    // falling off smoothly — felt warmth, never a point star.
    vec2 hc = vec2(cos(p3), sin(p3)) * glow.emberHeartOff;
    float hd = length(unitPosition / (1.0 + undul) - hc) / glow.emberHeartR;
    float heart = exp(-hd * hd);
    // The coal breathes: warmth swells and settles on its own seeded,
    // slower clock — clearly alive, never blinking (Eli: private felt
    // stale while public moved; now both live at the held-breath pace).
    heart *= 1.0 + 0.12 * sin(6.2831853 * glow.timeSec / (glow.periodSec * 1.6) + p4);

    // PIGMENT EMBER (the paper world's journal): the same forever-shape
    // silhouette, SOAKED into the sheet instead of lit. The watercolor
    // wash runs on the undulated radius; the heart INVERTS into deeper
    // pooled pigment — a memory soaks in. PIGMENT_STAIN blend-min keeps
    // repeat places deepening, never bruising.
    if (glow.pigment > 0.0) {
      vec3 pigE = mix(vFillColor.rgb, vFillColor.rgb * vFillColor.rgb, 0.65);
      float washE = smoothstep(1.0, glow.stainEdge, rE);
      float poolE = 1.0 + glow.stainRing * smoothstep(glow.stainEdge * 0.55, glow.stainEdge, rE)
                  + glow.stainHeart * heart;
      float sE = (glow.peakBase + glow.peakPerIntensity * w) * glow.gain * washE * poolE;
      sE *= smoothstep(0.0, 0.12, w);
      float stainE = 0.9 * (1.0 - exp(-max(sE, 0.0) / 0.5)) * glow.pigment;
      fragColor = vec4(mix(vec3(1.0), pigE, stainE), 1.0);
      DECKGL_FILTER_COLOR(fragColor, geometry);
      return;
    }

    if (glow.ember > 1.5) {
      // HEART PASS (additive, deliberately dim): where life stacks embers
      // at one place — home, work — the repeats WARM instead of smearing.
      vec3 warmHue = mix(vFillColor.rgb, vec3(1.0, 0.86, 0.7), glow.emberWarmth);
      float hl = heart * (glow.peakBase + glow.peakPerIntensity * w) * glow.gain;
      hl *= smoothstep(0.0, 0.12, w);
      hl *= 1.0 + glow.brightnessAmp * s;
      fragColor = vec4(warmHue * max(hl, 0.0), 0.0);
      DECKGL_FILTER_COLOR(fragColor, geometry);
      return;
    }

    // BODY PASS (premultiplied over): settled matte glass with the heart
    // glowing through from inside — deeper than the old unlit stain,
    // dimmer than the old candle. Overlaps deepen (alpha-over stacking).
    float n0 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float edge = smoothstep(1.0, glow.emberEdge, rE);
    float tone = 0.5 + 0.28 * w;
    vec3 col = vFillColor.rgb * tone;
    col += vFillColor.rgb * 0.35 * heart * (0.5 + 0.5 * w);
    col = min(col, vFillColor.rgb * 0.95); // the hue itself is the ceiling
    float a = edge * (glow.peakBase + glow.peakPerIntensity * w) * glow.gain;
    a *= smoothstep(0.0, 0.12, w);
    a *= 1.0 + 0.07 * s;                   // a quiet breath, light only
    a = clamp(a + (n0 - 0.5) * 0.006, 0.0, 0.88);
    fragColor = vec4(col * a, a);
    DECKGL_FILTER_COLOR(fragColor, geometry);
    return;
  }

  // Radius breathes but never leaves the quad: full size only at s = 1.
  float breathe = (1.0 + glow.radiusAmp * s) / (1.0 + glow.radiusAmp);
  float rr = r / breathe;

  // FREE-FORM (wobble > 0 — the journal): the silhouette stops being a
  // circle. RESHAPED 07-10 (the public germ fix, at diary scale): the old
  // 3θ/5θ/8θ harmonics gave every mark many small similar bumps — a cell
  // wall. Now: one 1θ LEAN (the mark reaches to a side — directional,
  // intentional) plus two large slow waves, drifting at exhale speed.
  // Every mark still unique (phase-hashed), inward-only, quad-safe.
  if (glow.wobble > 0.0) {
    float theta = atan(unitPosition.y, unitPosition.x);
    float ph = vPhase * 6.2831853;
    float lobes =
        0.32 * sin(theta + ph * 0.9 + glow.timeSec * 0.021)
      + 0.46 * sin(2.0 * theta + ph + glow.timeSec * 0.05)
      + 0.22 * sin(3.0 * theta - ph * 1.7 + glow.timeSec * 0.033);
    float shrink = 1.0 - glow.wobble * (0.5 + 0.5 * lobes);
    rr = rr / max(shrink, 0.35);
  }
  if (rr >= 1.0) discard;

  // THE MATTE GEM (2026-07-08, the journal's memory node): not a point
  // of light — a solid mark of pigment. Full hue depth to the edge with
  // pigment pooling darker at the rim (sealing wax), a small pure-hue
  // glint at the heart, the living-blot silhouette, and NOTHING white:
  // the color is capped below the hue's own full brightness. Caller
  // blends premultiplied-over (MATTE_OVER), never additive.
  if (glow.matte > 0.0) {
    float n0 = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    float edge = smoothstep(1.0, glow.stainEdge, rr);
    float rim = smoothstep(glow.stainEdge * 0.55, glow.stainEdge, rr);
    float tone = 0.62 + 0.3 * w;
    vec3 col = vFillColor.rgb * tone * (1.0 - glow.stainRing * rim);
    col += vFillColor.rgb * glow.matteGlint * exp(-pow(rr / 0.17, 2.0)) * (0.6 + 0.4 * w);
    col = min(col, vFillColor.rgb * 0.96); // the hue itself is the ceiling
    float a = edge * (glow.peakBase + glow.peakPerIntensity * w) * glow.gain;
    a *= smoothstep(0.0, 0.12, w);          // arrivals/fades reach zero
    a *= 1.0 + 0.04 * s;                    // the quietest breath
    a = clamp(a + (n0 - 0.5) * 0.006, 0.0, 0.92);
    fragColor = vec4(col * a, a);
    DECKGL_FILTER_COLOR(fragColor, geometry);
    return;
  }

  // Bright hot core + long soft tail.
  float core = exp(-pow(rr / glow.coreRadius, 1.8));
  float tail = pow(1.0 - rr, glow.tailFalloff);

  // THE WOVEN WASH at diary scale (2026-07-08): the skirt settles into a
  // few translucent tiers with a breath of pigment pooled at each contour
  // — the same layered matte depth as the public field. tiers 0 = smooth.
  if (glow.tiers > 0.0) {
    float lv = tail * glow.tiers;
    float f = fract(lv);
    tail = (floor(lv) + smoothstep(0.35, 0.65, f)) / glow.tiers;
    tail *= 1.0 - 0.14 * exp(-pow((f - 0.5) / 0.11, 2.0));
  }
  float lum = glow.corePeak * core + tail;

  // Peak brightness scales with weight; breath modulates it gently.
  lum *= (glow.peakBase + glow.peakPerIntensity * w)
       * (1.0 + glow.brightnessAmp * s);

  // Dying and newborn moments reach TRUE black: without this, peakBase
  // would floor every point at ~32% and arrivals/fades would pop.
  lum *= smoothstep(0.0, 0.12, w);

  // Ordered-noise dither on the luminance BEFORE the path split, so both
  // the additive tail and the pigment stain tail stay band-free on 8-bit.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  lum += (n - 0.5) * 0.004;

  // PIGMENT (the paper day): light added to a light map is invisible, so
  // the dot STAINS instead — the caller blends with op MIN (deepest mark
  // wins), where white means "untouched paper" and overlapping commits
  // can only deepen to the darkest single stain, never stack toward black.
  // Hue is gamma-deepened so it reads saturated on paper, never neon; lum
  // (hot core included) sets the stain depth, capped so a fresh commit is
  // a deep watercolor mark, never a bruise.
  if (glow.pigment > 0.0) {
    // Pigment: 65% of the way to the gamma-deepened hue — saturated on
    // paper, never the muddy full-square (Eli: the dots read dirty).
    vec3 pig = mix(vFillColor.rgb, vFillColor.rgb * vFillColor.rgb, 0.65);
    // A MARK, not a glow (Ben: the glow tail read as an out-of-focus blob).
    // Real watercolor, three shapes the light's core/tail knows nothing of:
    //   wash — full depth until stainEdge of the radius, then a SHORT
    //          hand-soft feather to the edge (a wide one read as blur);
    //   pool — the rim runs stainRing deeper as the water dries;
    //   heart — the center dries stainHeart lighter (pigment pushed out),
    //           so the mark never reads as a flat disc.
    float wash = smoothstep(1.0, glow.stainEdge, rr);
    float pool = 1.0 + glow.stainRing * smoothstep(glow.stainEdge * 0.55, glow.stainEdge, rr);
    float heart = 1.0 - glow.stainHeart * (1.0 - smoothstep(0.0, glow.stainEdge * 0.7, rr));
    float s = (glow.peakBase + glow.peakPerIntensity * w) * glow.gain * wash * pool;
    s *= smoothstep(0.0, 0.12, w);          // arrivals/fades still reach zero
    s += (n - 0.5) * 0.006;                 // dither the edge, band-free
    // Soft-knee depth cap: saturates toward 0.9, slope never breaks — a
    // fresh mark is confident ink (~0.85 at center, pooled rim deeper), a
    // week-old one visibly lighter; never a bruise, no plateau rim.
    // The heart lightens AFTER the knee — pre-knee it compresses to
    // nothing on fresh marks (design review) — so 0.12 means 0.12 at
    // every age and no mark ever reads as a flat disc.
    float stain = 0.9 * (1.0 - exp(-max(s, 0.0) / 0.5)) * heart * glow.pigment;
    fragColor = vec4(mix(vec3(1.0), pig, stain), 1.0);
    DECKGL_FILTER_COLOR(fragColor, geometry);
    return;
  }

  // The filament: the very center whitens toward hot.
  vec3 color = mix(vFillColor.rgb, vec3(1.0), glow.coreWhiteness * core);

  // Additive light: color scaled by luminance; alpha adds nothing.
  fragColor = vec4(color * max(lum, 0.0) * glow.gain, 0.0);
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`;

export type GlowDatum = {
  position: [number, number];
  hue: [number, number, number];
  weight: number; // 0..1 — intensity × freshness × arrival
  /** Present on journal entries — seeds the ember's forever-shape. */
  id?: string;
};

type LightParams = {
  coreRadius: number;
  corePeak: number;
  coreWhiteness: number;
  tailFalloff: number;
  peakBase: number;
  peakPerIntensity: number;
  gain: number;
  /** 0 = additive light (night); >0 = watercolor stain on the paper day
   *  (pair with PIGMENT_STAIN parameters — the value is the stain weight). */
  pigment: number;
  /** Stain shape: the wash holds full depth to this fraction of the radius,
   *  then eases to the edge. */
  stainEdge: number;
  /** Extra pigment pooled at the rim (watercolor dries darker at its edge). */
  stainRing: number;
  /** How much lighter the center dries (pigment pushed toward the rim). */
  stainHeart: number;
  /** 0 = perfect circle; >0 = free-form living blot (the journal). The
   *  value is the max inward dent as a fraction of the radius. */
  wobble: number;
  /** 0 = smooth skirt; >0 = the skirt settles into this many translucent
   *  tiers (the woven wash's layered matte depth, at diary scale). */
  tiers: number;
  /** 1 = THE MATTE GEM (journal memory node): solid pigment mark, darker
   *  rim, pure-hue glint — pair with MATTE_OVER blending. 0 = light. */
  matte: number;
  /** Heart glint strength for the matte gem. */
  matteGlint: number;
  /** THE EMBER: 0 = off, 1 = body pass (MATTE_OVER), 2 = heart pass
   *  (ADDITIVE_LIGHT). Silhouette seeded by getSeed (the entry id). */
  ember: number;
  /** Body edge feather start (fraction of the shaped radius). */
  emberEdge: number;
  /** Heart falloff radius (fraction of the shape). */
  emberHeartR: number;
  /** Heart off-center distance (fraction; direction is seeded). */
  emberHeartOff: number;
  /** Heart hue lift toward warm white on the additive pass. */
  emberWarmth: number;
  /** 1 = THE GARDEN (Eli, 07-10): entries as blooms that mature with age
   *  — growth data arrives per-instance via getLineColor. */
  garden: number;
  /** Breath overrides (THE LANTERN, 07-17): a keepsake is STILL — its
   *  light barely breathes and its size never does. Absent = the shared
   *  GLOW.pulse amplitudes, so every existing layer is untouched. */
  radiusAmp: number;
  brightnessAmp: number;
};

type EmotionGlowLayerProps = ScatterplotLayerProps<GlowDatum> & {
  timeSec?: number;
  /** Per-layer shading overrides (the streetlight pass has no hot core). */
  light?: Partial<LightParams>;
  /** Per-datum shape seed (the ember hashes the entry id — the shape is
   *  the memory's forever). Optional; defaults to 0. */
  getSeed?: (d: GlowDatum) => number;
};

export class EmotionGlowLayer extends ScatterplotLayer<
  GlowDatum,
  // beforeId is read by MapboxOverlay (interleaved) to place the layer
  // within the mapbox style stack; deck's own types don't know it.
  {
    timeSec?: number;
    light?: Partial<LightParams>;
    beforeId?: string;
    getSeed?: (d: GlowDatum) => number;
  }
> {
  static layerName = "EmotionGlowLayer";
  // Accessor default: layers that don't pass getSeed (public glow, gems,
  // streetlight) fall back to a constant 0 instead of tripping deck's
  // accessor assert — only the ember reads the seed.
  static defaultProps = {
    ...ScatterplotLayer.defaultProps,
    getSeed: { type: "accessor", value: 0 },
  };

  initializeState() {
    super.initializeState();
    // The ember's forever-shape seed rides its own instanced attribute
    // (hashed from the entry ID on the CPU — world position would give two
    // moments at the same cafe the same pebble).
    this.getAttributeManager()!.addInstanced({
      instanceSeeds: { size: 1, accessor: "getSeed", defaultValue: [0] },
    });
  }

  getShaders() {
    const shaders = super.getShaders();
    shaders.fs = FS;
    shaders.modules = [...shaders.modules, glowUniforms];
    // Per-point pulse phase, hashed from world position in the (otherwise
    // stock) vertex shader — hue or intensity alone would sync clusters.
    // vSeed carries the id-hashed ember shape seed through.
    shaders.inject = {
      ...shaders.inject,
      "vs:#decl": "in float instanceSeeds;\nout float vPhase;\nout float vSeed;\nout vec4 vGarden;\n",
      "vs:#main-end":
        "vPhase = fract(sin(dot(instancePositions.xy, vec2(12.9898, 78.233))) * 43758.5453);\n" +
        "vSeed = instanceSeeds;\n" +
        "vGarden = instanceLineColors;\n",
    };
    return shaders;
  }

  draw(params: unknown) {
    const { timeSec = 0, light } = this.props as EmotionGlowLayerProps;
    // THE ONE GLOW RECIPE: every layer starts from the LAMP (constitution
    // rule 5); per-layer `light` overrides are variations of the same lamp
    // (the streetlight pass has no hot core), never a different recipe.
    const p: LightParams = {
      coreRadius: LAMP.coreRadius,
      corePeak: LAMP.corePeak,
      coreWhiteness: LAMP.coreWhiteness,
      tailFalloff: LAMP.tailFalloff,
      peakBase: LAMP.peakBase,
      peakPerIntensity: LAMP.peakPerIntensity,
      gain: 1,
      pigment: 0,
      stainEdge: 0.8,
      stainRing: 0,
      stainHeart: 0,
      wobble: 0,
      tiers: 0,
      matte: 0,
      matteGlint: 0,
      ember: 0,
      emberEdge: 0.8,
      emberHeartR: 0.5,
      emberHeartOff: 0.22,
      emberWarmth: 0.35,
      garden: 0,
      radiusAmp: GLOW.pulse.radiusAmp,
      brightnessAmp: GLOW.pulse.brightnessAmp,
      ...light,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (this.state as any).model;
    model?.shaderInputs.setProps({
      glow: {
        timeSec,
        coreRadius: p.coreRadius,
        corePeak: p.corePeak,
        coreWhiteness: p.coreWhiteness,
        tailFalloff: p.tailFalloff,
        radiusAmp: p.radiusAmp,
        brightnessAmp: p.brightnessAmp,
        periodSec: GLOW.pulse.periodMs / 1000,
        peakBase: p.peakBase,
        peakPerIntensity: p.peakPerIntensity,
        gain: p.gain,
        pigment: p.pigment,
        stainEdge: p.stainEdge,
        stainRing: p.stainRing,
        stainHeart: p.stainHeart,
        wobble: p.wobble,
        tiers: p.tiers,
        matte: p.matte,
        matteGlint: p.matteGlint,
        ember: p.ember,
        emberEdge: p.emberEdge,
        emberHeartR: p.emberHeartR,
        emberHeartOff: p.emberHeartOff,
        emberWarmth: p.emberWarmth,
        garden: p.garden,
      },
    });
    super.draw(params as never);
  }
}

/** Additive-light GPU state: sum into the scene, never test depth. */
export const ADDITIVE_LIGHT = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "one",
  blendColorDstFactor: "one",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one",
  depthWriteEnabled: false,
  depthCompare: "always",
} as const;

/** Pigment state (the paper day): DEEPEST MARK WINS (blend-op min, the
 *  factors fixed at one as min/max requires). White output leaves the paper
 *  untouched; overlapping commits deepen to the darkest single stain —
 *  a diary of repeat feelings at home reads as one deep watercolor mark,
 *  never a multiplied-to-black bruise (review finding). */
export const PIGMENT_STAIN = {
  blend: true,
  blendColorOperation: "min",
  blendColorSrcFactor: "one",
  blendColorDstFactor: "one",
  blendAlphaOperation: "min",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one",
  depthWriteEnabled: false,
  depthCompare: "always",
} as const;

/** Matte-gem state (the journal's memory nodes): plain premultiplied
 *  OVER — a solid mark on the city, not light added into it. */
export const MATTE_OVER = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "one",
  blendColorDstFactor: "one-minus-src-alpha",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
  depthWriteEnabled: false,
  depthCompare: "always",
} as const;

/** Screen-blend light (the ember's heart): src·(1−dst) + dst — light that
 *  SATURATES toward its own hue and can never sum past it. Twenty-five
 *  moments at home warm the ember deeply; they cannot bloom white
 *  (constitution rule 3, structurally). */
export const SCREEN_LIGHT = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "one-minus-dst",
  blendColorDstFactor: "one",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "zero",
  blendAlphaDstFactor: "one",
  depthWriteEnabled: false,
  depthCompare: "always",
} as const;

/** Streetlight state: src×dst + dst — light lands only on bright pixels
 *  (the streets), so glow appears to switch the blocks around it on. */
export const STREET_LIGHT = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "dst",
  blendColorDstFactor: "one",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "dst-alpha",
  blendAlphaDstFactor: "one",
  depthWriteEnabled: false,
  depthCompare: "always",
} as const;
