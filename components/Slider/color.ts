// Slider-local color helpers (kept out of lib/theme.ts to avoid clashing with
// the map branch). Turns EMOTION_HUES hex into rgba for glows and fills.
import { EMOTION_HUES, type Emotion } from "@/lib/theme";

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function emotionRgba(emotion: Emotion, a: number): string {
  return rgba(EMOTION_HUES[emotion], a);
}
