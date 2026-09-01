#!/usr/bin/env node
/**
 * scripts/gen-brushes.mjs
 *
 * 生成 8 个 256×256 RGBA PNG 笔刷到 assets/brushes/。
 * 纯 Node stdlib（zlib + Buffer），无 native deps。
 * 每次运行输出相同的字节（mulberry32 + string hash）。
 *
 * 用法：
 *   node scripts/gen-brushes.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '..', 'assets', 'brushes');

const SIZE = 256;
const HALF = SIZE / 2;
const RADIUS = HALF - 4;

/**
 * 8 个内置笔刷。
 * - falloff 0..1  控制从中心到边缘的 alpha 衰减曲线陡度
 * - density 0..1  控制最大 alpha 上限
 * - jitter 0..1   控制每个像素 alpha 的随机扰动幅度（纹理感）
 */
const BRUSHES = [
  { id: 'round-hard', falloff: 0.05, density: 1.0,  jitter: 0.0  },
  { id: 'round-soft', falloff: 0.95, density: 1.0,  jitter: 0.0  },
  { id: 'chalk',      falloff: 0.60, density: 0.6,  jitter: 0.35 },
  { id: 'spray',      falloff: 0.50, density: 0.4,  jitter: 0.6  },
  { id: 'watercolor', falloff: 0.85, density: 0.7,  jitter: 0.2  },
  { id: 'oil-paint',  falloff: 0.40, density: 0.85, jitter: 0.4  },
  { id: 'marker',     falloff: 0.70, density: 0.95, jitter: 0.05 },
  { id: 'blur',       falloff: 1.00, density: 0.55, jitter: 0.0  },
];

// Deterministic PRNG
function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h) >>> 0;
}

function buildPixels(brush) {
  const rand = mulberry32(hashSeed(brush.id));
  const px = Buffer.alloc(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - HALF;
      const dy = y - HALF;
      const dist = Math.sqrt(dx * dx + dy * dy) / RADIUS;
      const o = (y * SIZE + x) * 4;
      if (dist > 1.0) {
        px[o] = 0; px[o + 1] = 0; px[o + 2] = 0; px[o + 3] = 0;
        continue;
      }
      let alpha;
      if (brush.falloff < 0.01) {
        // Hard edge
        alpha = dist < 0.97 ? 1.0 : 0.0;
      } else {
        alpha = Math.pow(Math.max(0, 1 - dist), 1 + brush.falloff * 6);
      }
      alpha *= brush.density;
      if (brush.jitter > 0.001) {
        const n = (rand() - 0.5) * 2 * brush.jitter;
        alpha = Math.max(0, Math.min(1, alpha * (1 + n)));
      }
      px[o]     = 255;
      px[o + 1] = 255;
      px[o + 2] = 255;
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

// ---- PNG encoder (8-bit RGBA, no filter, non-interlaced) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const stride = SIZE * 4;
  const filtered = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    filtered[y * (stride + 1)] = 0; // filter type 0 (None)
    pixels.copy(filtered, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(filtered);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const brush of BRUSHES) {
  const png = encodePNG(buildPixels(brush));
  const target = resolve(OUT_DIR, `${brush.id}.png`);
  writeFileSync(target, png);
  total += png.length;
  console.log(`  ✓ ${brush.id.padEnd(12)} ${png.length.toString().padStart(6)} bytes  ${target}`);
}
console.log(`\nGenerated ${BRUSHES.length} brushes, total ${(total / 1024).toFixed(1)} KB`);