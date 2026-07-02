/**
 * components/Map/FieldLayer.ts — THE FIELD.
 *
 * Emotion as standing weather over the city: a continuous field, never
 * points. A Mapbox custom layer (raw WebGL2 in the map's own context):
 *
 *   prerender  — every moment splats a coreless meters-scaled kernel into a
 *                half-res offscreen target: 6 per-emotion intensity fields
 *                across two RGBA16F attachments (MRT), additively pooled.
 *   render     — one fullscreen resolve: pooled weight → brightness through
 *                a filmic knee (never clips to white); hue = dominance-
 *                weighted OKLab mix of the six emotion hues (the mud rule:
 *                hues are mixed by local dominance, never summed — many
 *                emotions piled up can not gray out). Then the streetlight
 *                pass multiplies the same field onto the base map.
 *
 * All look-tunables live in tune.ts (FIELD); this file is the machinery.
 */
import mapboxgl, { type CustomLayerInterface, type Map as MapboxMap } from "mapbox-gl";
import { EMOTION_HUES, EMOTIONS } from "@/lib/theme";
import type { LivePoint } from "@/lib/momentsStore";
import { FIELD } from "./tune";

/* ---------------- OKLab (Björn Ottosson, via components/orb/oklch.ts) --- */

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** hex → OKLab [L, a, b] — the six hue anchors, computed once on CPU. */
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

/* Kernel splat: instanced quads in mercator space, radius pre-clamped on
 * CPU per frame. Each instance writes its weight × falloff into exactly one
 * of six channels across two render targets. */
