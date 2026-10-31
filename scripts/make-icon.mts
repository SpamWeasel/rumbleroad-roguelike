// Builds the app icon (build/icon.png and build/icon.ico): a pixel-art fist on a dark tile.
// Usage: pnpm exec tsx scripts/make-icon.mts
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// 16x16 art. # outline, o skin, h highlight, R wristband, w wristband stripe, . empty.
const ART = [
  "................",
  "...##.##.##.##..",
  "..#hh#hh#hh#hh#.",
  "..#oo#oo#oo#oo#.",
  "..#oo#oo#oo#oo#.",
  ".##############.",
  "#hho#ooooooooo#.",
  "#oooo#oooooooo#.",
  "#ooooo#ooooooo#.",
  ".#oooooooooooo#.",
  "..#ooooooooooo#.",
  "...#ooooooooo#..",
  "...#RRRRRRRRR#..",
  "...#wwwwwwwww#..",
  "...###########..",
  "................",
];
const COLORS: Record<string, [number, number, number]> = {
  "#": [26, 13, 8],
  o: [240, 178, 122],
  h: [255, 214, 168],
  R: [232, 67, 63],
  w: [255, 228, 92],
};
const TILE: [number, number, number] = [16, 18, 28];
const BORDER: [number, number, number] = [255, 140, 42];

/** RGBA pixels at `size`: rounded dark tile, orange border, the fist scaled with hard edges. */
function pixels(size: number): Buffer {
  const out = Buffer.alloc(size * size * 4);
  const r = size * 0.18;
  const border = Math.max(1, Math.round(size / 40));
  const pad = size * 0.14;
  const inner = size - pad * 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Distance outside the rounded rectangle's corners.
      const cx = Math.max(r - x - 0.5, 0, x + 0.5 - (size - r));
      const cy = Math.max(r - y - 0.5, 0, y + 0.5 - (size - r));
      const d = Math.hypot(cx, cy);
      if (d > r) continue;
      let color =
        d > r - border || x < border || y < border || x >= size - border || y >= size - border
          ? BORDER
          : TILE;
      const sx = Math.floor(((x - pad) / inner) * 16);
      const sy = Math.floor(((y - pad) / inner) * 16);
      const ch = sx >= 0 && sy >= 0 && sx < 16 && sy < 16 ? ART[sy][sx] : ".";
      if (ch !== ".") color = COLORS[ch];
      out.set([...color, 255], (y * size + x) * 4);
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size: number): Buffer {
  const rgba = pixels(size);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++)
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("build", { recursive: true });
writeFileSync("build/icon.png", png(512));
// An .ico holding PNG images at several sizes.
const sizes = [256, 64, 48, 32, 16];
const images = sizes.map(png);
const head = Buffer.alloc(6 + sizes.length * 16);
head.writeUInt16LE(0, 0);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((size, i) => {
  const e = 6 + i * 16;
  head.writeUInt8(size === 256 ? 0 : size, e);
  head.writeUInt8(size === 256 ? 0 : size, e + 1);
  head.writeUInt16LE(1, e + 4);
  head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(images[i].length, e + 8);
  head.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync("build/icon.ico", Buffer.concat([head, ...images]));
console.log("Wrote build/icon.png and build/icon.ico");
