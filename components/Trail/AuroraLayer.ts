/**
 * components/Trail/AuroraLayer.ts — the connections between memories as
 * AURORA: soft feathered curtains of light whose glow drifts and shimmers
 * along the ribbon (Eli, 2026-07-08 — flowing and organic, never a stiff
 * geometric line). A PathLayer whose color filter shapes each stroke:
 *
 *   feather — the cross profile dies softly at both edges (no hard rim);
 *   flow    — slow fbm brightness traveling along the curtain, anchored
 *             to GEOGRAPHY (the segment's real lng/lat), so the light is
 *             continuous across segment joints and never swims;
 *   rays    — a faint cross-grain shimmer, the aurora's vertical streaks.
 *
 * Geometry (curve, meander, per-span gradient + age dimming) is built in
 * glow.ts; this file is only the light. Tunables: tune.ts TRAIL.aurora.
 */
import { PathLayer, type PathLayerProps } from "deck.gl";
import { TRAIL } from "@/components/Map/galleryTune";

const auroraUniforms = {
  name: "aurora" as const,
  fs: /* glsl */ `\
layout(std140) uniform auroraUniforms {
  float timeSec;
  float noiseScale;
  float flowSpeed;
} aurora;
`,
  uniformTypes: {
    timeSec: "f32" as const,
    noiseScale: "f32" as const,
    flowSpeed: "f32" as const,
  },
};

/** Value noise + 2-octave fbm — cheap enough for a few thousand fragments. */
const NOISE_GLSL = /* glsl */ `\
in vec2 vSegPos;
float aur_hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float aur_noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(aur_hash(i), aur_hash(i + vec2(1, 0)), u.x),
             mix(aur_hash(i + vec2(0, 1)), aur_hash(i + vec2(1, 1)), u.x), u.y);
}
float aur_fbm(vec2 p) {
  return 0.65 * aur_noise(p) + 0.35 * aur_noise(p * 2.13 + 7.7);
}
`;

export type AuroraDatum = {
  path: [number, number][];
  color: [number, number, number, number];
  /** Time between the two memories this span connects (tap to reveal). */
  gapMs: number;
};

type AuroraLayerProps = PathLayerProps<AuroraDatum> & { timeSec?: number };

export class AuroraLayer extends PathLayer<AuroraDatum, { timeSec?: number }> {
  static layerName = "AuroraLayer";

  getShaders() {
    const shaders = super.getShaders();
    shaders.modules = [...shaders.modules, auroraUniforms];
    shaders.inject = {
      ...shaders.inject,
      "vs:#decl": "out vec2 vSegPos;\n",
      // The fragment's world position (lng/lat), interpolated along the
      // segment — the curtain's light lives in geography, so it stays
      // continuous across joints and pinned to the places themselves.
      "vs:#main-end":
        "vSegPos = mix(instanceStartPositions.xy, instanceEndPositions.xy," +
        " clamp(vPathPosition.y / max(vPathLength, 1.0e-4), 0.0, 1.0));\n",
      "fs:#decl": NOISE_GLSL,
      "fs:DECKGL_FILTER_COLOR": /* glsl */ `\
  {
    float across = clamp(geometry.uv.x, -1.0, 1.0);
    float feather = pow(max(0.0, 1.0 - abs(across)), 1.6);
    vec2 q = vSegPos * aurora.noiseScale;
    float flow = aur_fbm(q + vec2(aurora.timeSec * aurora.flowSpeed,
                                  -aurora.timeSec * aurora.flowSpeed * 0.7));
    float curtain = 0.35 + 0.65 * smoothstep(0.28, 0.8, flow);
    float rays = 0.78 + 0.22 * aur_noise(vec2(q.x * 2.6 - aurora.timeSec * 0.1, across * 1.4));
    color.a *= feather * curtain * rays;
  }
`,
    };
    return shaders;
  }

  draw(params: unknown) {
    const { timeSec = 0 } = this.props as AuroraLayerProps;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (this.state as any).model;
    model?.shaderInputs.setProps({
      aurora: {
        timeSec,
        noiseScale: TRAIL.aurora.noiseScale,
        flowSpeed: TRAIL.aurora.flowSpeed,
      },
    });
    super.draw(params as never);
  }
}
