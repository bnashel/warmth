/**
 * components/orb/oklch.ts — tiny hand-rolled OKLCH color engine. No deps.
 *
 * Why: RGB interpolation between distant hues (pink→blue) passes through mud.
 * OKLab/OKLCH keeps perceived lightness/chroma steady, so a color change
 * feels like *becoming*, not swapping. Used for the 150ms emotion crossfade
 * and Variant B's continuous six-hue spectrum.
 *
 * Matrices from Björn Ottosson's OKLab reference implementation (public domain).
 */

export type Oklch = { L: number; C: number; h: number }; // h in radians

/* ---------------- hex → OKLCH ---------------- */

export function hexToRgb01(hex: string): [number, number, number] {
  const s = hex.replace("#", "");
  const n = parseInt(
    s.length === 3 ? s.split("").map((c) => c + c).join("") : s,
    16,
  );
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function hexToOklch(hex: string): Oklch {
  const [r8, g8, b8] = hexToRgb01(hex);
  const r = srgbToLinear(r8),
    g = srgbToLinear(g8),
    b = srgbToLinear(b8);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return { L, C: Math.hypot(a, bb), h: Math.atan2(bb, a) };
}

/* ---------------- OKLCH → css rgb ---------------- */

export function oklchToRgb255(c: Oklch): [number, number, number] {
  const a = c.C * Math.cos(c.h);
  const b = c.C * Math.sin(c.h);

  const l = (c.L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (c.L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (c.L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const clamp = (x: number) => Math.min(1, Math.max(0, linearToSrgb(x)));
  return [
    Math.round(clamp(r) * 255),
    Math.round(clamp(g) * 255),
    Math.round(clamp(bl) * 255),
  ];
}

/* ---------------- mixing ---------------- */

const TAU = Math.PI * 2;

/** Mix two OKLCH colors; hue takes the shortest arc. */
export function mixOklch(from: Oklch, to: Oklch, t: number): Oklch {
  // Near-achromatic endpoints have meaningless hue — inherit the other's.
  const fromH = from.C < 1e-4 ? to.h : from.h;
  const toH = to.C < 1e-4 ? from.h : to.h;
  let dh = toH - fromH;
  if (dh > Math.PI) dh -= TAU;
  if (dh < -Math.PI) dh += TAU;
  return {
    L: from.L + (to.L - from.L) * t,
    C: from.C + (to.C - from.C) * t,
    h: fromH + dh * t,
  };
}

/** Cached parse — hues are a fixed palette, so parse each hex once. */
const cache = new Map<string, Oklch>();
export function oklchOf(hex: string): Oklch {
  let v = cache.get(hex);
  if (!v) {
    v = hexToOklch(hex);
    cache.set(hex, v);
  }
  return v;
}

/** Mix two hexes in OKLCH → "R,G,B" (drop into rgba(...,alpha) strings). */
export function mixHexRgbString(fromHex: string, toHex: string, t: number): string {
  const [r, g, b] = oklchToRgb255(mixOklch(oklchOf(fromHex), oklchOf(toHex), t));
  return `${r},${g},${b}`;
}

/**
 * Variant B's living spectrum: t in [0,1] sweeps a continuous OKLCH blend
 * across the given hue anchors (equal segments, piecewise pairwise mix).
 */
export function spectrumRgbString(hexes: readonly string[], t01: number): string {
  const n = hexes.length;
  if (n === 1) return mixHexRgbString(hexes[0], hexes[0], 0);
  const t = Math.min(1, Math.max(0, t01)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(t));
  return mixHexRgbString(hexes[i], hexes[i + 1], t - i);
}

/** Which anchor is nearest to spectrum position t01 (for snap-on-commit). */
export function nearestAnchorIndex(count: number, t01: number): number {
  return Math.round(Math.min(1, Math.max(0, t01)) * (count - 1));
}
