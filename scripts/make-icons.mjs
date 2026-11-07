// Draws the app icon (a navy square with three rising white bars) as PNG
// files, using only what comes with Node. Run with: npm run icons

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [15, 31, 69];
const FG = [255, 255, 255];

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (const byte of buf) {
    c = (crc ^ byte) & 0xff;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function inRoundedRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function draw(size) {
  const s = size / 100; // design on a 100×100 grid
  const bars = [
    [22, 56, 36, 78], // x0, y0, x1, y1
    [43, 40, 57, 78],
    [64, 22, 78, 78],
  ];
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const SAMPLES = 4; // smooth edges
  for (let py = 0; py < size; py += 1) {
    raw[py * (size * 3 + 1)] = 0;
    for (let px = 0; px < size; px += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px + (sx + 0.5) / SAMPLES) / s;
          const y = (py + (sy + 0.5) / SAMPLES) / s;
          if (bars.some(([x0, y0, x1, y1]) => inRoundedRect(x, y, x0, y0, x1, y1, 3.5))) hits += 1;
        }
      }
      const t = hits / (SAMPLES * SAMPLES);
      const o = py * (size * 3 + 1) + 1 + px * 3;
      for (let c = 0; c < 3; c += 1) raw[o + c] = Math.round(BG[c] * (1 - t) + FG[c] * t);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../icons/icon-${size}.png`, import.meta.url), draw(size));
  console.log(`icons/icon-${size}.png`);
}
