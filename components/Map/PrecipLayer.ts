/**
 * components/Map/PrecipLayer.ts — VISIBLE WEATHER (v2).
 *
 * Rain streaks and snowflakes falling between you and the city: a single
 * screen-space instanced pass (~320 quads, alpha-blended, capped) — the
 * "it is raining IN the app" moment. Screen-space on purpose: precipitation
 * is atmosphere in front of the window, not geography, so it never needs
 * reprojection and costs the same at every zoom.
 *
 * Streaks angle with the real wind; snow sways and tumbles slow. Color
 * trades pale light (ink night) for graphite mist (paper day) on the same
 * `paper` weight everything else rides. All look values: tune.ts WEATHER.
 */
import type { CustomLayerInterface, Map as MapboxMap } from "mapbox-gl";
import { WEATHER } from "./tune";

const VS = /* glsl */ `#version 300 es
precision highp float;
layout(location=0) in vec2 corner;   // quad ±1
layout(location=1) in vec4 seed;     // 4 per-instance hashes (0..1)
uniform float uTime;
uniform float uMode;                 // 0 rain, 1 snow
uniform float uWindX;                // horizontal drift (signed, 0..~1)
uniform vec2 uSizeClip;              // streak length/width (or flake size) in clip units
uniform float uSpeed;
out vec2 vUv;
out float vShade;
void main() {
  vUv = corner;
  vShade = 0.45 + 0.55 * seed.w;     // per-drop presence variation
  float sp = uSpeed * (0.65 + 0.7 * seed.z);
  // Diagonal loop: every instance falls forever, wrapping a 2.6-wide band.
  float sway = uMode * sin(6.2831853 * (uTime * 0.13 + seed.y * 7.0)) * ${WEATHER.precip.snow.sway.toFixed(2)};
  float x = fract(seed.x + uTime * sp * uWindX * 0.22) * 2.6 - 1.3 + sway * 0.08;
  float y = 1.3 - fract(seed.y + uTime * sp) * 2.6;
  // Streak orientation follows the fall direction (rain); snow stays round.
  vec2 dir = normalize(vec2(uWindX * ${WEATHER.precip.rain.windTilt.toFixed(2)}, -1.0));
  vec2 axis = mix(dir, vec2(0.0, -1.0), uMode);
  vec2 perp = vec2(-axis.y, axis.x);
  vec2 pos = vec2(x, y)
           + axis * corner.y * uSizeClip.x
           + perp * corner.x * uSizeClip.y;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

const FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
in float vShade;
uniform float uMode;
uniform vec3 uColor;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  // Rain: a soft-edged sliver, faded at both tips. Snow: a soft disc.
  float rain = (1.0 - abs(vUv.x)) * pow(1.0 - abs(vUv.y), 0.6);
  float snow = smoothstep(1.0, 0.25, length(vUv));
  float a = mix(rain, snow, uMode) * uAlpha * vShade;
  fragColor = vec4(uColor * a, a); // premultiplied
}
`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(`warmth precip shader: ${gl.getShaderInfoLog(s)}`);
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(`warmth precip link: ${gl.getProgramInfoLog(p)}`);
  }
  return p;
}

/** Deterministic seeds — the same sky of drops every load. */
function makeSeeds(n: number): Float32Array {
  let a = 0x9e3779b9;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const s = new Float32Array(n * 4);
  for (let i = 0; i < s.length; i++) s[i] = rng();
  return s;
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const NIGHT_RGB = hexToRgb01(WEATHER.precip.night);
const DAY_RGB = hexToRgb01(WEATHER.precip.day);

export class PrecipLayer implements CustomLayerInterface {
  id = "precip";
  type = "custom" as const;
  renderingMode = "2d" as const;

  /** Set from MapStage every push (in place, no allocation). */
  wet = 0; // 0..1 intensity of whatever is falling
  snow = 0; // 1 when the falling thing is snow
  windX = 0; // signed horizontal drift
  paper = 0;
  fade = 1; // public/private crossfade (weather is public-view dressing? no — it rains on the diary too; this stays 1 unless the screen dims it)

  private map: MapboxMap | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private epoch = 0;
  private locCache = new Map<string, WebGLUniformLocation | null>();

  private loc(gl: WebGL2RenderingContext, name: string) {
    let l = this.locCache.get(name);
    if (l === undefined) {
      l = gl.getUniformLocation(this.program!, name);
      this.locCache.set(name, l);
    }
    return l;
  }

  onAdd(map: MapboxMap, gl: WebGL2RenderingContext) {
    this.map = map;
    this.program = compile(gl, VS, FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const seeds = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seeds);
    gl.bufferData(gl.ARRAY_BUFFER, makeSeeds(WEATHER.precip.count), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
  }

  render(gl: WebGL2RenderingContext) {
    const intensity = this.wet * this.fade;
    if (!this.program || !this.map || intensity < 0.02) return;
    if (this.epoch === 0) this.epoch = performance.now();
    const t = (performance.now() - this.epoch) / 1000;
    const mode = this.snow > 0.5 ? 1 : 0;
    const p = WEATHER.precip;

    // CSS px → clip units (drawingBuffer already carries the DPR).
    const canvas = this.map.getCanvas();
    const pxY = 2 / Math.max(1, canvas.clientHeight);
    const pxX = 2 / Math.max(1, canvas.clientWidth);
    const sizeClip: [number, number] =
      mode === 1
        ? [p.snow.sizePx * pxY * 0.5, p.snow.sizePx * pxX * 0.5]
        : [p.rain.lengthPx * pxY * 0.5, p.rain.widthPx * pxX * 0.5];

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform1f(this.loc(gl, "uTime"), t);
    gl.uniform1f(this.loc(gl, "uMode"), mode);
    gl.uniform1f(this.loc(gl, "uWindX"), this.windX);
    gl.uniform2f(this.loc(gl, "uSizeClip"), sizeClip[0], sizeClip[1]);
    gl.uniform1f(this.loc(gl, "uSpeed"), mode === 1 ? p.snow.speed : p.rain.speed);
    const rgb = [
      NIGHT_RGB[0] + (DAY_RGB[0] - NIGHT_RGB[0]) * this.paper,
      NIGHT_RGB[1] + (DAY_RGB[1] - NIGHT_RGB[1]) * this.paper,
      NIGHT_RGB[2] + (DAY_RGB[2] - NIGHT_RGB[2]) * this.paper,
    ];
    gl.uniform3f(this.loc(gl, "uColor"), rgb[0], rgb[1], rgb[2]);
    gl.uniform1f(
      this.loc(gl, "uAlpha"),
      (mode === 1 ? p.snow.alpha : p.rain.alpha) * intensity,
    );
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); // premultiplied
    gl.disable(gl.DEPTH_TEST);
    // Light precipitation = fewer drops, not just fainter ones.
    const n = Math.max(8, Math.round(WEATHER.precip.count * Math.min(1, intensity * 1.4)));
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }

  onRemove(_map: MapboxMap, gl: WebGL2RenderingContext) {
    if (this.program) gl.deleteProgram(this.program);
    this.map = null;
  }
}
