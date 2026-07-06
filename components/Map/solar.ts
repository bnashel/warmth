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
import type { ExpressionSpecification, Map as MapboxMap } from "mapbox-gl";
import type { AtmosphereState } from "@/lib/atmosphere";
import { INK, JOURNEY, SOLAR, WEATHER } from "./tune";
import { roadOpacityExpr, roadWidthExpr } from "./styles";

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
 * The parked day (constitution rule 1): the product is always night.
 * SOLAR.dayMode restores the 2026-07-02 paper-day look at build time;
 * `?daylight=1` previews it without an edit. Everything else reads this.
 */
export function dayModeEnabled(): boolean {
  if (SOLAR.dayMode) return true;
  if (typeof window !== "undefined") {
    return new URLSearchParams(window.location.search).get("daylight") === "1";
  }
  return false;
}

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

/** The graded ink as raw RGB — one pass shared by the paint applier and
 *  the street-zoom park re-base below. */
function gradeInk(a: AtmosphereState): Record<InkKey, Rgb> {
  const snow = a.wetKind === "snow" ? a.wet : 0;
  const rain = a.wetKind === "rain" ? a.wet : 0;
  // Always-night (constitution rule 1): the sun blends toward the lifted
  // warm charcoal, never the paper — and the canvas READS as night at any
  // hour, so night-only graces (sky-glow, moonlight, snow-lit lift) stay.
  const dayMode = dayModeEnabled();
  const dayInk = dayMode ? SOLAR.day : SOLAR.nightDay;
  const emberInk = dayMode ? SOLAR.ember : SOLAR.nightEmber;
  const lightGround = dayMode ? a.light : 0; // terms that assume a LIGHT ground
  const nightW = dayMode ? 1 - a.light : 1; // how "night" the canvas reads
  const mist = hexToRgb(a.paper > 0.5 ? WEATHER.fogMist.day : WEATHER.fogMist.night);
  const glow = hexToRgb(WEATHER.skyGlow.color);
  const moonInk = hexToRgb(WEATHER.moonLift.color);
  const out = {} as Record<InkKey, Rgb>;

  for (const k of INK_KEYS) {
    // The sun's blend: midnight ink → the day tone, warmed toward the ember.
    let c = hexToRgb(NIGHT[k]);
    if (a.light > 0) c = lerpRgb(c, hexToRgb(dayInk[k]), a.light);
    if (a.ember > 0) c = lerpRgb(c, hexToRgb(emberInk[k]), a.ember);

    // Overcast: the gray weight — desaturate, and dim a light ground a touch
    // (scaled by lightGround so the night ink is never crushed further).
    if (a.cloud > 0.001) {
      const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      c = lerpRgb(c, [l, l, l], a.cloud * WEATHER.cloudDesat);
      c = scaleRgb(c, 1 - WEATHER.cloudDayDim * a.cloud * lightGround);
      // …and at NIGHT the city glows the way real cities do under clouds:
      // the void lifts toward a warm sky-glow, never staying pure black —
      // this is how overcast READS after dark (Ben's field report).
      if (k !== "road") {
        c = lerpRgb(c, glow, a.cloud * WEATHER.skyGlow.lift * nightW * (1 - a.ember));
      }
    }

    // Moonlight: a faint cool wash on clear nights, scaled by the moon's
    // illuminated fraction — a full moon genuinely reads brighter.
    const moonW = a.moon * (1 - a.cloud) * nightW * WEATHER.moonLift.weight;
    if (moonW > 0.001 && k !== "road") c = lerpRgb(c, moonInk, moonW);

    // Snow: a light ground goes cold-bright; the night lifts a breath
    // (snow-lit sky) — at always-night, only the lift.
    if (snow > 0.001) {
      if (lightGround > 0) c = lerpRgb(c, [238, 241, 246], snow * WEATHER.snowDayCool * lightGround);
      c = lerpRgb(c, [36, 40, 50], snow * WEATHER.snowNightLift * nightW);
    }

    // Fog: everything lifts toward the mist — the milk-glass veil.
    if (a.fog > 0.001) c = lerpRgb(c, mist, a.fog * WEATHER.fogLift);

    // Rain: the water deepens.
    if (k === "water" && rain > 0.001) {
      c = scaleRgb(c, 1 - WEATHER.wetWaterDarken * rain);
    }

    out[k] = c;
  }
  return out;
}

