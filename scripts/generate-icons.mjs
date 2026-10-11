/**
 * Icon generator — zero dependencies, Node built-ins only.
 *
 * The app ships no image assets, so the PWA icons are drawn here from pure
 * maths and encoded as PNG by hand (see `encodePng`). That keeps the "only
 * react + react-dom at runtime, nothing hand-waved" rule intact: the icons are
 * reproducible with `npm run icons` instead of being an opaque binary blob.
 *
 * Run: `npm run icons`  →  writes into `public/icons/`.
 *
 * The design: a teal rounded square with a white syringe. The `maskable`
 * variant is full-bleed (no transparent corners) and shrinks the glyph so it
 * survives Android's circle/squircle mask.
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(HERE, '..', 'public', 'icons');

/* ------------------------------------------------------------------ colours */

const TEAL_TOP = [20, 184, 166]; // #14b8a6
const TEAL_BOTTOM = [15, 118, 110]; // #0f766e
const TICK = [15, 118, 110]; // #0f766e
const WHITE = [255, 255, 255];

/* ------------------------------------------------------------------- PNG IO */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Encodes an RGBA byte buffer as a PNG (8-bit, colour type 6, no interlace). */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- rasteriser */

/** Box-downsamples a supersampled RGBA buffer (premultiplied, so edges stay clean). */
function downsample(src, supersample, size) {
  const out = new Uint8Array(size * size * 4);
  const big = size * supersample;
  const samples = supersample * supersample;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < supersample; dy += 1) {
        for (let dx = 0; dx < supersample; dx += 1) {
          const i = ((y * supersample + dy) * big + (x * supersample + dx)) * 4;
          const alpha = src[i + 3] / 255;
          r += src[i] * alpha;
          g += src[i + 1] * alpha;
          b += src[i + 2] * alpha;
          a += src[i + 3];
        }
      }
      const outAlpha = a / samples;
      const o = (y * size + x) * 4;
      if (outAlpha > 0) {
        out[o] = Math.round((r / samples) * (255 / outAlpha));
        out[o + 1] = Math.round((g / samples) * (255 / outAlpha));
        out[o + 2] = Math.round((b / samples) * (255 / outAlpha));
      }
      out[o + 3] = Math.round(outAlpha);
    }
  }
  return out;
}

/** Point-in-rounded-rectangle test (px, py are sample centres). */
function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}


/**
 * Draws one icon. Everything is laid out in normalised 0..1 coordinates and
 * rendered at 4x, then averaged down — cheap anti-aliasing without libs.
 */
function renderIcon(size, { maskable }) {
  const ss = 4;
  const S = size * ss;
  const px = new Uint8Array(S * S * 4);

  const set = (x, y, color) => {
    const i = (y * S + x) * 4;
    px[i] = color[0];
    px[i + 1] = color[1];
    px[i + 2] = color[2];
    px[i + 3] = 255;
  };

  const fillRoundRect = (nx, ny, nw, nh, nr, color) => {
    const x = nx * S;
    const y = ny * S;
    const w = nw * S;
    const h = nh * S;
    const r = nr * S;
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(S - 1, Math.ceil(x + w));
    const y1 = Math.min(S - 1, Math.ceil(y + h));
    for (let py = y0; py <= y1; py += 1) {
      for (let pxi = x0; pxi <= x1; pxi += 1) {
        if (inRoundRect(pxi + 0.5, py + 0.5, x, y, w, h, r)) set(pxi, py, color);
      }
    }
  };

  // Background: full-bleed for maskable, rounded square otherwise.
  const radius = maskable ? 0 : 0.22 * S;
  for (let y = 0; y < S; y += 1) {
    const t = y / (S - 1);
    const color = [
      Math.round(TEAL_TOP[0] + (TEAL_BOTTOM[0] - TEAL_TOP[0]) * t),
      Math.round(TEAL_TOP[1] + (TEAL_BOTTOM[1] - TEAL_TOP[1]) * t),
      Math.round(TEAL_TOP[2] + (TEAL_BOTTOM[2] - TEAL_TOP[2]) * t),
    ];
    for (let x = 0; x < S; x += 1) {
      if (inRoundRect(x + 0.5, y + 0.5, 0, 0, S, S, radius)) set(x, y, color);
    }
  }

  // The glyph is shrunk for maskable icons so the launcher mask never clips it.
  const sc = maskable ? 0.76 : 1;
  const g = (n) => 0.5 + (n - 0.5) * sc; // normalised, scaled about centre
  const rect = (nx, ny, nw, nh, nr, color) =>
    fillRoundRect(g(nx), g(ny), nw * sc, nh * sc, nr * sc, color);

  // A syringe, top to bottom: plunger, barrel, flanges, needle.
  rect(0.365, 0.150, 0.270, 0.048, 0.022, WHITE); // plunger flange
  rect(0.455, 0.192, 0.090, 0.122, 0.01, WHITE); // plunger rod
  rect(0.395, 0.3, 0.21, 0.42, 0.03, WHITE); // barrel
  rect(0.42, 0.52, 0.16, 0.18, 0.016, TICK); // liquid inside the barrel
  rect(0.425, 0.345, 0.075, 0.017, 0.006, TICK); // graduation marks
  rect(0.425, 0.395, 0.075, 0.017, 0.006, TICK);
  rect(0.425, 0.445, 0.075, 0.017, 0.006, TICK);
  rect(0.33, 0.7, 0.34, 0.046, 0.018, WHITE); // finger flange
  rect(0.47, 0.746, 0.06, 0.046, 0.012, WHITE); // needle hub
  rect(0.492, 0.792, 0.016, 0.116, 0.004, WHITE); // needle
  rect(0.496, 0.905, 0.008, 0.03, 0.002, WHITE); // needle tip

  return downsample(px, ss, size);
}


/* --------------------------------------------------------------------- main */

const TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
];

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="PepCalculator">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#14b8a6" />
      <stop offset="1" stop-color="#0f766e" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="14" fill="url(#g)" />
  <rect x="23" y="10" width="18" height="4" rx="2" fill="#fff" />
  <rect x="29" y="13" width="6" height="9" rx="1.5" fill="#fff" />
  <rect x="25" y="19" width="14" height="27" rx="4" fill="#fff" />
  <rect x="27" y="33" width="10" height="11" rx="2" fill="#0f766e" />
  <rect x="27" y="22" width="5" height="1.6" rx="0.8" fill="#0f766e" />
  <rect x="27" y="25.5" width="5" height="1.6" rx="0.8" fill="#0f766e" />
  <rect x="21" y="45" width="22" height="3.5" rx="1.6" fill="#fff" />
  <rect x="30" y="48" width="4" height="4" rx="1" fill="#fff" />
  <rect x="31.4" y="51.5" width="1.2" height="8" fill="#fff" />
</svg>
`;

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, maskable } of TARGETS) {
  const rgba = renderIcon(size, { maskable });
  writeFileSync(resolve(OUT_DIR, file), encodePng(size, size, rgba));
  process.stdout.write(`wrote public/icons/${file} (${size}x${size})\n`);
}
writeFileSync(resolve(HERE, '..', 'public', 'favicon.svg'), FAVICON);
process.stdout.write('wrote public/favicon.svg\n');

