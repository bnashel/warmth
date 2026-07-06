/**
 * components/Map/solar.ts — the base ink follows the real sky.
 *
 * Continuous, never stepped: the eased atmosphere state (lib/atmosphere.ts —
 * sun height + real weather) drives the ink. Night → paper day by `light`,
 * warmed by the `ember` near the horizon, then GRADED by the sky: overcast
 * desaturates and flattens, fog lifts everything toward mist, rain deepens
 * the water, snow cools the paper and lifts the night. The result lands as
 * plain paint-property updates with their own slow transitions — no style
 * swap, no re-render, no new frames: the same layers, re-inked.
 */
import type { Map as MapboxMap } from "mapbox-gl";
import type { AtmosphereState } from "@/lib/atmosphere";
import { INK, SOLAR, WEATHER } from "./tune";

type InkKey = "bg" | "water" | "park" | "building" | "road";
const INK_KEYS: InkKey[] = ["bg", "water", "park", "building", "road"];

/** Night is the frozen palette itself — the atmosphere never touches it. */
const NIGHT: Record<InkKey, string> = {
  bg: INK.bg,
  water: INK.water,
  park: INK.park,
  building: INK.building,
  road: INK.road,
};

/** Which layers each ink channel paints. Road color is shared: the four
 *  road waves differ by opacity/width (zoom expressions), never by hue. */
type PaintProp = "background-color" | "fill-color" | "line-color";
const PAINT: [layerId: string, prop: PaintProp, key: InkKey][] = [
  ["bg", "background-color", "bg"],
  ["water", "fill-color", "water"],
  ["parks", "fill-color", "park"],
  ["buildings", "fill-color", "building"],
  ["roads-highway", "line-color", "road"],
  ["roads-avenue", "line-color", "road"],
  ["roads-local", "line-color", "road"],
  ["roads-service", "line-color", "road"],
];

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

const scaleRgb = (c: Rgb, s: number): Rgb => [c[0] * s, c[1] * s, c[2] * s];

const fmt = (c: Rgb) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/**
 * Now — unless the lab set a preview hour. `?solarHour=17.5` seeds it;
 * `window.__warmthSolarHour = 6` steers it live (dev preview + harness).
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

/** The graded ink for the current atmosphere. Exposed for the harness. */
export function atmosphereInk(a: AtmosphereState): Record<InkKey, string> {
  const snow = a.wetKind === "snow" ? a.wet : 0;
  const rain = a.wetKind === "rain" ? a.wet : 0;
  const night = 1 - a.light;
  const mist = hexToRgb(a.paper > 0.5 ? WEATHER.fogMist.day : WEATHER.fogMist.night);
  const glow = hexToRgb(WEATHER.skyGlow.color);
  const moonInk = hexToRgb(WEATHER.moonLift.color);
  const out = {} as Record<InkKey, string>;

  for (const k of INK_KEYS) {
    // The sun's blend: night → day, warmed toward the ember.
    let c = hexToRgb(NIGHT[k]);
    if (a.light > 0) c = lerpRgb(c, hexToRgb(SOLAR.day[k]), a.light);
    if (a.ember > 0) c = lerpRgb(c, hexToRgb(SOLAR.ember[k]), a.ember);

    // Overcast: the gray weight — desaturate, and dim the day a touch
    // (scaled by light so the night ink is never crushed further).
    if (a.cloud > 0.001) {
      const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      c = lerpRgb(c, [l, l, l], a.cloud * WEATHER.cloudDesat);
      c = scaleRgb(c, 1 - WEATHER.cloudDayDim * a.cloud * a.light);
      // …and at NIGHT the city glows the way real cities do under clouds:
      // the void lifts toward a warm sky-glow, never staying pure black —
      // this is how overcast READS after dark (Ben's field report).
      if (k !== "road") {
        c = lerpRgb(c, glow, a.cloud * WEATHER.skyGlow.lift * night * (1 - a.ember));
      }
    }

    // Moonlight: a faint cool wash on clear nights, scaled by the moon's
    // illuminated fraction — a full moon genuinely reads brighter.
    const moonW = a.moon * (1 - a.cloud) * night * WEATHER.moonLift.weight;
    if (moonW > 0.001 && k !== "road") c = lerpRgb(c, moonInk, moonW);

    // Snow: paper goes cold-bright; the night lifts a breath (snow-lit sky).
    if (snow > 0.001) {
      c = lerpRgb(c, [238, 241, 246], snow * WEATHER.snowDayCool * a.light);
      c = lerpRgb(c, [36, 40, 50], snow * WEATHER.snowNightLift * (1 - a.light));
    }

    // Fog: everything lifts toward the mist — the milk-glass veil.
    if (a.fog > 0.001) c = lerpRgb(c, mist, a.fog * WEATHER.fogLift);

    // Rain: the water deepens.
    if (k === "water" && rain > 0.001) {
      c = scaleRgb(c, 1 - WEATHER.wetWaterDarken * rain);
    }

    out[k] = fmt(c);
  }
  return out;
}

/** Maps whose paint transitions are already set to the slow solar ease. */
const eased = new WeakSet<MapboxMap>();

/** Re-ink the base map for the current atmosphere. Cheap: 8 paint sets. */
export function applyAtmosphereInk(map: MapboxMap, a: AtmosphereState): void {
  const ink = atmosphereInk(a);
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