const ACCUM_VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;         // quad: ±1
layout(location=1) in vec3 inst;           // mercX, mercY, radiusMerc
layout(location=2) in vec2 instWC;         // weight, channel(0..5)
uniform mat4 uMatrix;
out vec2 vUv;
out float vWeight;
flat out int vChannel;
void main() {
  vUv = corner;
  vWeight = instWC.x;
  vChannel = int(instWC.y + 0.5);
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
layout(location=0) out vec4 o0;            // joy, energy, love, awe
layout(location=1) out vec4 o1;            // calm, reflective, -, -
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

const RESOLVE_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uField0;
uniform sampler2D uField1;
uniform vec3 uHueLab[6];
uniform float uExposure;
uniform float uDominance;
uniform float uGain;
uniform float uTimeSec;
uniform float uBreathPeriod;
uniform float uBreathAmp;
uniform int uMode;
out vec4 fragColor;

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
  vec4 f0 = texture(uField0, vUv);
  vec2 f1 = texture(uField1, vUv).xy;
  float I[6];
  I[0] = f0.x; I[1] = f0.y; I[2] = f0.z; I[3] = f0.w; I[4] = f1.x; I[5] = f1.y;

  float total = I[0] + I[1] + I[2] + I[3] + I[4] + I[5];
  if (total < 0.002) discard;

  // THE MUD RULE: hues mix by dominance share (I^p), never sum. Any local
  // majority snaps the area to its hue; fronts blend over a narrow band;
  // a six-way pile CANNOT collapse to gray because color is a weighted
  // average of saturated anchors, weighted almost entirely by the winner.
  vec3 lab = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 6; i++) {
    float w = pow(I[i], uDominance);
    lab += w * uHueLab[i];
    wsum += w;
  }
  lab /= max(wsum, 1e-6);

  // Pooled feeling → light through a filmic knee: more feeling = brighter,
  // asymptotically — never white. The low end is linear: the long fade.
  float b = 1.0 - exp(-uExposure * total);

  // The living tide: a slow, subtle breath, phase-varied across hues.
  float phase = fract(lab.y * 3.7 + lab.z * 5.3);
  b *= 1.0 + uBreathAmp * sin(6.2831853 * (uTimeSec / uBreathPeriod + phase));

  // Dither so the long tail never bands on 8-bit output.
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  b += (n - 0.5) * 0.004;

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

  private map: MapboxMap | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private accumProgram: WebGLProgram | null = null;
  private resolveProgram: WebGLProgram | null = null;
  private fbo: WebGLFramebuffer | null = null;
  private tex: [WebGLTexture | null, WebGLTexture | null] = [null, null];
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
  private hueLab = new Float32Array(18);

  constructor() {
    EMOTIONS.forEach((e, i) => {
      const [L, a, b] = hexToOklab(EMOTION_HUES[e]);
      this.hueLab[i * 3] = L;
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
    }
    const d = this.instanceData;
    for (let i = 0; i < n; i++) {
      const p = points[i];
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
  }

  /** Offscreen accumulation — mapbox's sanctioned hook for FBO work. */
  prerender(gl: WebGL2RenderingContext, matrix: number[]) {
    if (!this.accumProgram || !this.map) return;
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
    // clamp in mercator units derived from the current zoom.
    const zoom = this.map.getZoom();
    const mercPerCssPx = 1 / (512 * Math.pow(2, zoom));
    const minMerc = FIELD.minRadiusPx * mercPerCssPx;
    const maxMerc = FIELD.maxRadiusPx * mercPerCssPx;
    if (!this.uploaded || this.clampMin !== minMerc) {
      // Re-upload with clamped radii (cheap: ≤500 × 20 bytes).
      const n = this.count;
      const src = this.instanceData;
      if (this.clamped.length < n * FLOATS_PER_INSTANCE) {
        this.clamped = new Float32Array(src.length);
      }
      this.clamped.set(src.subarray(0, n * FLOATS_PER_INSTANCE));
      for (let i = 0; i < n; i++) {
        const o = i * FLOATS_PER_INSTANCE + 2;
        this.clamped[o] = Math.min(maxMerc, Math.max(minMerc, src[o]));
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuf);
      gl.bufferData(gl.ARRAY_BUFFER, this.clamped.subarray(0, n * FLOATS_PER_INSTANCE), gl.DYNAMIC_DRAW);
      this.uploaded = true;
      this.clampMin = minMerc;
    }

    gl.uniformMatrix4fv(
      gl.getUniformLocation(this.accumProgram, "uMatrix"),
      false,
      matrix,
    );
    gl.uniform1f(
      gl.getUniformLocation(this.accumProgram, "uSoftness"),
      FIELD.kernelSoftness,
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);

    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  }
  private clamped = new Float32Array(0);
  private clampMin = -1;

  render(gl: WebGL2RenderingContext) {
    if (!this.resolveProgram || this.count === 0) return;
    if (this.epoch === 0) this.epoch = performance.now();
    const periodSec = FIELD.breath.periodMs / 1000;
    const timeSec = ((performance.now() - this.epoch) / 1000) % periodSec;

    gl.useProgram(this.resolveProgram);
    gl.bindVertexArray(this.resolveVao);
    const u = (name: string) => gl.getUniformLocation(this.resolveProgram!, name);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[0]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.tex[1]);
    gl.uniform1i(u("uField0"), 0);
    gl.uniform1i(u("uField1"), 1);
    gl.uniform3fv(u("uHueLab"), this.hueLab);
    gl.uniform1f(u("uExposure"), FIELD.exposure);
    gl.uniform1f(u("uDominance"), FIELD.dominance);
    gl.uniform1f(u("uTimeSec"), timeSec);
    gl.uniform1f(u("uBreathPeriod"), periodSec);
    gl.uniform1f(u("uBreathAmp"), FIELD.breath.amp);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // Pass 1 — streetlight: field × base map (dst is the pure ink city).
    if (FIELD.streetlightGain > 0) {
      gl.uniform1i(u("uMode"), 1);
      gl.uniform1f(u("uGain"), FIELD.streetlightGain);
      gl.blendFunc(gl.DST_COLOR, gl.ONE);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // Pass 2 — the field itself, additive (alpha 0 under premultiplied).
    gl.uniform1i(u("uMode"), 0);
    gl.uniform1f(u("uGain"), FIELD.gain);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }

  onRemove(_map: MapboxMap, gl: WebGL2RenderingContext) {
    for (const t of this.tex) if (t) gl.deleteTexture(t);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.accumProgram) gl.deleteProgram(this.accumProgram);
    if (this.resolveProgram) gl.deleteProgram(this.resolveProgram);
    this.map = null;
    this.gl = null;
  }
}
