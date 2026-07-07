/**
 * scripts/build-landmask.mjs — rasterize the NYC neighborhood polygons into
 * a Web-Mercator land mask for THE FIELD's shoreline clip (constitution:
 * rivers and harbor stay pure void; fields inherit coastline contours).
 *
 * One-off build tool, zero dependencies: scanline even-odd fill + a hand-
 * rolled grayscale PNG writer (zlib is Node-builtin). Output is sampled by
 * FieldLayer's resolve shader — white = land, black = water.
 *
 *   node scripts/build-landmask.mjs
 *   → public/data/nyc-landmask.png (1536×1536 over CAMERA.maxBounds)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const SIZE = 1536;
const BLUR = 1; // box-blur radius in texels (~80 m) — a soft shoreline lap
// Must match CAMERA.maxBounds in components/Map/tune.ts.
const BOUNDS = { west: -74.35, south: 40.45, east: -73.6, north: 41.0 };

const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => {
  const r = (lat * Math.PI) / 180;
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + r / 2)) / (2 * Math.PI);
};

const x0 = mercX(BOUNDS.west);
const x1 = mercX(BOUNDS.east);
const yTop = mercY(BOUNDS.north); // smaller mercator y = north
const yBot = mercY(BOUNDS.south);

const geo = JSON.parse(readFileSync("public/data/nyc-neighborhoods.json", "utf8"));
const mask = new Uint8Array(SIZE * SIZE);

/** Scanline even-odd fill of one polygon (outer ring + holes) in texel space. */
function fillPolygon(rings) {
  const px = rings.map((ring) =>
    ring.map(([lng, lat]) => [
      ((mercX(lng) - x0) / (x1 - x0)) * SIZE,
      ((mercY(lat) - yTop) / (yBot - yTop)) * SIZE,
    ]),
  );
  let minY = Infinity, maxY = -Infinity;
  for (const ring of px) for (const [, y] of ring) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const yFrom = Math.max(0, Math.floor(minY));
  const yTo = Math.min(SIZE - 1, Math.ceil(maxY));
  for (let y = yFrom; y <= yTo; y++) {
    const sy = y + 0.5;
    const xs = [];
    for (const ring of px) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xa, ya] = ring[i];
        const [xb, yb] = ring[j];
        if (ya <= sy === yb <= sy) continue; // edge doesn't cross this scanline
        xs.push(xa + ((sy - ya) / (yb - ya)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.round(xs[k]));
      const to = Math.min(SIZE - 1, Math.round(xs[k + 1]) - 1);
      for (let x = from; x <= to; x++) mask[y * SIZE + x] = 255;
    }
  }
}

let polys = 0;
for (const f of geo.features) {
  const g = f.geometry;
  const shapes = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (const rings of shapes) {
    fillPolygon(rings);
    polys++;
  }
}

// Soft shoreline: a small separable box blur so the field laps the coast
// instead of hitting a hard wall (the shader re-steepens with smoothstep).
if (BLUR > 0) {
  const tmp = new Float32Array(SIZE * SIZE);
  const w = 2 * BLUR + 1;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let s = 0;
      for (let dx = -BLUR; dx <= BLUR; dx++) {
        s += mask[y * SIZE + Math.min(SIZE - 1, Math.max(0, x + dx))];
      }
      tmp[y * SIZE + x] = s / w;
    }
  }
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      let s = 0;
      for (let dy = -BLUR; dy <= BLUR; dy++) {
        s += tmp[Math.min(SIZE - 1, Math.max(0, y + dy)) * SIZE + x];
      }
      mask[y * SIZE + x] = Math.round(s / w);
    }
  }
}

/* ---------------- minimal grayscale PNG writer ---------------- */

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 0; // grayscale
const raw = Buffer.alloc(SIZE * (SIZE + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE + 1)] = 0; // filter: none
  raw.set(mask.subarray(y * SIZE, (y + 1) * SIZE), y * (SIZE + 1) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);
writeFileSync("public/data/nyc-landmask.png", png);

const landPct = (100 * mask.reduce((s, v) => s + (v > 127 ? 1 : 0), 0)) / (SIZE * SIZE);
console.log(
  `landmask: ${SIZE}×${SIZE}, ${polys} polygons, ${landPct.toFixed(1)}% land, ${(png.length / 1024).toFixed(0)} KB`,
);
