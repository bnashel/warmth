/**
 * lib/atmosphere.ts — THE LIVING ATMOSPHERE.
 *
 * One continuously-eased state the whole app reads: the real sun (computed
 * locally, no network) and the real weather (Open-Meteo — free, keyless,
 * NYC coordinates by construction, refreshed every 15 minutes). There are
 * no modes and nothing switches: every value moves through a seconds-long
 * exponential ease, so a rain squall arriving reads like weather rolling
 * in, never like a theme swap. Full plan: docs/atmosphere-plan.md.
 *
 * Consumers:
 *   MapStage      — ticks the engine from its rAF; feeds the field + base ink
 *   solar.ts      — grades the ink palette from this state
 *   OneScreen     — loose-text ink follows `paper`
 *   sound.ts      — rain patter follows `wet`
 *
 * Dev preview (never in the product): URL params seed an override
 * (?cloud=0.8 &wet=0.6 &kind=snow &fog=0.3 &wind=0.7) and the dev-only
 * WeatherPreview panel calls setOverride() live. `?solarHour=` (solar.ts)
 * previews time the same way. Offline or fetch failure degrades to clear
 * sky — the sun half needs no network, so the map is never wrong or frozen.
 */
import * as SunCalc from "suncalc";
import { CAMERA, SOLAR, WEATHER } from "@/components/Map/tune";
import { solarDate } from "@/components/Map/solar";
import { sunElevationDeg } from "./sun";

export type WetKind = "rain" | "snow";

export type AtmosphereState = {
  /** Sun: 0 ink night → 1 full day (dayRamp). */
  light: number;
  /** Twilight warmth — nonzero only around sunrise/sunset. */
  ember: number;
  /** Glow→pigment handoff weight (paperRamp; lags light on purpose). */
  paper: number;
  /** Sky: 0 clear → 1 full overcast. */
  cloud: number;
  /** Precipitation intensity 0..1 (see wetKind). */
  wet: number;
  wetKind: WetKind;
  /** Visibility loss 0..1. */
  fog: number;
  /** Wind speed 0..1. */
  wind: number;
  /** Unit-ish vector the air flows toward, in map-screen terms (north-up). */
  axisX: number;
  axisY: number;
  /** Moonlight 0..1: illuminated fraction while the moon is up (suncalc).
   *  Visuals additionally scale it by clearness — clouds hide the moon. */
  moon: number;
};

export type AtmosphereOverride = Partial<
  Pick<AtmosphereState, "cloud" | "wet" | "fog" | "wind" | "wetKind">
