/**
 * components/Map/GalleryFieldLayer.ts — THE FIELD, gallery engine.
 *
 * Eli's night-pass field machinery, whole and untouched by the merge:
 * THE VERSION GALLERY reads every dial through lookState, FELT gives
 * each emotion its own form + motion, the veil is night air, and the
 * 07-10 zoom fix world-anchors every texture domain. Ben's pond/paper
 * engine lives in FieldLayer.ts; MapStage mounts exactly one of the
 * two per look. (one-world merge, 2026-07-13)
 *
 * Emotion as standing weather over the city: a continuous field, never
 * points. A Mapbox custom layer (raw WebGL2 in the map's own context):
 *
 *   prerender  — every moment splats a coreless meters-scaled kernel into a
 *                half-res offscreen target: one intensity field per emotion
 *                across two RGBA16F attachments (MRT), additively pooled.
 *   render     — one fullscreen resolve: pooled weight → brightness through
 *                a filmic knee (never clips to white); hue = dominance-
 *                weighted OKLab mix of the emotion hues (the mud rule:
 *                hues are mixed by local dominance, never summed — many
 *                emotions piled up can not gray out). Then the streetlight
 *                pass multiplies the same field onto the base map.
 *
 * All look-tunables live in tune.ts (FIELD); this file is the machinery.
 */
import mapboxgl, { type CustomLayerInterface, type Map as MapboxMap } from "mapbox-gl";
import { EMOTIONS } from "@/lib/theme";
import type { LivePoint } from "@/lib/momentsStore";
import { CAMERA, WEATHER } from "./tune";
import { emotionHue } from "./solar";
import { FELT, FIELD, SHAPES, WOVEN } from "./galleryTune";
import { currentLook } from "./lookState";

