/**
 * Renders the VELYQ mark to a multi-size `favicon.ico`.
 *
 * Browsers and Windows still ask for `favicon.ico` even when an SVG icon is
 * advertised, so the mark is rasterised here rather than shipped only as
 * vector. No image dependency is used: the shapes are simple enough to
 * evaluate as signed distance fields, and the ICO container is written byte
 * by byte.
 *
 * Usage: node tooling/scripts/build-favicon.mjs
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const root = resolve(here, "../..");

/* Geometry, on the same 32-unit canvas as packages/ui/src/brand.ts. */
const CANVAS = 32;
const CIRCLE = { cx: 16, cy: 16, r: 9.2 };
const SPOT = { cx: 16, cy: 16, r: 2.15 };
const TAIL = { x1: 18.6, y1: 18.6, x2: 25.4, y2: 25.4 };
const STROKE = 2.9;
const TILE_RADIUS = 7;

/** 4x4 supersampling is enough to keep a 2.9-unit stroke smooth at 16px. */
const SAMPLES = 4;

const hex = (value) => [
  Number.parseInt(value.slice(1, 3), 16),
  Number.parseInt(value.slice(3, 5), 16),
  Number.parseInt(value.slice(5, 7), 16),
];

function roundedRectDistance(x, y, size, radius) {
  // Distance to a rounded square centred on the canvas; negative inside.
  const half = size / 2;
  const dx = Math.abs(x - half) - (half - radius);
  const dy = Math.abs(y - half) - (half - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function segmentDistance(x, y, { x1, y1, x2, y2 }) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = x - x1;
  const wy = y - y1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/** Coverage of the mark itself (ring + tail + spot) at a point. */
function markDistance(x, y) {
  const ring =
    Math.abs(Math.hypot(x - CIRCLE.cx, y - CIRCLE.cy) - CIRCLE.r) - STROKE / 2;
  const tail = segmentDistance(x, y, TAIL) - STROKE / 2;
  const spot = Math.hypot(x - SPOT.cx, y - SPOT.cy) - SPOT.r;
  return Math.min(ring, tail, spot);
}

function render(size, accent) {
  const [ar, ag, ab] = hex(accent);
  const [br, bg, bb] = hex("#070b0d");
  const scale = CANVAS / size;
  const step = 1 / SAMPLES;
  // BGRA, bottom-up, as a Windows DIB expects.
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let tile = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) * step) * scale;
          const y = (py + (sy + 0.5) * step) * scale;
          if (roundedRectDistance(x, y, CANVAS, TILE_RADIUS) <= 0) tile += 1;
          if (markDistance(x, y) <= 0) mark += 1;
        }
      }
      const total = SAMPLES * SAMPLES;
      const tileAlpha = tile / total;
      const markAlpha = (mark / total) * tileAlpha;

      // Mark over tile, then the whole thing masked by the tile's own alpha.
      const r = Math.round(br * (1 - markAlpha) + ar * markAlpha);
      const g = Math.round(bg * (1 - markAlpha) + ag * markAlpha);
      const b = Math.round(bb * (1 - markAlpha) + ab * markAlpha);

      const row = size - 1 - py;
      const offset = (row * size + px) * 4;
      pixels[offset] = b;
      pixels[offset + 1] = g;
      pixels[offset + 2] = r;
      pixels[offset + 3] = Math.round(tileAlpha * 255);
    }
  }
  return pixels;
}

function dibFor(size, pixels) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  // Doubled height: an icon DIB stores the colour bitmap and an AND mask.
  header.writeInt32LE(size * 2, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(pixels.length, 20);
  // The AND mask is unused for 32-bit icons but must still be present.
  const mask = Buffer.alloc((size * size) / 8);
  return Buffer.concat([header, pixels, mask]);
}

function ico(images) {
  const directory = Buffer.alloc(6 + images.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  let offset = directory.length;
  images.forEach(({ size, dib }, index) => {
    const entry = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entry);
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(dib.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += dib.length;
  });

  return Buffer.concat([directory, ...images.map(({ dib }) => dib)]);
}

/** The vector icon, emitted from the same constants as the raster one. */
function svg(accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS} ${CANVAS}" width="${CANVAS}" height="${CANVAS}">
  <title>VELYQ</title>
  <rect width="${CANVAS}" height="${CANVAS}" rx="${TILE_RADIUS}" fill="#070b0d"/>
  <g fill="none" stroke="${accent}" stroke-width="${STROKE}">
    <circle cx="${CIRCLE.cx}" cy="${CIRCLE.cy}" r="${CIRCLE.r}"/>
    <path d="M${TAIL.x1} ${TAIL.y1} ${TAIL.x2} ${TAIL.y2}" stroke-linecap="round"/>
  </g>
  <circle cx="${SPOT.cx}" cy="${SPOT.cy}" r="${SPOT.r}" fill="${accent}"/>
</svg>
`;
}

for (const [app, accent] of [
  // Customer keeps the pitch emerald; operations keeps the analytical cyan.
  ["web", "#3ddc91"],
  ["admin", "#6fd4e8"],
]) {
  const images = [16, 32, 48].map((size) => ({
    size,
    dib: dibFor(size, render(size, accent)),
  }));
  const icoPath = resolve(root, `apps/${app}/app/favicon.ico`);
  const svgPath = resolve(root, `apps/${app}/app/icon.svg`);
  writeFileSync(icoPath, ico(images));
  writeFileSync(svgPath, svg(accent));
  console.log(`wrote ${icoPath}`);
  console.log(`wrote ${svgPath}`);
}
