/**
 * components/Map/solar.ts — the ink follows the real sun.
 *
 * Continuous, never stepped: sun elevation over NYC (the map is NYC by
 * construction — no location permission needed) drives two weights, "day"
 * and "ember", that blend the frozen INK palette toward SOLAR.day and
 * SOLAR.ember (tune.ts). The result lands as plain paint-property updates
 * with their own long transitions — no style swap, no re-render, no new
 * frames: the same layers, re-inked.
 */
import type { Map as MapboxMap } from "mapbox-gl";
import { sunElevationDeg } from "@/lib/sun";
import { CAMERA, INK, SOLAR } from "./tune";

type SolarInk = {
  bg: string;
  water: string;
  park: string;
  building: string;
  road: string;
};

/** Night is the frozen palette itself — solar drift never touches it. */
const NIGHT: SolarInk = {
  bg: INK.bg,
  water: INK.water,
  park: INK.park,
  building: INK.building,
  road: INK.road,
};

/** Which layers each ink channel paints. Road color is shared: the four
 *  road waves differ by opacity/width (zoom expressions), never by hue. */
type PaintProp = "background-color" | "fill-color" | "line-color";
const PAINT: [layerId: string, prop: PaintProp, key: keyof SolarInk][] = [
  ["bg", "background-color", "bg"],
  ["water", "fill-color", "water"],
  ["parks", "fill-color", "park"],
  ["buildings", "fill-color", "building"],
  ["roads-highway", "line-color", "road"],
  ["roads-avenue", "line-color", "road"],
  ["roads-local", "line-color", "road"],
  ["roads-service", "line-color", "road"],
];

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function smoothstep(from: number, to: number, x: number): number {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const p = parseInt(hex.slice(1), 16);
  return [(p >> 16) & 255, (p >> 8) & 255, p & 255];
}

const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const fmt = (c: Rgb) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

const INK_KEYS = ["bg", "water", "park", "building", "road"] as const;

/** night → day by `day`, then toward the ember by `ember` — all numeric. */
function blendInk(day: number, ember: number): SolarInk {
  const out = {} as Record<keyof SolarInk, string>;
  for (const k of INK_KEYS) {
    let c = hexToRgb(NIGHT[k]);
    if (day > 0) c = lerpRgb(c, hexToRgb(SOLAR.day[k]), day);
    if (ember > 0) c = lerpRgb(c, hexToRgb(SOLAR.ember[k]), ember);
    out[k] = fmt(c);
  }
  return out;
}

/**
 * Now — unless the lab set a preview hour. `?solarHour=17.5` seeds it;
 * `window.__warmthSolarHour = 6` steers it live (design-review harness).
 */
export function solarDate(): Date {
  if (typeof window !== "undefined") {
    const w = window as unknown as { __warmthSolarHour?: number };
    if (w.__warmthSolarHour === undefined) {
      const param = new URLSearchParams(window.location.search).get("solarHour");
      if (param !== null && Number.isFinite(Number(param))) {
        w.__warmthSolarHour = Number(param);
      }
    }
    if (typeof w.__warmthSolarHour === "number") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setMilliseconds(w.__warmthSolarHour * 3_600_000);
      return d;
    }
  }
  return new Date();
}

/** The ink for a moment in time: night → day by sun height, warmed by
 *  the ember near the horizon. Exposed for tests. */
export function solarInk(date: Date): SolarInk {
  const elev = sunElevationDeg(date, CAMERA.initial.latitude, CAMERA.initial.longitude);
  const day = smoothstep(SOLAR.dayRamp.from, SOLAR.dayRamp.to, elev) * SOLAR.strength;
  const ember =
    smoothstep(SOLAR.emberRamp.rise.from, SOLAR.emberRamp.rise.to, elev) *
    (1 - smoothstep(SOLAR.emberRamp.fade.from, SOLAR.emberRamp.fade.to, elev)) *
    SOLAR.strength;
  return blendInk(day, ember);
}

/**
 * How "paper" the map currently is (0 = dark ink, 1 = full light day).
 * The field uses it to trade glow for watercolor pigment, and labels use
 * it to trade white for ink text.
 */
export function solarPaperWeight(date: Date = solarDate()): number {
  const elev = sunElevationDeg(date, CAMERA.initial.latitude, CAMERA.initial.longitude);
  return smoothstep(SOLAR.paperRamp.from, SOLAR.paperRamp.to, elev) * SOLAR.strength;
}

/** Maps whose paint transitions are already set to the slow solar ease. */
const eased = new WeakSet<MapboxMap>();

/** Re-ink the base map for the current (or lab-previewed) sun. */
export function applySolarInk(map: MapboxMap): void {
  const ink = solarInk(solarDate());
  const firstTouch = !eased.has(map);
  for (const [id, prop, key] of PAINT) {
    if (!map.getLayer(id)) continue;
    if (firstTouch) {
      map.setPaintProperty(id, `${prop}-transition`, {
        duration: SOLAR.transitionMs,
        delay: 0,
      });
    }
    map.setPaintProperty(id, prop, ink[key]);
  }
  eased.add(map);
}