/* ---------------- OKLab (Björn Ottosson, via components/Orb/oklch.ts) --- */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** hex → OKLab [L, a, b] — the per-emotion hue anchors, computed once on CPU. */
function hexToOklab(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = srgbToLinear(((n >> 16) & 255) / 255);
  const g = srgbToLinear(((n >> 8) & 255) / 255);
  const b = srgbToLinear((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/* ---------------- shaders ---------------- */

/** One accumulation channel per emotion, spread across two RGBA targets
 *  (up to 6 supported; the count flows from the canonical EMOTIONS list). */
const NE = EMOTIONS.length;

/* Kernel splat: instanced quads in mercator space, radius pre-clamped on
 * CPU per frame. Each instance writes its weight × falloff into exactly one
 * per-emotion channel across two render targets. */
const ACCUM_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;         // quad: ±1
layout(location=1) in vec3 inst;           // mercX, mercY, radiusMerc
layout(location=2) in vec2 instWC;         // weight, channel (one per emotion)
uniform mat4 uMatrix;
out vec2 vUv;
out float vWeight;
flat out int vChannel;
void main() {
  vUv = corner;
  vWeight = instWC.x;
  vChannel = int(instWC.y + 0.5);
  // Invisible kernels (faded seeds, dying moments) collapse off-clip here:
  // a zero-weight splat still costs full fill at ONE,ONE blend otherwise.
  if (vWeight < 0.0015) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 pos = inst.xy + corner * inst.z;
  gl_Position = uMatrix * vec4(pos, 0.0, 1.0);
}
`;

const ACCUM_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in float vWeight;
flat in int vChannel;
uniform float uSoftness;
layout(location=0) out vec4 o0;            // joy, energy, love, gratitude
layout(location=1) out vec4 o1;            // calm, -, -, -
void main() {
  float t2 = dot(vUv, vUv);
  if (t2 >= 1.0) discard;
  // Coreless bell, guaranteed zero at the edge — the long soft skirt.
  float k = pow(1.0 - t2, uSoftness) * vWeight;
  vec4 a = vec4(0.0), b = vec4(0.0);
  if      (vChannel == 0) a.x = k;
  else if (vChannel == 1) a.y = k;
  else if (vChannel == 2) a.z = k;
  else if (vChannel == 3) a.w = k;
  else if (vChannel == 4) b.x = k;
  else                    b.y = k;
  o0 = a; o1 = b;
}
`;

/* Fullscreen resolve: pooled weight → filmic brightness; hue = dominance-
 * weighted OKLab mix (the mud rule). uMode 0 = additive field composite,
 * uMode 1 = streetlight multiply (coreless gain onto base-map luminance). */
const RESOLVE_VS = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  // Fullscreen triangle.
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

/* BLOOM (v2): Kawase-style blur — 4 diagonal taps, widening offset per
 * pass. The first pass subtracts a threshold so only the brighter feeling
 * blooms, never the ambient wash. */
const BLUR_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uOffset;
uniform float uThreshold;
out vec4 fragColor;
void main() {
  vec2 off = uTexel * uOffset;
  vec3 c = texture(uSrc, vUv + vec2( off.x,  off.y)).rgb
         + texture(uSrc, vUv + vec2(-off.x,  off.y)).rgb
         + texture(uSrc, vUv + vec2( off.x, -off.y)).rgb
         + texture(uSrc, vUv + vec2(-off.x, -off.y)).rgb;
  c = max(vec3(0.0), c * 0.25 - vec3(uThreshold));
  fragColor = vec4(c, 1.0);
}
`;

/* Bloom composite: the halo, added over the night city. */
const COMPOSITE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform float uGain;
out vec4 fragColor;
void main() {
  fragColor = vec4(texture(uSrc, vUv).rgb * uGain, 0.0);
}
`;

const RESOLVE_FS = /* glsl */ `#version 300 es
precision highp float;
// The world-anchor calibration span: the mercator width of a 1280-css-px
// screen at z12.5 — the frame the dials were tuned in. All world-anchored
// texture domains (warp, weave, tiers, curtains) divide through this, so
// dial numbers keep their tuned meaning at every zoom on every device.
#define WORLD_SPAN ${(1280 / (512 * Math.pow(2, 12.5))).toExponential(8)}
in vec2 vUv;
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform vec3 uHueLab[${NE}];
uniform float uExposure;
uniform float uDominance;
uniform float uChromaFloor;
uniform float uGain;
uniform float uTimeSec;
uniform float uBreathPeriod;
uniform float uBreathAmp;
uniform int uMode;
// THE SHAPE OF FEELING: domain-warp the field lookup so blooms stop being
// circles. x=warp amplitude, y=noise scale, z=drift speed,
// w=streak (anisotropy along the flow axis).
uniform vec4 uShape;
uniform float uBand;   // aurora curtains: brightness modulation (0 = off)
// MERCATOR → SCREEN-UV (07-10, the zoom fix): every texture domain below
// (edge warp, weave threads, tier crawl, shimmer, curtains) is anchored in
// WORLD space — the same law the close-zoom grain already obeyed. The old
// screen-anchored domains re-rolled every silhouette as the camera moved:
// zooming made the whole field boil, and the screen-fraction warp
// amplitude grew past whole kernels up close, tearing blobs into
// crescents. Amplitudes/scales are calibrated at WORLD_SPAN (a 1280px
// screen at z12.5), so the tuned dials keep their meaning — zoom now
// simply magnifies the silhouette, like leaning into a painting.
uniform vec2 uM2UvX;   // d(uv)/d(mercator), row 1 — inverse screen affine
uniform vec2 uM2UvY;   // row 2 (both zero when the frame isn't derivable)
// The screen's own mercator width this frame: warp amplitude follows the
// LARGER of the world calibration and the screen fraction — the same
// px-floor-vs-meters law the kernels themselves obey, so the wide view
// keeps its living wobble while the close view stays a stable fact.
uniform float uPxSpan;
// THE LIVING ATMOSPHERE (lib/atmosphere.ts, eased): the flow axis follows
// the real wind — the field's own living motion. CONSTITUTION RULE 2: the
// sky may not grade the emotion's light; cloud/wet/snow no longer reach
// this shader at all.
uniform vec2 uAxis;    // direction the air flows toward (unit-ish)
// LAND MASK: the field inherits the coastline (rivers/harbor stay void).
// Screen → mercator is a plain affine at pitch 0, built on the CPU from
// three unprojections (the camera matrix itself is PERSPECTIVE even flat,
// so inverting it at one clip plane samples the wrong plane — review
// finding: that collapsed the whole field when the center sat on water).
uniform sampler2D uMask;
uniform float uMaskOn;
uniform vec4 uMaskRect;   // mercX0, mercY0, 1/width, 1/height
uniform vec2 uMercOrigin; // mercator at vUv (0,0) — screen bottom-left
uniform vec2 uMercDx;     // mercator delta across vUv.x (bottom-left → bottom-right)
uniform vec2 uMercDy;     // mercator delta across vUv.y (bottom-left → top-left)
uniform float uWaterAtten;
// THE LUMINOUS HEART: density peaks lift toward light (OKLab L), capped
// far below white — aurora, never fog.
uniform vec3 uHeart;      // from, to, lift
// THE WOVEN WASH (Eli's silk+pigment merge, 2026-07-08 — tune.ts WOVEN):
uniform vec2 uWeave;      // thread interleave at fronts: amp, scale
uniform float uShimmer;   // hue flow along the wind (max OKLab rotation)
uniform vec4 uTiers;      // matte layers: count, rim, richen, crawl
uniform float uTierKeep;  // tiering over the live wash beneath (0..1)
uniform vec2 uOverlap;    // genuine-overlap gate: smoothstep from, to
uniform vec2 uKnee;       // tone ceiling: knee start, hard asymptote
// THE VERSION GALLERY + FELT EMOTIONS (2026-07-09):
uniform float uSmoothWarp; // 1 = swell (few sweeping waves), 0 = 3-oct fbm
uniform float uBreathShaped; // 1 = soft-clipped exhale, 0 = plain sine
uniform float uFeltOn;    // 1 = per-emotion form + motion signatures
uniform float uVeil;      // 1 = NIGHT AIR: unbounded ambient presence
// NIGHT WEATHER (07-10): the city must not breathe like a metronome.
// breathVary makes each area's rhythm wander (a bounded rubato) and its
// depth wax/wane over minutes; meld lets genuinely-overlapping feelings
// soften each other's dominance so their colors truly interpenetrate.
uniform float uBreathVary;
uniform float uMeld;
uniform vec4 uEmoMotion[${NE}]; // period(s), amp, skew, crisp
uniform vec4 uEmoFx[${NE}];     // flicker, rise, warpMul, scaleMul
// CLOSE-ZOOM GRAIN: geographic texture (mercator-anchored — meters, not
// pixels) that resolves as you approach. amp arrives pre-gated by zoom.
uniform vec2 uGrain;      // amp (zoom-gated), 1/cell in mercator units
uniform vec2 uMercAnchor; // fixed NYC anchor — keeps fbm args small/stable
out vec4 fragColor;

// Value-noise fbm, 3 octaves — cheap enough for a half-res target.
float vhash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(vhash(i), vhash(i + vec2(1, 0)), u.x),
             mix(vhash(i + vec2(0, 1)), vhash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.7;
    a *= 0.5;
  }
  return s;
}
// SWELL — the edge-warp's own noise (2026-07-09, the germ fix): one big
// smooth octave plus a whisper of a second. Three-octave fbm gave the
// outline many small similarly-sized bumps — a cell membrane. A silhouette
// should be a few slow sweeping waves: ink drifting, silk settling.
float swell(vec2 p) {
  return (vnoise(p) + 0.28 * vnoise(p * 2.6 + 13.1)) / 1.28;
}

vec3 oklabToLinear(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
     4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
             step(0.0031308, c));
}

void main() {
  // The TRUE pixel's world position (vUv, unwarped) — shared by the land
  // mask, the close-zoom grain, and the felt-emotion clocks: geography
  // and time are facts, never weather.
  vec2 merc = uMercOrigin + uMercDx * vUv.x + uMercDy * vUv.y;

  // Free-flowing edges: pull each lookup through a slowly-drifting warp.
  // warpAmp 0 (bloom mode) short-circuits to the original circles.
  vec2 uv = vUv;
  if (uShape.x > 0.0) {
    // FELT EMOTIONS: the locally dominant feeling shapes its own edge —
    // calm swells in wide slow waves, energy runs quicker and finer.
    // One cheap unwarped pre-tap finds the local majority.
    float wm = 1.0;
    float sm = 1.0;
    // One cheap unwarped pre-tap: the local majority picks the felt edge
    // language, and the local POOLED weight anchors bright interiors
    // below — only edge skirts ride the full warp.
    vec4 t0 = texture(uField0, vUv);
    vec2 t1 = texture(uField1, vUv).xy;
    float tI[${NE}];
    ${["t0.x", "t0.y", "t0.z", "t0.w", "t1.x", "t1.y", "t1.z", "t1.w"]
      .slice(0, NE)
      .map((src, i) => `tI[${i}] = ${src};`)
      .join(" ")}
    int dTop = 0;
    float dw = -1.0;
    float tSum = 0.0;
    for (int i = 0; i < ${NE}; i++) {
      tSum += tI[i];
      if (tI[i] > dw) { dw = tI[i]; dTop = i; }
    }
    if (uFeltOn > 0.5 && dw > 0.001) { wm = uEmoFx[dTop].z; sm = uEmoFx[dTop].w; }
    // WORLD-ANCHORED (07-10): the warp is a fact of the geography — its
    // noise lives in mercator space, so a silhouette magnifies under zoom
    // instead of re-rolling, and its amplitude is a fixed ground distance.
    vec2 q = (merc - uMercAnchor) * (uShape.y * sm / WORLD_SPAN);
    // The flow axis IS the real wind (mercator y runs opposite screen y).
    vec2 axis = normalize(vec2(uAxis.x, -uAxis.y));
    // Streak stretches the noise domain along the axis (ribbons), and the
    // drift crawls the domain over time so the weather is alive, not stuck.
    vec2 along = axis * dot(q, axis);
    q = mix(q, along, uShape.w * 0.72);
    q += uTimeSec * uShape.z * vec2(1.0, -0.6);
    // The gallery chooses the edge language: swell (07-09) or fbm (older).
    vec2 w = mix(vec2(fbm(q), fbm(q + 31.416)),
                 vec2(swell(q), swell(q + 31.416)), uSmoothWarp) - 0.5;
    // Warp mostly across the axis when streaked — edges feather sideways.
    vec2 across = vec2(-axis.y, axis.x);
    vec2 wStreak = across * dot(w, across) * 1.8;
    // Amplitude: screen-proportional at the wide view (where kernels sit
    // on their px floors), a fixed ground distance up close (where they
    // are meter-true) — max() of the two spans, like the kernels.
    vec2 dm = mix(w, wStreak, uShape.w) * (uShape.x * wm * max(WORLD_SPAN, uPxSpan));
    // THE ANCHOR HOLD (the torn-crescent fix): where feeling pools deep,
    // the lookup barely moves — a bright heart can never be displaced
    // onto empty ground and read as a black bite. The thin outer skirt
    // keeps the full living undulation.
    dm *= 1.0 - 0.82 * smoothstep(0.07, 0.55, 1.0 - exp(-uExposure * tSum));
    uv += vec2(dot(uM2UvX, dm), dot(uM2UvY, dm));
  }
  vec4 f0 = texture(uField0, uv);
  vec2 f1 = texture(uField1, uv).xy;
  float I[${NE}];
  ${["f0.x", "f0.y", "f0.z", "f0.w", "f1.x", "f1.y", "f1.z", "f1.w"]
    .slice(0, NE)
    .map((src, i) => `I[${i}] = ${src};`)
    .join(" ")}

  // FELT EMOTIONS — each feeling's own clock, applied to its channel
  // BEFORE mixing, so hue-votes and brightness both live at that
  // emotion's tempo (Laban Time: sustained calm ↔ sudden energy).
  // Phase varies across the city (geography-anchored noise) so pools of
  // one feeling never beat in lockstep. Positions never move.
  if (uFeltOn > 0.5) {
    float ph = vnoise((merc - uMercAnchor) * uGrain.y * 0.06) * 0.9;
    // NIGHT WEATHER: no metronome. rub is a bounded phase wander (a few-
    // kilometer rubato — each area's rhythm quickens and lags, never
    // diverging); wax lets the breath's DEPTH drift over minutes at
    // borough scale, so some places breathe deep while others nearly
    // still, and the pattern itself slowly migrates. Brightness only —
    // positions stay facts.
    float rub = 0.0;
    float wax = 1.0;
    if (uBreathVary > 0.0) {
      vec2 gq = (merc - uMercAnchor) * uGrain.y;
      rub = (vnoise(gq * 0.045 + uTimeSec * vec2(0.021, -0.013)) - 0.5) * 1.7 * uBreathVary;
      wax = 1.0 + uBreathVary * 0.85 *
        (vnoise(gq * 0.028 + uTimeSec * vec2(0.007, 0.0045) + 41.7) - 0.5) * 2.0;
    }
    for (int i = 0; i < ${NE}; i++) {
      vec4 m = uEmoMotion[i];
      if (m.x < 0.1) continue;
      float x = 6.2831853 * (uTimeSec / m.x + ph + rub + float(i) * 0.37);
      // skew: phase-warped sine — quick swell, slow settle (buoyant joy).
      float s = sin(x - m.z * sin(x));
      // crisp: tanh sharpening — energy pulses brisk and defined.
      float cr = max(m.w, 0.001);
      s = tanh(cr * s) / tanh(cr);
      float env = 1.0 + m.y * wax * s;
      // flicker: fine, fast, tiny — candlelight for gratitude.
      if (uEmoFx[i].x > 0.0) {
        env += uEmoFx[i].x *
          (vnoise((merc - uMercAnchor) * uGrain.y * 2.4 + uTimeSec * vec2(1.3, 1.9)) - 0.5);
      }
      I[i] *= max(env, 0.0);
    }
  }

  float total = 0.0;
  for (int i = 0; i < ${NE}; i++) total += I[i];
  if (total < 0.002) discard;

  // THE MUD RULE: hues mix by dominance share (I^p), never sum. Any local
  // majority snaps the area to its hue and fronts blend over a narrow band.
  // Where near-complementary fields TIE, the average alone would pass
  // through neutral — so a chroma floor below re-saturates the front: hue
  // still rotates through the boundary, but it can never wash to gray.
  vec3 lab = vec3(0.0);
  float wsum = 0.0;
  float anchorChroma = 0.0;
  int top = 0;
  float topW = -1.0;
  // World-anchored noise domain shared by the woven-wash passes below
  // (units: reference screen-widths — see the zoom fix note at uM2UvX).
  vec2 nq = (merc - uMercAnchor) / WORLD_SPAN;

  // THE GENUINE-OVERLAP GATE (Eli, 2026-07-08: colors interact ONLY where
  // feelings truly share ground in the data). Measured, not decorative:
  // the runner-up emotion's pooled intensity as a share of the leader's,
  // AT THIS PIXEL. A blob alone gates to 0 — its hue holds perfectly
  // still; a real meeting of feelings opens the gate to 1.
  float top1 = 0.0;
  float top2 = 0.0;
  for (int i = 0; i < ${NE}; i++) {
    if (I[i] > top1) { top2 = top1; top1 = I[i]; }
    else if (I[i] > top2) { top2 = I[i]; }
  }
  float overlap = smoothstep(uOverlap.x, uOverlap.y, top2 / max(top1, 1e-5));

  // THE MELD (07-10): where feelings genuinely share ground, dominance
  // itself relaxes — the meeting is a real interpenetration of color, not
  // one hue snapping over the other. Lone blobs are untouched (overlap 0).
  float domP = uDominance * (1.0 - uMeld * overlap);

  for (int i = 0; i < ${NE}; i++) {
    float w = pow(I[i], domP);
    // THE WEAVE (from silk): where feelings GENUINELY meet, threads of
    // each interleave through the front — per-emotion bands of slow noise
    // tilt the local vote, so neighbors meld as woven strands, never a
    // hard seam and never one averaged smear. Gated by the overlap above
    // (belt to its by-construction suspenders: with one emotion present,
    // tilting its own vote is a no-op anyway).
    // The flow clock is brisk ON PURPOSE: the overlap gate holds every
    // lone feeling perfectly still, so speed here only animates genuine
    // meetings (measured 2026-07-08: at 0.025 the interaction was lost
    // under the breath's noise floor).
    float band = vnoise(nq * uWeave.y + float(i) * 17.31 + uTimeSec * 0.08);
    w *= 1.0 + uWeave.x * (band - 0.5) * 2.0 * overlap;
    lab += w * uHueLab[i];
    anchorChroma += w * length(uHueLab[i].yz);
    wsum += w;
    if (w > topW) { topW = w; top = i; }
  }
  lab /= max(wsum, 1e-6);
  anchorChroma /= max(wsum, 1e-6);
  float c = length(lab.yz);
  float cMin = uChromaFloor * anchorChroma;
  // Direction is unstable at an exact tie — lean on the local winner.
  vec2 dir = c > 1e-4 ? lab.yz / c : normalize(uHueLab[top].yz);
  lab.yz = dir * max(c, cMin);

  // Pooled feeling → light through a filmic knee: more feeling = brighter,
  // asymptotically — never white. The low end is linear: the long fade.
  float b = 1.0 - exp(-uExposure * total);

  // THE VEIL (07-10, "night air"): emotion as ATMOSPHERE, not object.
  // A gamma above 1 stretches the low end into a long continuous fade —
  // there is no radius where presence "ends", only air that gradually
  // stops being warm. Plus heat-shimmer: fine geographic air-movement in
  // the body of the light, the way warmth reads over a street at night.
  if (uVeil > 0.5) {
    b = pow(max(b, 0.0), 1.35);
    float air = fbm((merc - uMercAnchor) * uGrain.y * 0.8 + uTimeSec * vec2(0.014, -0.009));
    b *= 1.0 + 0.11 * (air - 0.5) * 2.0 * smoothstep(0.02, 0.18, b);
  }

  // THE LAND MASK — geography shapes the feeling: the field dies over
  // water so rivers and harbor stay pure void and every silhouette
  // inherits the coastline.
  if (uMaskOn > 0.5) {
    vec2 muv = vec2((merc.x - uMaskRect.x) * uMaskRect.z,
                    (merc.y - uMaskRect.y) * uMaskRect.w);
    float land = smoothstep(0.12, 0.82, texture(uMask, muv).r);
    b *= mix(uWaterAtten, 1.0, land);
  }

  // ---- THE WOVEN WASH (Eli's silk+pigment merge, 2026-07-08) ----------
  // From SILK — the hue flows: a slow OKLab rotation riding the wind.
  // GATED BY GENUINE OVERLAP (Eli's correctness rule): a lone feeling's
  // hue is a fact and holds still; only where two feelings truly share
  // ground does the color visibly flow between them.
  {
    vec2 axis2 = normalize(vec2(uAxis.x, -uAxis.y));
    float along = dot(nq, axis2);
    float rot = (fbm(vec2(along * 5.0 - uTimeSec * 0.12, 4.7)) - 0.5) * 2.0 * uShimmer * overlap;
    float cr = cos(rot);
    float sr = sin(rot);
    lab.yz = mat2(cr, -sr, sr, cr) * lab.yz;
  }
  // From PIGMENT — layered matte depth: pooled feeling settles into
  // translucent tiers, pigment pools a breath darker along each contour
  // (watercolor edge), deep pools carry more pigment (richer and a touch
  // deeper — matte, never glassy). The contours crawl slowly, like paint
  // still deciding where to dry — and the live wash beneath keeps the
  // tiers reading as stacked layers, not posterization.
  {
    float crawl = (fbm(nq * 3.0 + uTimeSec * 0.01) - 0.5) * uTiers.w;
    float lv = clamp(b + crawl, 0.0, 1.0) * uTiers.x;
    float f = fract(lv);
    float soft = smoothstep(0.35, 0.65, f);
    float b2 = (floor(lv) + soft) / uTiers.x;
    float rim = exp(-pow((f - 0.5) / 0.11, 2.0));
    b = mix(b, b2 * (1.0 - uTiers.y * rim), uTierKeep);
    lab.yz *= 1.0 + uTiers.z * b2;
    lab.x -= 0.04 * uTiers.z * b2;
  }

  // CLOSE-ZOOM GRAIN (2026-07-08): fine pigment mottle anchored in the
  // WORLD, not the screen — zooming in resolves finer structure the way
  // paper grain emerges as you lean into a painting. Zoom-gated on the
  // CPU (amp 0 at the wide view keeps the quilt smooth); scaled by b so
  // the skirt stays clean; matte modulation only, never sparkle.
  if (uGrain.x > 0.0) {
    float g = fbm((merc - uMercAnchor) * uGrain.y);
    b *= 1.0 + uGrain.x * (g - 0.5) * 2.0 * smoothstep(0.04, 0.28, b);
  }

  // FELT EMOTIONS — joy's rising light (Kandinsky: yellow moves outward,
  // toward the viewer): where joy holds ground, a slow band of inner
  // light travels UP through the pool — catching light, not throbbing.
  // Brightness only; the shape never moves.
  if (uFeltOn > 0.5) {
    float joyShare = I[${Math.max(0, EMOTIONS.indexOf("joy"))}] / max(total, 1e-5);
    if (joyShare > 0.01) {
      vec2 rq = (merc - uMercAnchor) * uGrain.y * 0.45;
      float rise = vnoise(vec2(rq.x, rq.y + uTimeSec * 0.09));
      b *= 1.0 + uEmoFx[${Math.max(0, EMOTIONS.indexOf("joy"))}].y * joyShare * (rise - 0.5) * 2.0;
    }
  }

  // THE LUMINOUS HEART: where pooled feeling peaks, the hue itself lifts
  // toward light — bright AND saturated, capped well below white.
  lab.x += uHeart.z * smoothstep(uHeart.x, uHeart.y, b);

  // THE NEVER-WHITE CEILING (Eli, 2026-07-07): no matter how much feeling
  // pools — saturated knee, heart lift, the palest anchor (lilac) — the
  // field's lightness is hard-capped. Dusty at its very brightest; the
  // color must always still read as COLOR.
  lab.x = min(lab.x, 0.8);

  // The living tide: a slow exhale, phase-varied across hues. The sine is
  // soft-clipped (s − 0.22s³): flattened crests read as a breath held and
  // released — fabric settling — where a pure sine read as a throb. The
  // gallery chooses the waveform; under FELT EMOTIONS the per-channel
  // clocks above carry the life and this global tide stands down.
  float phase = fract(lab.y * 3.7 + lab.z * 5.3);
  float bs = sin(6.2831853 * (uTimeSec / uBreathPeriod + phase));
  float bwave = mix(bs, (bs - 0.22 * bs * bs * bs) * 1.28, uBreathShaped);
  b *= 1.0 + uBreathAmp * bwave * (1.0 - uFeltOn);

  // Aurora curtains: slow luminous banding across the flow axis. Modulation
  // only — never to zero, so the field's coverage is untouched.
  if (uBand > 0.0) {
    vec2 axisB = normalize(vec2(uAxis.x, -uAxis.y));
    float across = dot(nq, vec2(-axisB.y, axisB.x));
    float curtain = fbm(vec2(across * 9.0, uTimeSec * 0.05));
    b *= 1.0 + uBand * (curtain - 0.5) * 1.6;
  }

  // CONSTITUTION RULE 2: the sky's weight no longer touches the field —
  // the emotion layer renders identically in every weather. (The old
  // overcast dim, rain streak, snow hush, and snow sparkle lived here.)

  // Dither so the long tail never bands on 8-bit output.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  b += (n - 0.5) * 0.004;

  // uMode 2 — WATERCOLOR PIGMENT (the light "paper" day): instead of adding
  // light, stain the paper. Caller blends ZERO/SRC_COLOR (true multiply);
  // uGain carries paperness × fade as stain strength. Pigment is the same
  // OKLab hue, dropped to pigment depth so it reads saturated on white.
  if (uMode == 2) {
    // Pigment depth is capped on purpose: heavily-pooled spots must read as
    // deeper watercolor, never a bruise — but the wash must still carry the
    // city's feeling at a glance (design-review: stain to .58, pigment L .64).
    vec3 pig = linearToSrgb(oklabToLinear(vec3(0.64, lab.y * 1.35, lab.z * 1.35)));
    float stain = min(0.58, max(b, 0.0) * 0.8) * uGain;
    fragColor = vec4(mix(vec3(1.0), pig, stain), 1.0);
    return;
  }

  // GAMUT (2026-07-09, the red-hot fix): richen + the chroma floor can
  // push warm hues OUT of sRGB gamut; letting the framebuffer clip each
  // channel skewed dense coral pools toward hot salmon (R saturating
  // first). Normalizing the whole linear color instead preserves the
  // chromaticity exactly — the color deepens, it never distorts.
  vec3 lin = max(oklabToLinear(lab), 0.0);
  lin /= max(1.0, max(lin.r, max(lin.g, lin.b)));
  vec3 color = linearToSrgb(lin) * max(b, 0.0) * uGain;

  // THE TONE CEILING — HDR-style soft knee on the peak CHANNEL (scalar
  // scale = hue-preserving): identity below uKnee.x, asymptote at
  // uKnee.y. Where many feelings stack, the additive sum now compresses
  // into a richer, deeper color — warm at the densest point, never hot.
  float m = max(color.r, max(color.g, color.b));
  if (m > uKnee.x) {
    float span = uKnee.y - uKnee.x;
    color *= (uKnee.x + span * (1.0 - exp(-(m - uKnee.x) / span))) / m;
  }

  // uMode 0: alpha 0 under mapbox's premultiplied blend == pure additive.
  // uMode 1: caller sets blendFunc(DST_COLOR, ONE) — color multiplies the
  //          base map, so streets inside the field catch its light.
  fragColor = vec4(color, 0.0);
}
`;

/* ---------------- the layer ---------------- */

const CHANNEL: Record<string, number> = Object.fromEntries(
  EMOTIONS.map((e, i) => [e, i]),
);
const FLOATS_PER_INSTANCE = 5; // mercX, mercY, radiusMerc, weight, channel


function compile(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`warmth field shader: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`warmth field link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

export class GalleryFieldLayer implements CustomLayerInterface {
  id = "emotion-field";
  type = "custom" as const;
  renderingMode = "2d" as const;

  /** Public↔private crossfade (0..1): rides the gain uniforms, and at 0 the
   *  whole field (accumulation included) costs nothing. Set from MapStage. */
  fade = 1;

  /** THE SHAPE OF FEELING — plain uniform values (the woven wash is the
   *  one identity; the atmosphere drives these live). Set from MapStage. */
  look: { warpAmp: number; scale: number; drift: number; streak: number; band: number } = {
    ...SHAPES.woven,
  };

  /** 0 = dark ink night (glow), 1 = light paper day (pigment). Set from
   *  MapStage every frame from the atmosphere; crossfades the two ways of
   *  painting. */
  paper = 0;


  /** THE LIVING ATMOSPHERE — plain fields mutated in place from MapStage
   *  every push (no allocation): the sky's weight on the light. */
  /** What the sky may still hand the field: the wind axis (its living
   *  flow), fog (dims the STREETLIGHT catch only), wet (the glisten).
   *  Cloud/snow no longer cross this boundary — constitution rule 2. */
  weather = { wet: 0, fog: 0, axisX: 0.94, axisY: 0.33 };

  private map: MapboxMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private accumProgram: WebGLProgram | null = null;
  private resolveProgram: WebGLProgram | null = null;
  private blurProgram: WebGLProgram | null = null;
  private compositeProgram: WebGLProgram | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private fbo2: WebGLFramebuffer | null = null; // single-attachment passes
  private tex: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private fieldColorTex: WebGLTexture | null = null;
  private bloomTex: [WebGLTexture | null, WebGLTexture | null] = [null, null];
  private bloomW = 0;
  private bloomH = 0;
  private timeSec = 0;
  private bloomReady = false;
  private texW = 0;
  private texH = 0;
  private halfFloat = false;
  private quadVao: WebGLVertexArrayObject | null = null;
  private resolveVao: WebGLVertexArrayObject | null = null;
  private instanceBuf: WebGLBuffer | null = null;
  private instanceData = new Float32Array(0);
  private count = 0;
  private uploaded = false;
  private epoch = 0;
  private hueLab = new Float32Array(NE * 3);
  private maskTex: WebGLTexture | null = null;
  private maskReady = false;
  private maskRect: [number, number, number, number] = [0, 0, 1, 1];
  /** Screen→mercator affine (pitch 0): origin at screen bottom-left plus
   *  the two screen-edge deltas, rebuilt each frame from unproject. */
  private mercFrame = { ox: 0, oy: 0, dxx: 0, dxy: 0, dyx: 0, dyy: 0, ok: false };
  /** Grain geometry: fixed NYC anchor (keeps shader fbm args small and
   *  stable) + 1/cell in mercator units. Set once in onAdd. */
  private mercAnchor: [number, number] = [0, 0];
  private grainScale = 0;
  /** FELT EMOTIONS uniform arrays (period/amp/skew/crisp + flicker/rise/
   *  warpMul/scaleMul per channel), packed once from tune.FELT. */
  private emoMotion = new Float32Array(NE * 4);
  private emoFx = new Float32Array(NE * 4).fill(1);

  constructor() {
    EMOTIONS.forEach((e, i) => {
      // World-aware hue (solar.emotionHue — the one PIGMENT.hues gate):
      // every gallery look stands on the night city today, so this is the
      // brand palette verbatim; if a gallery look ever crosses to paper,
      // its pigment (uMode 2) picks up the paper overrides for free.
      const [, a, b] = hexToOklab(emotionHue(e));
      // Equal feeling = equal light: anchors share one OKLab lightness
      // (raw hues span a wide L range, which made cooler hues glow dimmer
      // than Joy for the same intensity). Hue stays the brand's; chroma
      // carries the anchorChroma push (pop, never neon — Eli, 2026-07-08).
      this.hueLab[i * 3] = FIELD.anchorL;
      this.hueLab[i * 3 + 1] = a * FIELD.anchorChroma;
      this.hueLab[i * 3 + 2] = b * FIELD.anchorChroma;
    });
  }

  /** Rebuild instance data from the store (called on version bumps). */
  setData(points: LivePoint[]) {
    const n = points.length;
    if (this.instanceData.length < n * FLOATS_PER_INSTANCE) {
      this.instanceData = new Float32Array(
        Math.max(64, n * 2) * FLOATS_PER_INSTANCE,
      );
      this.floorPx = new Float32Array(Math.max(64, n * 2));
      this.isSeed = new Uint8Array(Math.max(64, n * 2));
    }
    const d = this.instanceData;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      // TWO LAYERS, ONE FIELD (2026-07-08): entries (commits + pocket
      // seeds) are TIGHT, defined, pinned to their place. The wash
      // lattice keeps the wide dim skirt that carries the between-space,
      // so zoomed out the city is one continuous glow. The entry floor
      // scales with intensity: at middle distance everything sits on its
      // pixel floor, and one flat floor turned the city into uniform
      // polka dots (the medium-zoom valley, Eli 2026-07-08).
      // Geometry dials read through THE GALLERY (a look switch re-feeds
      // this whole buffer via MapStage's subscription). Under FELT
      // EMOTIONS each feeling also has its own footprint: calm settles
      // wide and soft, energy holds tight and defined, love reaches.
      const lk = currentLook().config.dials;
      const feltMul = lk.felt ? (FELT[p.emotion]?.radiusMul ?? 1) : 1;
      this.floorPx[i] = p.wash
        ? FIELD.wash.minRadiusPx
        : lk.minRadiusPx * (0.78 + 0.055 * (p.intensity - 1)) * feltMul;
      // Only the WASH thins with zoom (it's a city-scale impression);
      // pocket seeds are stand-ins for real entries and must intensify on
      // approach exactly as commits do — the density payoff (2026-07-08).
      this.isSeed[i] = p.wash ? 1 : 0;
      const mc = mapboxgl.MercatorCoordinate.fromLngLat({
        lng: p.position[0],
        lat: p.position[1],
      });
      const radiusM = p.wash
        ? FIELD.wash.radiusM
        : (lk.radiusM + lk.radiusPerIntensityM * (p.intensity - 1)) * feltMul;
      const o = i * FLOATS_PER_INSTANCE;
      d[o] = mc.x;
      d[o + 1] = mc.y;
      d[o + 2] = radiusM * mc.meterInMercatorCoordinateUnits();
      d[o + 3] = p.weight;
      d[o + 4] = CHANNEL[p.emotion] ?? 0;
    }
    this.count = n;
    this.uploaded = false;
  }

  onAdd(map: MapboxMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.gl = gl;
    this.halfFloat = gl.getExtension("EXT_color_buffer_half_float") !== null;
    this.accumProgram = compile(gl, ACCUM_VS, ACCUM_FS);
    this.resolveProgram = compile(gl, RESOLVE_VS, RESOLVE_FS);
    this.blurProgram = compile(gl, RESOLVE_VS, BLUR_FS);
    this.compositeProgram = compile(gl, RESOLVE_VS, COMPOSITE_FS);

    // Quad geometry + instance buffer.
    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instanceBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
    const stride = FLOATS_PER_INSTANCE * 4;
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(2, 1);
    this.resolveVao = gl.createVertexArray(); // fullscreen triangle: no attribs
    gl.bindVertexArray(null);
    this.fbo = gl.createFramebuffer();
    this.fbo2 = gl.createFramebuffer();

    // THE LAND MASK — the coastline as a mercator-space texture (built by
    // scripts/build-landmask.mjs). Loads async; until then (or on failure)
    // the field simply doesn't clip — never a blocker.
    const [[west, south], [east, north]] = CAMERA.maxBounds;
    const tl = mapboxgl.MercatorCoordinate.fromLngLat({ lng: west, lat: north });
    const br = mapboxgl.MercatorCoordinate.fromLngLat({ lng: east, lat: south });
    this.maskRect = [tl.x, tl.y, 1 / (br.x - tl.x), 1 / (br.y - tl.y)];
    // Grain anchor + scale (mercator units per meter is ~constant citywide).
    const anchor = mapboxgl.MercatorCoordinate.fromLngLat({
      lng: CAMERA.initial.longitude,
      lat: CAMERA.initial.latitude,
    });
    this.mercAnchor = [anchor.x, anchor.y];
    this.grainScale = 1 / (FIELD.grain.cellM * anchor.meterInMercatorCoordinateUnits());
    // Pack the felt-emotion signatures in channel order.
    for (let i = 0; i < EMOTIONS.length; i++) {
      const be = FELT[EMOTIONS[i]];
      if (!be) continue;
      this.emoMotion.set([be.period, be.amp, be.skew, be.crisp], i * 4);
      this.emoFx.set([be.flicker, be.rise, be.warpMul, be.scaleMul], i * 4);
    }
    const img = new Image();
    img.onload = () => {
      if (!this.gl) return;
      const g = this.gl;
      this.maskTex = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, this.maskTex);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      g.texImage2D(g.TEXTURE_2D, 0, g.R8, g.RED, g.UNSIGNED_BYTE, img);
      this.maskReady = true;
      this.map?.triggerRepaint();
    };
    img.onerror = () => console.error("warmth: land mask failed to load");
    img.src = FIELD.landMask.url;
  }

  /** Make (or remake on resize) a plain RGBA8 linear-clamped texture. */
  private makeTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  private ensureTargets(gl: WebGL2RenderingContext) {
    const w = Math.max(2, Math.round(gl.drawingBufferWidth * FIELD.resolutionScale));
    const h = Math.max(2, Math.round(gl.drawingBufferHeight * FIELD.resolutionScale));
    if (w === this.texW && h === this.texH && this.tex[0]) return;
    this.texW = w;
    this.texH = h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    for (let i = 0; i < 2; i++) {
      if (this.tex[i]) gl.deleteTexture(this.tex[i]);
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // RGBA16F where the platform allows (iOS 15+ does); RGBA8 fallback
      // with headroom sacrificed (weights still pool, knee still applies).
      if (this.halfFloat) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0 + i,
        gl.TEXTURE_2D,
        t,
        0,
      );
      this.tex[i] = t;
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    // Bloom targets: field-res color + two blur ping-pongs at bloom scale.
    if (this.fieldColorTex) gl.deleteTexture(this.fieldColorTex);
    for (const t of this.bloomTex) if (t) gl.deleteTexture(t);
    this.fieldColorTex = this.makeTex(gl, w, h);
    this.bloomW = Math.max(2, Math.round(w * WEATHER.bloom.scale));
    this.bloomH = Math.max(2, Math.round(h * WEATHER.bloom.scale));
    this.bloomTex = [
      this.makeTex(gl, this.bloomW, this.bloomH),
      this.makeTex(gl, this.bloomW, this.bloomH),
    ];
  }

  /** Offscreen accumulation — mapbox's sanctioned hook for FBO work. */
  prerender(gl: WebGL2RenderingContext, matrix: number[]) {
    this.bloomReady = false;
    if (!this.accumProgram || !this.map || this.fade < 0.01) return;
    // One clock per frame, shared by every pass — the bloom's halo must
    // warp in perfect sync with the sharp field beneath it.
    if (this.epoch === 0) this.epoch = performance.now();
    this.timeSec = (performance.now() - this.epoch) / 1000;
    // Land mask sampling needs screen → mercator. With pitch locked at 0
    // that map is an exact affine; three unprojections define it. (Never
    // invert the camera matrix here — it is perspective even when flat,
    // and a one-plane inversion collapses the field: review finding.)
    try {
      const w = this.map.getContainer().clientWidth;
      const h = this.map.getContainer().clientHeight;
      const bl = mapboxgl.MercatorCoordinate.fromLngLat(this.map.unproject([0, h]));
      const br = mapboxgl.MercatorCoordinate.fromLngLat(this.map.unproject([w, h]));
      const tl = mapboxgl.MercatorCoordinate.fromLngLat(this.map.unproject([0, 0]));
      this.mercFrame = {
        ox: bl.x,
        oy: bl.y,
        dxx: br.x - bl.x,
        dxy: br.y - bl.y,
        dyx: tl.x - bl.x,
        dyy: tl.y - bl.y,
        ok: true,
      };
    } catch {
      this.mercFrame.ok = false;
    }
    this.ensureTargets(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.texW, this.texH);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (this.count === 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      return;
    }

    gl.useProgram(this.accumProgram);
    gl.bindVertexArray(this.quadVao);

    // Radius pixel clamps happen HERE (zoom changes without data changes):
    // clamp in mercator units derived from the current zoom. The floor is
    // per-point (seed sheet vs lonely commit — see setData).
    const zoom = this.map.getZoom();
    const mercPerCssPx = 1 / (512 * Math.pow(2, zoom));
    const maxMerc = FIELD.maxRadiusPx * mercPerCssPx;
    if (!this.uploaded || this.clampScale !== mercPerCssPx) {
      // Re-upload with clamped radii (cheap: ≤500 × 20 bytes).
      const n = this.count;
      const src = this.instanceData;
      if (this.clamped.length < n * FLOATS_PER_INSTANCE) {
        this.clamped = new Float32Array(src.length);
      }
      this.clamped.set(src.subarray(0, n * FLOATS_PER_INSTANCE));
      // The ambient wash is a city-scale impression: it thins to a quiet
      // floor as you zoom into a neighborhood (real commits stay). Smooth-
      // step, so the fade is continuous with the camera — and never zero:
      // no place reads as a void at street level (Eli, 2026-07-08).
      const sf = FIELD.seedZoomFade;
      const zt = Math.min(1, Math.max(0, (zoom - sf.from) / (sf.to - sf.from)));
      const seedFade = 1 - (1 - sf.floor) * zt * zt * (3 - 2 * zt);
      for (let i = 0; i < n; i++) {
        const o = i * FLOATS_PER_INSTANCE + 2;
        const minMerc = this.floorPx[i] * mercPerCssPx;
        this.clamped[o] = Math.min(maxMerc, Math.max(minMerc, src[o]));
        if (this.isSeed[i]) this.clamped[o + 1] = src[o + 1] * seedFade;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.clamped.subarray(0, n * FLOATS_PER_INSTANCE), gl.DYNAMIC_DRAW);
      this.uploaded = true;
      this.clampScale = mercPerCssPx;
    }

    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.accumProgram, "uMatrix"),
      false,
      matrix,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.accumProgram, "uSoftness"),
      // One softness in every sky (constitution rule 2) — but the GALLERY
      // may choose it: "night air" runs long diffuse skirts (1.35), the
      // pool looks run defined hearts (2.5).
      currentLook().config.dials.kernelSoftness,
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);

    // BLOOM (v2, night only): resolve the field into a color texture, blur
    // it wide (Kawase ×2, thresholded so only bright feeling blooms), and
    // let render() add the halo. All FBO work stays in this sanctioned hook.
    const night = 1 - this.paper;
    if (WEATHER.bloom.gain > 0 && night > 0.01 && this.fbo2) {
      gl.disable(gl.BLEND);
      // 1) the field's own color, full resolve, into fieldColorTex.
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo2);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fieldColorTex, 0,
      );
      gl.viewport(0, 0, this.texW, this.texH);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.bindResolve(gl);
      gl.uniform1i(this.loc(gl, this.resolveProgram!, "res", "uMode"), 0);
      gl.uniform1f(this.loc(gl, this.resolveProgram!, "res", "uGain"), currentLook().config.dials.gain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // 2) blur down into bloomTex[0] (thresholded), then widen into [1].
      gl.useProgram(this.blurProgram!);
      const passes: [WebGLTexture | null, WebGLTexture | null, number, number, number, number][] = [
        [this.fieldColorTex, this.bloomTex[0], 1 / this.texW, 1 / this.texH, 1.5, WEATHER.bloom.threshold],
        [this.bloomTex[0], this.bloomTex[1], 1 / this.bloomW, 1 / this.bloomH, 2.5, 0],
      ];
      for (const [src, dst, tx, ty, offset, threshold] of passes) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, dst, 0);
        gl.viewport(0, 0, this.bloomW, this.bloomH);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1i(this.loc(gl, this.blurProgram!, "blur", "uSrc"), 0);
        gl.uniform2f(this.loc(gl, this.blurProgram!, "blur", "uTexel"), tx, ty);
        gl.uniform1f(this.loc(gl, this.blurProgram!, "blur", "uOffset"), offset);
        gl.uniform1f(this.loc(gl, this.blurProgram!, "blur", "uThreshold"), threshold);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.bindVertexArray(null);
      this.bloomReady = true;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  private clamped = new Float32Array(0);
  private clampScale = -1;
  private floorPx = new Float32Array(0);
  private isSeed = new Uint8Array(0);
  private uniformCache = new Map<string, WebGLUniformLocation | null>();

  /** Uniform-location cache across our four programs. */
  private loc(
    gl: WebGL2RenderingContext,
    prog: WebGLProgram,
    tag: string,
    name: string,
  ): WebGLUniformLocation | null {
    const key = `${tag}:${name}`;
    let l = this.uniformCache.get(key);
    if (l === undefined) {
      l = gl.getUniformLocation(prog, name);
      this.uniformCache.set(key, l);
    }
    return l;
  }

  /** Program + VAO + every shared resolve uniform (mode/gain per pass). */
  private bindResolve(gl: WebGL2RenderingContext) {
    gl.useProgram(this.resolveProgram!);
    gl.bindVertexArray(this.resolveVao);
    const u = (name: string) => this.loc(gl, this.resolveProgram!, "res", name);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[1]);
    gl.uniform1i(u("uField0"), 0);
    gl.uniform1i(u("uField1"), 1);
    gl.uniform3fv(u("uHueLab"), this.hueLab);
    // THE VERSION GALLERY: every overridable dial reads through the live
    // look — switching iterations is a uniform change, never a rebuild.
    const lk = currentLook().config;
    const d = lk.dials;
    gl.uniform1f(u("uExposure"), d.exposure);
    gl.uniform1f(u("uDominance"), d.dominance);
    gl.uniform1f(u("uChromaFloor"), FIELD.chromaFloor);
    gl.uniform1f(u("uTimeSec"), this.timeSec);
    gl.uniform1f(u("uBreathPeriod"), d.breathPeriodMs / 1000);
    gl.uniform1f(u("uBreathAmp"), d.breathAmp);
    gl.uniform1f(u("uBreathShaped"), d.breathShaped);
    gl.uniform2f(u("uWeave"), d.weaveAmp, WOVEN.weave.scale);
    gl.uniform1f(u("uShimmer"), d.shimmer);
    gl.uniform4f(u("uTiers"), WOVEN.tiers.count, WOVEN.tiers.rim, d.richen, WOVEN.tiers.crawl);
    gl.uniform1f(u("uTierKeep"), d.tierKeep);
    // Gate off = the pre-07-08 ungated flow (smoothstep saturates at 1).
    // A look may open the gate earlier (night weather: interaction reads
    // where feelings merely lean into each other, not only dead-center).
    if (d.overlapGate)
      gl.uniform2f(
        u("uOverlap"),
        d.overlapFrom ?? WOVEN.overlap.from,
        d.overlapTo ?? WOVEN.overlap.to,
      );
    else gl.uniform2f(u("uOverlap"), -2.0, -1.0);
    // Knee off = the pre-07-09 raw output (start above any real value).
    if (d.toneKnee) gl.uniform2f(u("uKnee"), FIELD.tone.kneeFrom, FIELD.tone.cap);
    else gl.uniform2f(u("uKnee"), 9.0, 9.5);
    gl.uniform1f(u("uSmoothWarp"), lk.shape.smoothWarp);
    gl.uniform1f(u("uFeltOn"), d.felt);
    gl.uniform1f(u("uVeil"), d.veil);
    gl.uniform1f(u("uBreathVary"), d.breathVary ?? 0);
    gl.uniform1f(u("uMeld"), d.meld ?? 0);
    gl.uniform4fv(u("uEmoMotion"), this.emoMotion);
    gl.uniform4fv(u("uEmoFx"), this.emoFx);
    gl.uniform4f(u("uShape"), this.look.warpAmp, this.look.scale, this.look.drift, this.look.streak);
    gl.uniform1f(u("uBand"), this.look.band);
    const w = this.weather;
    gl.uniform2f(u("uAxis"), w.axisX, w.axisY);
    // Screen → world (shared by the land mask, the grain, and every
    // world-anchored texture domain); features gate off when the frame
    // isn't derivable. The inverse (world → screen-uv) carries the edge
    // warp's mercator displacement back into the texture lookup.
    const mf = this.mercFrame;
    if (mf.ok) {
      gl.uniform2f(u("uMercOrigin"), mf.ox, mf.oy);
      gl.uniform2f(u("uMercDx"), mf.dxx, mf.dxy);
      gl.uniform2f(u("uMercDy"), mf.dyx, mf.dyy);
      const det = mf.dxx * mf.dyy - mf.dyx * mf.dxy;
      if (Math.abs(det) > 1e-20) {
        gl.uniform2f(u("uM2UvX"), mf.dyy / det, -mf.dyx / det);
        gl.uniform2f(u("uM2UvY"), -mf.dxy / det, mf.dxx / det);
      } else {
        gl.uniform2f(u("uM2UvX"), 0, 0);
        gl.uniform2f(u("uM2UvY"), 0, 0);
      }
    } else {
      // No frame → no warp this frame (a rare transient; never garbage).
      gl.uniform2f(u("uM2UvX"), 0, 0);
      gl.uniform2f(u("uM2UvY"), 0, 0);
    }
    // The coastline (off until the mask texture lands — never a blocker).
    const maskOn = this.maskReady && mf.ok;
    gl.uniform1f(u("uMaskOn"), maskOn ? 1 : 0);
    if (maskOn) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.uniform1i(u("uMask"), 2);
      gl.uniform4f(u("uMaskRect"), ...this.maskRect);
      gl.uniform1f(u("uWaterAtten"), FIELD.landMask.waterAtten);
    }
    // The screen's mercator width (warp amplitude's px-floor law).
    const zNow = this.map?.getZoom() ?? 0;
    const cssW = this.map?.getContainer().clientWidth ?? 1280;
    gl.uniform1f(u("uPxSpan"), cssW / (512 * Math.pow(2, zNow)));
    // Close-zoom grain: amp fades in as the camera commits to a place.
    const gz = FIELD.grain.zoomIn;
    const gt = Math.min(1, Math.max(0, (zNow - gz.from) / (gz.to - gz.from)));
    const grainAmp = mf.ok ? FIELD.grain.amp * gt * gt * (3 - 2 * gt) : 0;
    gl.uniform2f(u("uGrain"), grainAmp, this.grainScale);
    gl.uniform2f(u("uMercAnchor"), this.mercAnchor[0], this.mercAnchor[1]);
    gl.uniform3f(u("uHeart"), FIELD.heart.from, FIELD.heart.to, d.heartLift);
  }

  render(gl: WebGL2RenderingContext) {
    if (!this.resolveProgram || this.count === 0 || this.fade < 0.01) return;
    this.bindResolve(gl);
    const u = (name: string) => this.loc(gl, this.resolveProgram!, "res", name);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // THE ZOOM NARRATIVE: close up, the field thins into breathing ambient
    // light (never zero) so the city shows through. The streetlight pass is
    // deliberately NOT thinned — it is the city glowing through.
    const zt = FIELD.zoomThin;
    const zoom = this.map?.getZoom() ?? 0;
    const zx = Math.min(1, Math.max(0, (zoom - zt.from) / (zt.to - zt.from)));
    const thin = 1 - (1 - zt.floor) * zx * zx * (3 - 2 * zx);

    // By day (paper → 1) the glow passes hand off to the pigment pass:
    // light added to a light map is invisible, so feeling stains instead.
    const night = 1 - this.paper;
    const w = this.weather;
    // CONSTITUTION RULE 2: fog may dim what the STREETS catch (the base
    // map's response) but never the emotion passes themselves.
    const fogStreet = 1 - WEATHER.fogStreetDim * w.fog;

    // Pass 0 — watercolor pigment onto the paper (true multiply; the
    // parked day — inert while paper is clamped to 0).
    if (this.paper > 0.01) {
      gl.uniform1i(u("uMode"), 2);
      gl.uniform1f(u("uGain"), this.paper * this.fade);
      gl.blendFunc(gl.ZERO, gl.SRC_COLOR);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Pass 1 — streetlight: field × base map (dst is the pure ink city).
    // Gated past half-paper: brightening a light ground is invisible, so
    // twilight never pays for three full passes (design-review flag).
    // Wet streets catch more of the light — the rain's glisten.
    if (FIELD.streetlightGain > 0 && night > 0.01 && this.paper <= 0.5) {
      gl.uniform1i(u("uMode"), 1);
      gl.uniform1f(
        u("uGain"),
        FIELD.streetlightGain * this.fade * night * fogStreet * (1 + WEATHER.glistenGain * w.wet),
      );
      gl.blendFunc(gl.DST_COLOR, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Pass 2 — the field itself. SCREEN blend, not raw addition: light
    // saturates asymptotically toward its own hue and the pass stack can
    // never sum to pure white on the map (constitution rule 3 — review
    // blocker: five pooled commits used to clip to rgb(253,253,253)).
    // Over the near-black base, screen ≈ additive; only the top end bends.
    if (night > 0.01) {
      gl.uniform1i(u("uMode"), 0);
      gl.uniform1f(u("uGain"), currentLook().config.dials.gain * this.fade * night * thin);
      gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Pass 3 — BLOOM: the halo of feeling, added over the night city.
    // (Prepared in prerender; the sky never grades it — rule 2.)
    if (this.bloomReady && this.compositeProgram) {
      gl.useProgram(this.compositeProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[1]);
      gl.uniform1i(this.loc(gl, this.compositeProgram, "comp", "uSrc"), 0);
      // The halo bows out on approach (bloom.closeFade): zoomed in, the
      // pooled interior beats the threshold everywhere and halo-over-field
      // converged the screen toward white (Eli's veto).
      const bf = WEATHER.bloom.closeFade;
      const bz = Math.min(1, Math.max(0, (zoom - bf.from) / (bf.to - bf.from)));
      gl.uniform1f(
        this.loc(gl, this.compositeProgram, "comp", "uGain"),
        WEATHER.bloom.gain * this.fade * night * thin * (1 - bz * bz * (3 - 2 * bz)),
      );
      // Screen, like the field pass: the halo brightens what is dim and
      // asymptotes over what is already lit — never white (rule 3).
      gl.blendFunc(gl.ONE_MINUS_DST_COLOR, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindVertexArray(null);
  }

  onRemove(_map: MapboxMap, gl: WebGL2RenderingContext) {
    if (this.maskTex) gl.deleteTexture(this.maskTex);
    for (const t of this.tex) if (t) gl.deleteTexture(t);
    for (const t of this.bloomTex) if (t) gl.deleteTexture(t);
    if (this.fieldColorTex) gl.deleteTexture(this.fieldColorTex);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.fbo2) gl.deleteFramebuffer(this.fbo2);
    if (this.accumProgram) gl.deleteProgram(this.accumProgram);
    if (this.resolveProgram) gl.deleteProgram(this.resolveProgram);
    if (this.blurProgram) gl.deleteProgram(this.blurProgram);
    if (this.compositeProgram) gl.deleteProgram(this.compositeProgram);
    this.map = null;
    this.gl = null;
  }
}
