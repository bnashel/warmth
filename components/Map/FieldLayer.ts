/**
 * components/Map/FieldLayer.ts — THE FIELD.
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
import { EMOTION_HUES, EMOTIONS } from "@/lib/theme";
import type { LivePoint } from "@/lib/momentsStore";
import { CAMERA, FIELD, SHAPES, WEATHER } from "./tune";

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
// circles. x=warp amplitude (uv), y=noise scale, z=drift speed,
// w=streak (anisotropy along the flow axis).
uniform vec4 uShape;
uniform float uBand;   // aurora curtains: brightness modulation (0 = off)
uniform float uAspect; // target width / height, so the flow isn't squashed
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
  // Free-flowing edges: pull each lookup through slowly-drifting fbm warp.
  // warpAmp 0 (bloom mode) short-circuits to the original circles.
  vec2 uv = vUv;
  if (uShape.x > 0.0) {
    vec2 q = vec2(vUv.x * uAspect, vUv.y) * uShape.y;
    // The flow axis IS the real wind (a gentle diagonal when calm).
    vec2 axis = normalize(uAxis);
    // Streak stretches the noise domain along the axis (ribbons), and the
    // drift crawls the domain over time so the weather is alive, not stuck.
    vec2 along = axis * dot(q, axis);
    q = mix(q, along, uShape.w * 0.72);
    q += uTimeSec * uShape.z * vec2(1.0, -0.6);
    vec2 w = vec2(fbm(q), fbm(q + 31.416)) - 0.5;
    // Warp mostly across the axis when streaked — edges feather sideways.
    vec2 across = vec2(-axis.y, axis.x);
    vec2 wStreak = across * dot(w, across) * 1.8;
    uv += mix(w, wStreak, uShape.w) * uShape.x;
  }
  vec4 f0 = texture(uField0, uv);
  vec2 f1 = texture(uField1, uv).xy;
  float I[${NE}];
  ${["f0.x", "f0.y", "f0.z", "f0.w", "f1.x", "f1.y", "f1.z", "f1.w"]
    .slice(0, NE)
    .map((src, i) => `I[${i}] = ${src};`)
    .join(" ")}

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
  for (int i = 0; i < ${NE}; i++) {
    float w = pow(I[i], uDominance);
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

  // THE LAND MASK — geography shapes the feeling: the field dies over
  // water so rivers and harbor stay pure void and every silhouette
  // inherits the coastline. Sampled at the TRUE pixel (vUv, unwarped):
  // the shore is a fact, not weather.
  if (uMaskOn > 0.5) {
    vec2 merc = uMercOrigin + uMercDx * vUv.x + uMercDy * vUv.y;
    vec2 muv = vec2((merc.x - uMaskRect.x) * uMaskRect.z,
                    (merc.y - uMaskRect.y) * uMaskRect.w);
    float land = smoothstep(0.12, 0.82, texture(uMask, muv).r);
    b *= mix(uWaterAtten, 1.0, land);
  }

  // THE LUMINOUS HEART: where pooled feeling peaks, the hue itself lifts
  // toward light — bright AND saturated, capped well below white.
  lab.x += uHeart.z * smoothstep(uHeart.x, uHeart.y, b);

  // The living tide: a slow, subtle breath, phase-varied across hues.
  float phase = fract(lab.y * 3.7 + lab.z * 5.3);
  b *= 1.0 + uBreathAmp * sin(6.2831853 * (uTimeSec / uBreathPeriod + phase));

  // Aurora curtains: slow luminous banding across the flow axis. Modulation
  // only — never to zero, so the field's coverage is untouched.
  if (uBand > 0.0) {
    vec2 axis = normalize(uAxis);
    float across = dot(vec2(uv.x * uAspect, uv.y), vec2(-axis.y, axis.x));
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

  vec3 color = linearToSrgb(oklabToLinear(lab)) * max(b, 0.0) * uGain;
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

export class FieldLayer implements CustomLayerInterface {
  id = "emotion-field";
  type = "custom" as const;
  renderingMode = "2d" as const;

  /** Public↔private crossfade (0..1): rides the gain uniforms, and at 0 the
   *  whole field (accumulation included) costs nothing. Set from MapStage. */
  fade = 1;

  /** THE SHAPE OF FEELING — plain uniform values (watercolor is the one
   *  identity; the atmosphere drives these live). Set from MapStage. */
  look: { warpAmp: number; scale: number; drift: number; streak: number; band: number } = {
    ...SHAPES.watercolor,
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

  constructor() {
    EMOTIONS.forEach((e, i) => {
      const [, a, b] = hexToOklab(EMOTION_HUES[e]);
      // Equal feeling = equal light: anchors share one OKLab lightness
      // (raw hues span a wide L range, which made cooler hues glow dimmer
      // than Joy for the same intensity). Hue/chroma stay the brand's.
      this.hueLab[i * 3] = FIELD.anchorL;
      this.hueLab[i * 3 + 1] = a;
      this.hueLab[i * 3 + 2] = b;
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
      // The lonely-commit floor is for real feelings; the seed sheet keeps
      // its geographic scale (small floor) so it can't pool into blobs.
      this.floorPx[i] = p.seed ? FIELD.seedMinRadiusPx : FIELD.minRadiusPx;
      this.isSeed[i] = p.seed ? 1 : 0;
      const mc = mapboxgl.MercatorCoordinate.fromLngLat({
        lng: p.position[0],
        lat: p.position[1],
      });
      const radiusM =
        FIELD.radiusM + FIELD.radiusPerIntensityM * (p.intensity - 1);
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
      // The ambient wash is a city-scale impression: it dissolves as you
      // zoom into a neighborhood (real commits stay). Smoothstep, so the
      // fade is continuous with the camera.
      const sf = FIELD.seedZoomFade;
      const zt = Math.min(1, Math.max(0, (zoom - sf.from) / (sf.to - sf.from)));
      const seedFade = 1 - zt * zt * (3 - 2 * zt);
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
      // One softness in every sky (constitution rule 2).
      FIELD.kernelSoftness,
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
      gl.uniform1f(this.loc(gl, this.resolveProgram!, "res", "uGain"), FIELD.gain);
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
    gl.uniform1f(u("uExposure"), FIELD.exposure);
    gl.uniform1f(u("uDominance"), FIELD.dominance);
    gl.uniform1f(u("uChromaFloor"), FIELD.chromaFloor);
    gl.uniform1f(u("uTimeSec"), this.timeSec);
    gl.uniform1f(u("uBreathPeriod"), FIELD.breath.periodMs / 1000);
    gl.uniform1f(u("uBreathAmp"), FIELD.breath.amp);
    gl.uniform4f(u("uShape"), this.look.warpAmp, this.look.scale, this.look.drift, this.look.streak);
    gl.uniform1f(u("uBand"), this.look.band);
    gl.uniform1f(u("uAspect"), this.texW / Math.max(1, this.texH));
    const w = this.weather;
    gl.uniform2f(u("uAxis"), w.axisX, w.axisY);
    // The coastline (off until the mask texture lands — never a blocker).
    const mf = this.mercFrame;
    const maskOn = this.maskReady && mf.ok;
    gl.uniform1f(u("uMaskOn"), maskOn ? 1 : 0);
    if (maskOn) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.uniform1i(u("uMask"), 2);
      gl.uniform4f(u("uMaskRect"), ...this.maskRect);
      gl.uniform2f(u("uMercOrigin"), mf.ox, mf.oy);
      gl.uniform2f(u("uMercDx"), mf.dxx, mf.dxy);
      gl.uniform2f(u("uMercDy"), mf.dyx, mf.dyy);
      gl.uniform1f(u("uWaterAtten"), FIELD.landMask.waterAtten);
    }
    gl.uniform3f(u("uHeart"), FIELD.heart.from, FIELD.heart.to, FIELD.heart.lift);
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
      gl.uniform1f(u("uGain"), FIELD.gain * this.fade * night * thin);
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
      gl.uniform1f(
        this.loc(gl, this.compositeProgram, "comp", "uGain"),
        WEATHER.bloom.gain * this.fade * night * thin,
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
