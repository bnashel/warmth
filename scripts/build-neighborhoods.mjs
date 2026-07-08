/**
 * scripts/build-neighborhoods.mjs
 *
 * One-time data pipeline for the map's neighborhoods:
 *   NYC Open Data 2020 Neighborhood Tabulation Areas (NTAs)
 *     → keep real residential neighborhoods only
 *     → Douglas-Peucker simplify (kill census jaggedness)
 *     → Chaikin corner-cutting ×2 (boundaries drawn by a hand, not a bureau)
 *     → 5-decimal coords, centroid label anchor + area tier per feature
 *     → public/data/nyc-neighborhoods.json (committed; no runtime fetch)
 *
 * ALSO emits public/data/nyc-landareas.json: EVERY NTA polygon — including
 * the parks, airports, and cemeteries the neighborhoods file drops — as
 * bare geometry (heavier simplification, 4-decimal coords). This is the
 * city's LAND, not its names: the land mask and the ambient wash build on
 * it, so Central Park is land that can feel, never a hole (Eli, 2026-07-08:
 * parks are emotionally significant places, not voids).
 *
 * Run: node scripts/build-neighborhoods.mjs
 * No dependencies — algorithms are hand-rolled below.
 */
import { writeFile, mkdir } from "node:fs/promises";

const SOURCES = [
  // NYC Open Data — 2020 NTAs (id 9nt8-h7nd), GeoJSON export.
  "https://data.cityofnewyork.us/api/geospatial/9nt8-h7nd?method=export&format=GeoJSON",
];
const OUT = "public/data/nyc-neighborhoods.json";

/* ---------------- geometry helpers ---------------- */

/** Perpendicular distance from p to segment ab (flat-earth ok at city scale). */
function perpDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker polyline simplification. */
function simplify(points, tolerance) {
  if (points.length <= 3) return points;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= tolerance) return [points[0], points[points.length - 1]];
  const left = simplify(points.slice(0, idx + 1), tolerance);
  const right = simplify(points.slice(idx), tolerance);
  return left.slice(0, -1).concat(right);
}

/** One pass of Chaikin corner cutting on a CLOSED ring. */
function chaikinClosed(ring) {
  const out = [];
  const n = ring.length - 1; // last point repeats the first
  for (let i = 0; i < n; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % n];
    out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
    out.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
  }
  out.push(out[0]);
  return out;
}

function processRing(ring, tolerance, smoothPasses) {
  // Ensure closed, simplify (keep closure), then smooth.
  let r = ring;
  if (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) r = [...r, r[0]];
  let s = simplify(r, tolerance);
  if (s.length < 5) s = r; // degenerate after simplify — keep original
  for (let i = 0; i < smoothPasses; i++) s = chaikinClosed(s);
  return s.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}

/** Ring signed area (deg²) + centroid. */
function ringAreaCentroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  a /= 2;
  if (a === 0) return { area: 0, centroid: ring[0] };
  return { area: Math.abs(a), centroid: [cx / (6 * a), cy / (6 * a)] };
}

/* ---------------- pipeline ---------------- */

const TOLERANCE = 0.00025; // deg ≈ 23m — kills census stair-steps only; heavier
// values balloon the shapes and erase each neighborhood's real character
const SMOOTH_PASSES = 1; // Chaikin ×1 — soften corners, don't inflate them

async function fetchSource() {
  for (const url of SOURCES) {
    try {
      console.log(`fetching ${url} …`);
      const res = await fetch(url, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`  failed: ${e.message}`);
    }
  }
  throw new Error("all sources failed");
}

const raw = await fetchSource();
console.log(`raw features: ${raw.features.length}`);

const props = (f) => {
  const p = Object.fromEntries(
    Object.entries(f.properties ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    name: p.ntaname ?? p.nta_name ?? p.name ?? "",
    borough: p.boroname ?? p.borough ?? "",
    type: String(p.ntatype ?? p.nta_type ?? "0"),
  };
};

// The LAND file: every NTA polygon of every type, geometry only. Same
// tolerance as the neighborhoods (23m): anything coarser bulged shorelines
// into the East River channels — rivers must stay void. 4-decimal coords.
const LAND_TOLERANCE = 0.00025;
const landPolys = [];
for (const f of raw.features) {
  const geomType = f.geometry?.type;
  const polys =
    geomType === "Polygon"
      ? [f.geometry.coordinates]
      : geomType === "MultiPolygon"
        ? f.geometry.coordinates
        : [];
  for (const rings of polys) {
    const processed = rings
      .map((r) => {
        let ring = r;
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
          ring = [...ring, ring[0]];
        let s = simplify(ring, LAND_TOLERANCE);
        if (s.length < 5) s = ring;
        return s.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
      })
      .filter((r) => r.length >= 5);
    if (processed.length) landPolys.push(processed);
  }
}

const features = [];
for (const f of raw.features) {
  const { name, borough, type } = props(f);
  // ntatype 0 = residential neighborhood. Parks/airports/cemeteries/rikers
  // (types 5/6/7/8/9…) are places, not neighborhoods — no shapes, no names.
  // (They ARE still land: see nyc-landareas.json above.)
  if (type !== "0" || !name) continue;

  const geomType = f.geometry?.type;
  let polys =
    geomType === "Polygon"
      ? [f.geometry.coordinates]
      : geomType === "MultiPolygon"
        ? f.geometry.coordinates
        : [];
  if (!polys.length) continue;

  const processed = polys
    .map((rings) => rings.map((r) => processRing(r, TOLERANCE, SMOOTH_PASSES)))
    .filter((rings) => rings[0]?.length >= 8);
  if (!processed.length) continue;

  // Label anchor: centroid of the largest outer ring; area drives hierarchy.
  let best = { area: 0, centroid: processed[0][0][0] };
  for (const rings of processed) {
    const ac = ringAreaCentroid(rings[0]);
    if (ac.area > best.area) best = ac;
  }

  features.push({
    type: "Feature",
    properties: {
      name,
      borough,
      area: +best.area.toExponential(3),
      anchor: [
        Math.round(best.centroid[0] * 1e5) / 1e5,
        Math.round(best.centroid[1] * 1e5) / 1e5,
      ],
    },
    geometry:
      processed.length === 1
        ? { type: "Polygon", coordinates: processed[0] }
        : { type: "MultiPolygon", coordinates: processed },
  });
}

features.sort((a, b) => b.properties.area - a.properties.area);

const fc = { type: "FeatureCollection", features };
await mkdir("public/data", { recursive: true });
const json = JSON.stringify(fc);
await writeFile(OUT, json);
console.log(
  `wrote ${OUT}: ${features.length} neighborhoods, ${(json.length / 1024).toFixed(0)} KB`,
);

// The land file: a bare MultiPolygon-shaped array — [poly][ring][point].
const landJson = JSON.stringify({ polygons: landPolys });
await writeFile("public/data/nyc-landareas.json", landJson);
console.log(
  `wrote public/data/nyc-landareas.json: ${landPolys.length} land polygons, ${(landJson.length / 1024).toFixed(0)} KB`,
);