/** The graded ink for the current atmosphere. Exposed for the harness. */
export function atmosphereInk(a: AtmosphereState): Record<InkKey, string> {
  const rgb = gradeInk(a);
  const out = {} as Record<InkKey, string>;
  for (const k of INK_KEYS) out[k] = fmt(rgb[k]);
  return out;
}

/**
 * The park ink at STREET zoom. At the wide view, park is "the faintest lift
 * above land" — but as buildings + neighborhood plates fade in they lift all
 * BUILT land past it, and parks/cemeteries flip into black holes with hard
 * polygon edges (Ben's field report: "that shape shouldn't be like that").
 * So up close, park re-bases on what built land actually reads as — ground
 * mixed with building mass and the plate lift — keeping its designed offset
 * above the ground. The zoom blend rides the buildings' own fade ramp.
 */
function parkNear(ink: Record<InkKey, Rgb>): Rgb {
  const effLand = lerpRgb(
    lerpRgb(ink.bg, ink.building, INK.buildingAlpha),
    [233, 236, 244],
    INK.plateBase,
  );
  const clamp255 = (x: number) => Math.min(255, Math.max(0, x));
  return [
    clamp255(effLand[0] + ink.park[0] - ink.bg[0]),
    clamp255(effLand[1] + ink.park[1] - ink.bg[1]),
    clamp255(effLand[2] + ink.park[2] - ink.bg[2]),
  ];
}

/** Road waves: fade ramp + base alpha + width per layer (mirrors styles.ts).
 *  By day the whole network brightens (SOLAR.dayRoadBoost) AND widens
 *  (dayRoadWiden) — the night hairlines dissolve on paper (Ben's report). */
const ROADS: [
  layerId: string,
  fade: { from: number; to: number },
  alpha: number,
  width: number,
][] = [
  ["roads-highway", JOURNEY.highwayFade, INK.roadAlpha.highway, INK.roadWidth.highway],
  ["roads-avenue", JOURNEY.avenueFade, INK.roadAlpha.avenue, INK.roadWidth.avenue],
  ["roads-local", JOURNEY.localFade, INK.roadAlpha.local, INK.roadWidth.local],
  ["roads-service", JOURNEY.serviceFade, INK.roadAlpha.service, INK.roadWidth.service],
];

/** Maps whose paint transitions are already set to the slow solar ease. */
const eased = new WeakSet<MapboxMap>();

/** Re-ink the base map for the current atmosphere. Cheap: 8 paint sets. */
export function applyAtmosphereInk(map: MapboxMap, a: AtmosphereState): void {
  const rgb = gradeInk(a);
  const firstTouch = !eased.has(map);
  for (const [id, prop, key] of PAINT) {
    if (!map.getLayer(id)) continue;
    if (firstTouch) {
      map.setPaintProperty(id, `${prop}-transition`, {
        duration: SOLAR.transitionMs,
        delay: 0,
      });
    }
    // Park blends toward its street-zoom re-base as buildings fade in —
    // continuous with the camera, so no zoom level ever steps.
    const value =
      key === "park"
        ? ([
            "interpolate",
            ["linear"],
            ["zoom"],
            JOURNEY.buildingFade.from,
            fmt(rgb.park),
            JOURNEY.buildingFade.to,
            fmt(parkNear(rgb)),
          ] as ExpressionSpecification)
        : fmt(rgb[key]);
    map.setPaintProperty(id, prop, value);
  }
  // The road network's presence follows the paper: hairlines on ink,
  // an Apple-Maps-bright web on the day page. Same zoom ramps as the
  // style itself — only the landing alpha breathes.
  const boost = 1 + (SOLAR.dayRoadBoost - 1) * a.paper;
  const widen = 1 + (SOLAR.dayRoadWiden - 1) * a.paper;
  for (const [id, fade, alpha, width] of ROADS) {
    if (!map.getLayer(id)) continue;
    if (firstTouch) {
      for (const prop of ["line-opacity-transition", "line-width-transition"] as const) {
        map.setPaintProperty(id, prop, { duration: SOLAR.transitionMs, delay: 0 });
      }
    }
    map.setPaintProperty(
      id,
      "line-opacity",
      roadOpacityExpr(fade, Math.min(0.95, alpha * boost)) as unknown as ExpressionSpecification,
    );
    map.setPaintProperty(id, "line-width", roadWidthExpr(fade.from, width, widen));
  }
  eased.add(map);
}
