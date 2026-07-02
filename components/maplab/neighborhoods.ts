/**
 * components/map/neighborhoods.ts — neighborhood NAMES, the map's only text.
 *
 * Rendered as deck.gl TextLayers in Inter (Mapbox's glyph server can't serve
 * our brand font — and with zero symbol layers in the style, no default type
 * can ever leak in). Hierarchy is staged by area tier and zoom: big places
 * whisper first, small ones arrive as you approach, everything dissolves when
 * the street texture takes the stage.
 */
import { TextLayer } from "deck.gl";
import { LABELS } from "./tune";

type LabelDatum = { name: string; anchor: [number, number]; tier: 0 | 1 | 2 };

let cache: Promise<LabelDatum[]> | null = null;

/** Load + prep label data once: strip census parentheticals, dedupe, tier. */
export function loadLabels(): Promise<LabelDatum[]> {
  if (!cache) {
    cache = fetch("/data/nyc-neighborhoods.json")
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        const byName = new Map<string, { area: number; anchor: [number, number] }>();
        for (const f of fc.features) {
          const p = f.properties as { name: string; area: number; anchor: [number, number] };
          // "Bedford-Stuyvesant (West)" → "Bedford-Stuyvesant"; keep largest.
          const name = p.name.replace(/\s*\([^)]*\)/g, "").trim();
          const prev = byName.get(name);
          if (!prev || p.area > prev.area) byName.set(name, { area: p.area, anchor: p.anchor });
        }
        return [...byName.entries()].map(([name, { area, anchor }]) => ({
          name,
          anchor,
          tier: (area >= LABELS.tierAreas[0] ? 0 : area >= LABELS.tierAreas[1] ? 1 : 2) as
            | 0
            | 1
            | 2,
        }));
      });
  }
  return cache;
}

/** Smoothstep fade-in starting at `from`, fully in ~0.8 zoom later. */
function tierOpacity(zoom: number, from: number): number {
  const t = Math.min(1, Math.max(0, (zoom - from) / 0.8));
  return t * t * (3 - 2 * t);
}

/** Global dissolve as streets take over. */
function globalOpacity(zoom: number): number {
  const { from, to } = LABELS.globalFadeOut;
  const t = Math.min(1, Math.max(0, (zoom - from) / (to - from)));
  return 1 - t * t * (3 - 2 * t);
}

/** Three TextLayers (one per tier), opacity recomputed per zoom — the caller
 *  feeds these into overlay.setProps on map move (no React churn). */
export function buildLabelLayers(data: LabelDatum[], zoom: number) {
  const g = globalOpacity(zoom);
  return [0, 1, 2].map((tier) => {
    const opacity = tierOpacity(zoom, LABELS.tierZoom[tier]) * g;
    return new TextLayer<LabelDatum>({
      id: `nbhd-labels-${tier}`,
      data: data.filter((d) => d.tier === tier),
      visible: opacity > 0.01,
      opacity,
      getPosition: (d) => d.anchor,
      getText: (d) => (LABELS.uppercase ? d.name.toUpperCase() : d.name),
      getSize: LABELS.sizePx[tier],
      getColor: [233, 236, 244, LABELS.alpha[tier]],
      fontFamily: "Inter, system-ui, sans-serif",
      fontWeight: 500,
      fontSettings: { sdf: true, smoothing: 0.32 },
      sizeUnits: "pixels",
      characterSet: "auto",
      billboard: true,
    });
  });
}
