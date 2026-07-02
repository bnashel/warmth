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

/* Census NTAs chain neighborhoods with hyphens ("Carroll Gardens-Cobble
 * Hill-Gowanus-Red Hook") — bureaucracy, not a place. A label is ONE name:
 * the first segment, which the census orders as the dominant neighborhood.
 * KEEP_WHOLE marks real hyphenated names; RENAME is the hand-curation slot
 * for anything where the first segment is the wrong artistic choice. */
const KEEP_WHOLE = new Set(["Bedford-Stuyvesant", "Co-op City"]);
const RENAME: Record<string, string> = {
  "Midtown South-Flatiron-Union Square": "Flatiron",
};

/* Area decides tier by default — which crowns Staten Island acreage and
 * leaves all of Manhattan nameless at rest. Cultural weight beats acreage:
 * a few icons anchor each borough at the wide shot (tier 0), the rest of
 * the canon arrives one breath later (tier 1). Keyed by display name. */
const TIER_OVERRIDE: Record<string, 0 | 1 | 2> = {
  Harlem: 0,
  "Upper West Side": 0,
  "Upper East Side": 0,
  Midtown: 0,
  Chelsea: 0,
  "East Village": 0,
  "Financial District": 0,
  Williamsburg: 0,
  Bushwick: 0,
  "Park Slope": 0,
  "Long Island City": 0,
  "East Williamsburg": 1, // collides with Williamsburg at the rest view
  "Greenwich Village": 1,
  SoHo: 1,
  Tribeca: 1,
  "West Village": 1,
  Chinatown: 1,
};

function displayName(raw: string): string {
  // "Bedford-Stuyvesant (West)" → "Bedford-Stuyvesant"
  const stripped = raw.replace(/\s*\([^)]*\)/g, "").trim();
  if (KEEP_WHOLE.has(stripped)) return stripped;
  if (RENAME[stripped]) return RENAME[stripped];
  return stripped.split("-")[0].trim();
}

let cache: Promise<LabelDatum[]> | null = null;

/** Load + prep label data once: clean names, dedupe, tier. */
export function loadLabels(): Promise<LabelDatum[]> {
  if (!cache) {
    cache = fetch("/data/nyc-neighborhoods.json")
      .then((r) => r.json())
      .then((fc: GeoJSON.FeatureCollection) => {
        // Dedupe on name+borough (largest wins) so census sub-areas collapse
        // to one label while true twins survive — Murray Hill exists in both
        // Manhattan and Queens, and both deserve their name.
        const byName = new Map<string, { name: string; area: number; anchor: [number, number] }>();
        for (const f of fc.features) {
          const p = f.properties as {
            name: string;
            borough: string;
            area: number;
            anchor: [number, number];
          };
          const name = displayName(p.name);
          const key = `${name}|${p.borough}`;
          const prev = byName.get(key);
          if (!prev || p.area > prev.area) byName.set(key, { name, area: p.area, anchor: p.anchor });
        }
        return [...byName.values()].map(({ name, area, anchor }) => ({
          name,
          anchor,
          tier:
            TIER_OVERRIDE[name] ??
            ((area >= LABELS.tierAreas[0] ? 0 : area >= LABELS.tierAreas[1] ? 1 : 2) as 0 | 1 | 2),
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

/* At the rest view the only text is the five boroughs — tracked-out capitals,
 * barely there. They dissolve as neighborhood names take over. (TextLayer has
 * no letter-spacing; thin spaces between characters carry the tracking.) */
const track = (s: string) => s.split("").join(" ");

function buildBoroughLayer(zoom: number) {
  const { from, to } = LABELS.boroughFadeOut;
  const t = Math.min(1, Math.max(0, (zoom - from) / (to - from)));
  const opacity = 1 - t * t * (3 - 2 * t);
  return new TextLayer<(typeof LABELS.boroughs)[number]>({
    id: "borough-labels",
    data: LABELS.boroughs,
    visible: opacity > 0.01 && LABELS.boroughAlpha > 0,
    opacity,
    getPosition: (d) => d.anchor,
    getText: (d) => track(d.name),
    getSize: LABELS.boroughSizePx,
    getColor: [233, 236, 244, LABELS.boroughAlpha],
    fontFamily: "Inter, system-ui, sans-serif",
    fontWeight: 500,
    fontSettings: { sdf: true, smoothing: 0.32 },
    sizeUnits: "pixels",
    characterSet: "auto",
    billboard: true,
    // Interleaved rendering: glyph quads must not write depth, or their
    // transparent corners punch invisible holes into layers drawn after.
    parameters: { depthWriteEnabled: false },
  });
}

/* Per-tier arrays are computed ONCE per dataset — a fresh filter() every
 * frame would change the data reference and force a full glyph re-layout
 * on every pinch-zoom frame (deck diffs data by identity). */
const tierCache = new WeakMap<LabelDatum[], [LabelDatum[], LabelDatum[], LabelDatum[]]>();
function tiersOf(data: LabelDatum[]) {
  let t = tierCache.get(data);
  if (!t) {
    t = [
      data.filter((d) => d.tier === 0),
      data.filter((d) => d.tier === 1),
      data.filter((d) => d.tier === 2),
    ];
    tierCache.set(data, t);
  }
  return t;
}

/** Borough layer + three neighborhood TextLayers (one per tier), opacity
 *  recomputed per zoom — the caller feeds these into overlay.setProps on map
 *  move (no React churn). */
export function buildLabelLayers(data: LabelDatum[], zoom: number) {
  const g = globalOpacity(zoom);
  const tierData = tiersOf(data);
  const tiers = [0, 1, 2].map((tier) => {
    const opacity = tierOpacity(zoom, LABELS.tierZoom[tier]) * g;
    return new TextLayer<LabelDatum>({
      id: `nbhd-labels-${tier}`,
      data: tierData[tier],
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
      parameters: { depthWriteEnabled: false },
    });
  });
  return [buildBoroughLayer(zoom), ...tiers];
}