>;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function smoothstep(from: number, to: number, x: number): number {
  const t = clamp01((x - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** Meteorological degrees (wind FROM, clockwise from north) → the screen
 *  axis the air flows TOWARD. North-up assumption; rotation is rare and
 *  the flow is a vibe, not an instrument. */
function windAxis(fromDeg: number): [number, number] {
  const toRad = ((fromDeg + 180) * Math.PI) / 180;
  return [Math.sin(toRad), Math.cos(toRad)];
}

/** WMO weather code → fog weight (45/48 are fog codes; drizzle hazes). */
function fogFromCode(code: number): number {
  if (code === 45 || code === 48) return 0.75;
  if (code >= 51 && code <= 57) return 0.15; // drizzle
  return 0;
}

type WeatherTargets = {
  cloud: number;
  wet: number;
  wetKind: WetKind;
  fog: number;
  wind: number;
  axisX: number;
  axisY: number;
  /** Raw km/h — for the dev panel's "live sky" readout only. */
  rawWindKmh: number;
  /** True once a real fetch has landed (the readout says so). */
  live: boolean;
};

const CLEAR: WeatherTargets = {
  cloud: 0,
  wet: 0,
  wetKind: "rain",
  fog: 0,
  wind: 0.15, // a whisper of drift even on a still day — the map breathes
  axisX: 0.94,
  axisY: 0.33, // the old fixed diagonal: calm default flow
  rawWindKmh: 0,
  live: false,
};

/** Parse ?cloud=&wet=&kind=&fog=&wind=&windDir= into an initial override. */
function overrideFromUrl(): AtmosphereOverride | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  const num = (k: string) => {
    const v = q.get(k);
    return v !== null && Number.isFinite(Number(v)) ? clamp01(Number(v)) : undefined;
  };
  const o: AtmosphereOverride = {};
  const cloud = num("cloud");
  const wet = num("wet");
  const fog = num("fog");
  const wind = num("wind");
  if (cloud !== undefined) o.cloud = cloud;
  if (wet !== undefined) o.wet = wet;
  if (fog !== undefined) o.fog = fog;
  if (wind !== undefined) o.wind = wind;
  if (q.get("kind") === "snow") o.wetKind = "snow";
  return Object.keys(o).length ? o : null;
}

class AtmosphereEngine {
  /** The eased, render-ready state. Read every frame; never reassigned. */
  current: AtmosphereState = {
    light: 0,
    ember: 0,
    paper: 0,
    cloud: CLEAR.cloud,
    wet: CLEAR.wet,
    wetKind: CLEAR.wetKind,
    fog: CLEAR.fog,
    wind: CLEAR.wind,
    axisX: CLEAR.axisX,
    axisY: CLEAR.axisY,
    moon: 0,
  };

  private weather: WeatherTargets = { ...CLEAR };
  private override: AtmosphereOverride | null = overrideFromUrl();
  private lastTick = 0;
  private lastSun = 0;
  private sunLight = 0;
  private sunEmber = 0;
  private sunPaper = 0;
  private sunMoon = 0;
  private fetching = false;
  private started = false;

  /** The live sky's targets (for the dev panel readout). */
  realSky(): Readonly<WeatherTargets> {
    return this.weather;
  }

  /** Lazy start — first tick begins the fetch loop (client only). */
  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    // Seed the eased state at the real sun so first paint isn't a sunrise —
    // and at the URL-forced weather, so a shared preview link opens ON it.
    this.computeSun(true);
    this.current.light = this.sunLight;
    this.current.ember = this.sunEmber;
    this.current.paper = this.sunPaper;
    const o = this.override;
    if (o) {
      this.current.cloud = o.cloud ?? this.current.cloud;
      this.current.wet = o.wet ?? this.current.wet;
      this.current.fog = o.fog ?? this.current.fog;
      this.current.wind = o.wind ?? this.current.wind;
      this.current.wetKind = o.wetKind ?? this.current.wetKind;
    }
    void this.fetchWeather();
    window.setInterval(() => void this.fetchWeather(), WEATHER.refetchMs);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void this.fetchWeather();
    });
  }

  /** The dev preview's hook. null returns to the real world (refetched
   *  immediately so "now" never shows a stale sky). */
  setOverride(o: AtmosphereOverride | null) {
    this.override = o;
    if (o === null) void this.fetchWeather();
  }

  getOverride(): AtmosphereOverride | null {
    return this.override;
  }

  private computeSun(force = false) {
    const now = performance.now();
    if (!force && now - this.lastSun < 1000) return; // trig once a second is plenty
    this.lastSun = now;
    const date = solarDate();
    const elev = sunElevationDeg(date, CAMERA.initial.latitude, CAMERA.initial.longitude);
    this.sunLight = smoothstep(SOLAR.dayRamp.from, SOLAR.dayRamp.to, elev) * SOLAR.strength;
    this.sunEmber =
      smoothstep(SOLAR.emberRamp.rise.from, SOLAR.emberRamp.rise.to, elev) *
      (1 - smoothstep(SOLAR.emberRamp.fade.from, SOLAR.emberRamp.fade.to, elev)) *
      SOLAR.strength;
    this.sunPaper = smoothstep(SOLAR.paperRamp.from, SOLAR.paperRamp.to, elev) * SOLAR.strength;
    // The moon (suncalc): illuminated fraction while it's up, fading in
    // across its first ~10° of altitude so moonrise never steps.
    const mp = SunCalc.getMoonPosition(date, CAMERA.initial.latitude, CAMERA.initial.longitude);
    const up = smoothstep(0, 10, (mp.altitude * 180) / Math.PI);
    this.sunMoon = up * SunCalc.getMoonIllumination(date).fraction;
  }

  private async fetchWeather() {
    // Fetch even under a preview override — overridden values win in tick(),
    // and a PARTIAL override (?cloud= alone) still blends with real weather.
    if (this.fetching) return;
    this.fetching = true;
    try {
      const url =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${CAMERA.initial.latitude}&longitude=${CAMERA.initial.longitude}` +
        "&current=precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m";
      // Timeout so a stalled response can never wedge `fetching` and freeze
      // the sky until reload (review finding).
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return; // keep the last known sky
      const json = (await res.json()) as {
        current?: {
          precipitation?: number; // mm/h
          snowfall?: number; // cm/h
          weather_code?: number;
          cloud_cover?: number; // %
          wind_speed_10m?: number; // km/h
          wind_direction_10m?: number; // deg FROM
        };
      };
      const c = json.current;
      if (!c) return;
      const snow = (c.snowfall ?? 0) > 0 || ((c.weather_code ?? 0) >= 71 && (c.weather_code ?? 0) <= 86 && (c.weather_code ?? 0) !== 80 && (c.weather_code ?? 0) !== 81 && (c.weather_code ?? 0) !== 82);
      const precip = c.precipitation ?? 0;
      const [ax, ay] = windAxis(c.wind_direction_10m ?? 250);
      this.weather = {
        cloud: clamp01((c.cloud_cover ?? 0) / 100),
        // mm/h through a knee: drizzle registers, a downpour saturates.
        wet: clamp01(1 - Math.exp(-precip / 2)),
        wetKind: snow ? "snow" : "rain",
        fog: fogFromCode(c.weather_code ?? 0),
        // km/h through a knee: 10 = breeze, 40+ = full flow.
        wind: clamp01(1 - Math.exp(-(c.wind_speed_10m ?? 0) / 18)),
        axisX: ax,
        axisY: ay,
        rawWindKmh: Math.round(c.wind_speed_10m ?? 0),
        live: true,
      };
    } catch {
      // offline — the sun keeps living, the sky stays as last seen
    } finally {
      this.fetching = false;
    }
  }

  /** Ease everything toward its target. Called from the map's rAF tick. */
  tick(nowMs: number) {
    this.start();
    this.computeSun();
    const dt = this.lastTick ? Math.min(100, nowMs - this.lastTick) : 16;
    this.lastTick = nowMs;
    // Real weather rolls in slowly; a dev-preview toggle answers in seconds
    // (Ben toggles to SEE — his field report).
    const tau = this.override ? WEATHER.previewTauMs : WEATHER.easeTauMs;
    const k = 1 - Math.exp(-dt / tau);
    const o = this.override;
    const t = this.weather;
    const cur = this.current;

    const ease = (from: number, to: number) =>
      Math.abs(to - from) < 0.0005 ? to : from + (to - from) * k;

    cur.light = ease(cur.light, this.sunLight);
    cur.ember = ease(cur.ember, this.sunEmber);
    cur.paper = ease(cur.paper, this.sunPaper);
    cur.cloud = ease(cur.cloud, o?.cloud ?? t.cloud);
    cur.fog = ease(cur.fog, o?.fog ?? t.fog);
    cur.wind = ease(cur.wind, o?.wind ?? t.wind);
    cur.axisX = ease(cur.axisX, t.axisX);
    cur.axisY = ease(cur.axisY, t.axisY);
    cur.moon = ease(cur.moon, this.sunMoon);
    // Rain never teleports into snow: a kind change DRIVES the wet to zero
    // first (the sky drying for a beat), flips, then eases back up — so a
    // mid-storm changeover actually happens (review finding).
    const kind = o?.wetKind ?? t.wetKind;
    if (kind !== cur.wetKind) {
      cur.wet = ease(cur.wet, 0);
      if (cur.wet < 0.05) cur.wetKind = kind;
    } else {
      cur.wet = ease(cur.wet, o?.wet ?? t.wet);
    }
  }
}

/** The one atmosphere — module singleton, client-side only. */
export const atmosphere = new AtmosphereEngine();
