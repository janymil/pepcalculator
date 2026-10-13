import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { buildPairHash, parsePairHash } from './pair';
import { encodeQr, qrSvgPath, type QrMatrix } from './qr';

/** Rasterise a matrix into the RGBA pixels the decoder expects. */
function rasterise(matrix: QrMatrix, scale = 8, quiet = 4) {
  const dim = (matrix.size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4);
  for (let py = 0; py < dim; py += 1) {
    for (let px = 0; px < dim; px += 1) {
      const mx = Math.floor(px / scale) - quiet;
      const my = Math.floor(py / scale) - quiet;
      const inBounds = mx >= 0 && my >= 0 && mx < matrix.size && my < matrix.size;
      const dark = inBounds && matrix.modules[my][mx];
      const value = dark ? 0 : 255;
      const offset = (py * dim + px) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width: dim, height: dim };
}

function decode(text: string): string | null {
  const matrix = encodeQr(text);
  const { data, width, height } = rasterise(matrix);
  return jsQR(data, width, height)?.data ?? null;
}

// ASCII only: the pairing payload is a URL, so byte-mode ASCII is all we need,
// and it keeps the decoder from having to agree on a character set.
const SAMPLES = [
  'A',
  'hello world',
  'PC-7K2M-9QXA-4BCD-EFGH-JKLM-NPQR',
  'https://app.example/#pair=AbCdEf',
  'https://app.example/#pair=' + 'x'.repeat(120),
  'https://sync.my-domain.example:8787/api/push/pubkey',
];

describe('encodeQr', () => {
  it('produces a symbol a real decoder reads back exactly', () => {
    for (const text of SAMPLES) expect(decode(text), `decoding ${text}`).toBe(text);
  });

  it('round-trips a real pairing link: encode → decode → parse', () => {
    const code = 'PC-7K2M-9QXA-4BCD-EFGH-JKLM-NPQR';
    const server = 'https://sync.example.com';
    const link = `https://app.example${buildPairHash(code, server)}`;

    const decoded = decode(link);
    expect(decoded).toBe(link);
    expect(parsePairHash(new URL(decoded ?? '').hash)).toEqual({ code, server });
  });

  it('starts with the three finder patterns and the timing pattern', () => {
    const { modules, size } = encodeQr('finder check');
    expect(size).toBe(modules.length);

    for (const [row, col] of [
      [0, 0],
      [0, 6],
      [6, 0],
      [3, 3],
      [0, size - 1],
      [size - 1, 0],
    ] as const) {
      expect(modules[row][col]).toBe(true);
    }
    expect(modules[1][1]).toBe(false); // the light ring around a finder
    expect(modules[6][8]).toBe(true); // timing: even column is dark…
    expect(modules[6][9]).toBe(false); // …odd is light
  });

  it('grows the version only when the payload needs it', () => {
    expect(encodeQr('short').size).toBe(21); // version 1
    expect(encodeQr('x'.repeat(120)).size).toBeGreaterThan(21);
  });

  it('refuses a payload too long for a version-10 symbol', () => {
    expect(() => encodeQr('x'.repeat(1000))).toThrow(RangeError);
  });
});

describe('qrSvgPath', () => {
  it('offsets every module by the quiet zone', () => {
    const matrix = encodeQr('quiet zone');
    const { d, viewSize } = qrSvgPath(matrix, 4);
    expect(viewSize).toBe(matrix.size + 8);
    expect(d.startsWith('M4 4h1v1h-1z')).toBe(true); // module (0,0) is dark
  });
});
