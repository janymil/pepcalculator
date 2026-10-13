/**
 * A QR encoder — hand-rolled and verified, not a dependency.
 *
 * Scope is deliberate and small: **byte mode, error-correction level M, versions
 * 1–10**. That is far more than a pairing URL needs (a 10-wide symbol holds ~200
 * bytes), and it means we never have to carry the full version/EC block tables
 * for all 40 versions. The symbol maths — GF(256) Reed–Solomon, mask selection
 * and format/version bits — follows ISO/IEC 18004 exactly.
 *
 * It is verified against the thing that actually matters: `src/lib/qr.test.ts`
 * rasterises the matrix and reads it back with a real decoder (`jsqr`, a
 * dev-only dependency). If a decoder can read our symbol, it is a real symbol.
 *
 * Pure: no DOM, no deps. The caller turns `modules` into pixels (see
 * `qrSvgPath`, or draw it on a canvas).
 */

export interface QrMatrix {
  size: number;
  /** `modules[y][x]` — `true` is a dark module. */
  modules: boolean[][];
}

/** Format-bits value for error-correction level M. */
const EC_LEVEL_M = 0;

/** Byte mode indicator (4 bits). */
const MODE_BYTE = 0b0100;

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 10;

/* ---------- GF(256) arithmetic (primitive polynomial 0x11d) ---------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function polyMul(a: number[], b: number[]): number[] {
  const out = new Array<number>(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) out[i + j] ^= gfMul(a[i], b[j]);
  }
  return out;
}

/** The RS generator polynomial of the given degree, highest term first. */
function generatorPoly(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i += 1) g = polyMul(g, [1, EXP[i]]);
  return g;
}

/** The `gen.length - 1` error-correction codewords for one block of data. */
function rsRemainder(data: number[], gen: number[]): number[] {
  const buf = data.concat(new Array<number>(gen.length - 1).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const factor = buf[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j += 1) buf[i + j] ^= gfMul(gen[j], factor);
  }
  return buf.slice(data.length);
}

/* ---------- tables (EC level M, versions 1–10) ---------- */

/**
 * `[group1Blocks, group1Data, group2Blocks, group2Data, ecPerBlock]`, straight
 * from ISO/IEC 18004 Table 9 for level M.
 */
const RS_BLOCKS_M: readonly (readonly number[])[] = [
  [1, 16, 0, 0, 10],
  [1, 28, 0, 0, 16],
  [1, 44, 0, 0, 26],
  [2, 32, 0, 0, 18],
  [2, 43, 0, 0, 24],
  [4, 27, 0, 0, 16],
  [4, 31, 0, 0, 18],
  [2, 38, 2, 39, 22],
  [3, 36, 2, 37, 22],
  [4, 43, 1, 44, 26],
];

function dataCodewords(version: number): number {
  const [g1c, g1d, g2c, g2d] = RS_BLOCKS_M[version - 1];
  return g1c * g1d + g2c * g2d;
}

/** Character-count indicator width for byte mode. */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}

/* ---------- codewords ---------- */

function toUtf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Mode + count + payload, terminator, then 0xEC/0x11 pad bytes. */
function buildCodewords(bytes: number[], version: number): number[] {
  const capacityBits = dataCodewords(version) * 8;
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };

  push(MODE_BYTE, 4);
  push(bytes.length, countBits(version));
  for (const byte of bytes) push(byte, 8);

  for (let i = 0; i < Math.min(4, capacityBits - bits.length); i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const pad = [0xec, 0x11];
  for (let i = 0; bits.length < capacityBits; i += 1) push(pad[i % 2], 8);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  return codewords;
}

/** Splits into RS blocks, appends EC codewords, and interleaves them. */
function addEcc(dataWords: number[], version: number): number[] {
  const [g1c, g1d, g2c, g2d, ecLength] = RS_BLOCKS_M[version - 1];
  const gen = generatorPoly(ecLength);

  const blocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < g1c; i += 1) {
    blocks.push(dataWords.slice(offset, offset + g1d));
    offset += g1d;
  }
  for (let i = 0; i < g2c; i += 1) {
    blocks.push(dataWords.slice(offset, offset + g2d));
    offset += g2d;
  }

  const ecBlocks = blocks.map((block) => rsRemainder(block, gen));

  const result: number[] = [];
  const maxData = Math.max(g1d, g2d);
  for (let i = 0; i < maxData; i += 1) {
    for (const block of blocks) if (i < block.length) result.push(block[i]);
  }
  for (let i = 0; i < ecLength; i += 1) {
    for (const block of ecBlocks) result.push(block[i]);
  }
  return result;
}

/* ---------- the symbol ---------- */

/** Alignment-pattern centre coordinates for a version (empty for version 1). */
function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < count; pos -= step) result.splice(1, 0, pos);
  return result;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Builds one symbol; `modules[y][x]` is `true` for a dark module. */
class QrBuilder {
  readonly size: number;
  readonly modules: boolean[][];
  /** Modules belonging to a function pattern, which the mask never touches. */
  private readonly isFunction: boolean[][];

  constructor(readonly version: number) {
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark;
    this.isFunction[y][x] = true;
  }

  drawFunctionPatterns(): void {
    const size = this.size;
    for (let i = 0; i < size; i += 1) {
      this.setFunction(6, i, i % 2 === 0);
      this.setFunction(i, 6, i % 2 === 0);
    }

    this.drawFinderPattern(3, 3);
    this.drawFinderPattern(size - 4, 3);
    this.drawFinderPattern(3, size - 4);

    const positions = alignmentPositions(this.version);
    const count = positions.length;
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < count; j += 1) {
        if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) {
          continue;
        }
        this.drawAlignmentPattern(positions[i], positions[j]);
      }
    }

    this.drawFormatBits(0);
    this.drawVersionBits();
  }

  private drawFinderPattern(x: number, y: number): void {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= this.size || yy < 0 || yy >= this.size) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  private drawAlignmentPattern(x: number, y: number): void {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        this.setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  /** The 15 format bits (2 EC + 3 mask, BCH(15,5), XOR 0x5412), in two copies. */
  drawFormatBits(mask: number): void {
    const data = (EC_LEVEL_M << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i += 1) this.setFunction(8, i, getBit(bits, i));
    this.setFunction(8, 7, getBit(bits, 6));
    this.setFunction(8, 8, getBit(bits, 7));
    this.setFunction(7, 8, getBit(bits, 8));
    for (let i = 9; i < 15; i += 1) this.setFunction(14 - i, 8, getBit(bits, i));

    for (let i = 0; i < 8; i += 1) this.setFunction(this.size - 1 - i, 8, getBit(bits, i));
    for (let i = 8; i < 15; i += 1) this.setFunction(8, this.size - 15 + i, getBit(bits, i));
    this.setFunction(8, this.size - 8, true); // the always-dark module
  }

  /** The 18 version bits (BCH(18,6)), for versions 7 and up only. */
  private drawVersionBits(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;

    for (let i = 0; i < 18; i += 1) {
      const dark = getBit(bits, i);
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  /** The zigzag data placement, skipping function modules. */
  drawCodewords(data: number[]): void {
    const size = this.size;
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert += 1) {
        for (let j = 0; j < 2; j += 1) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i += 1;
          }
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y += 1) {
      for (let x = 0; x < this.size; x += 1) {
        if (!this.isFunction[y][x]) {
          this.modules[y][x] = this.modules[y][x] !== maskBit(mask, x, y);
        }
      }
    }
  }

  /** ISO/IEC 18004's four penalty rules; lower is a "nicer" symbol. */
  penaltyScore(): number {
    const size = this.size;
    let result = 0;

    const scanLine = (get: (i: number) => boolean) => {
      let runColor = false;
      let runLength = 0;
      const history = [0, 0, 0, 0, 0, 0, 0];
      for (let i = 0; i < size; i += 1) {
        if (get(i) === runColor) {
          runLength += 1;
          if (runLength === 5) result += 3;
          else if (runLength > 5) result += 1;
        } else {
          this.addHistory(runLength, history);
          if (!runColor) result += this.countFinderPatterns(history) * 40;
          runColor = get(i);
          runLength = 1;
        }
      }
      result += this.terminateAndCount(runColor, runLength, history) * 40;
    };

    for (let y = 0; y < size; y += 1) scanLine((x) => this.modules[y][x]);
    for (let x = 0; x < size; x += 1) scanLine((y) => this.modules[y][x]);

    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const c = this.modules[y][x];
        if (
          c === this.modules[y][x + 1] &&
          c === this.modules[y + 1][x] &&
          c === this.modules[y + 1][x + 1]
        ) {
          result += 3;
        }
      }
    }

    let dark = 0;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) if (this.modules[y][x]) dark += 1;
    }
    const total = size * size;
    result += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;

    return result;
  }

  private addHistory(runLength: number, history: number[]): void {
    // The light border counts towards the first run.
    if (history[0] === 0) runLength += this.size;
    history.pop();
    history.unshift(runLength);
  }

  private countFinderPatterns(history: number[]): number {
    const n = history[1];
    const core =
      n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
    return (
      (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) +
      (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0)
    );
  }

  private terminateAndCount(runColor: boolean, runLength: number, history: number[]): number {
    if (runColor) {
      this.addHistory(runLength, history);
      runLength = 0;
    }
    runLength += this.size; // trailing light border
    this.addHistory(runLength, history);
    return this.countFinderPatterns(history);
  }
}

/**
 * Encodes `text` as a QR symbol (byte mode, EC level M), picking the smallest
 * version that fits and the lowest-penalty mask.
 *
 * Throws `RangeError('qr_payload_too_long')` when the text exceeds what a
 * version-10 symbol can hold — callers keep payloads short enough that this
 * never happens in practice.
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = toUtf8(text);

  let version = 0;
  for (let v = QR_MIN_VERSION; v <= QR_MAX_VERSION; v += 1) {
    if (4 + countBits(v) + bytes.length * 8 <= dataCodewords(v) * 8) {
      version = v;
      break;
    }
  }
  if (version === 0) throw new RangeError('qr_payload_too_long');

  const data = addEcc(buildCodewords(bytes, version), version);

  const builder = new QrBuilder(version);
  builder.drawFunctionPatterns();
  builder.drawCodewords(data);

  let bestMask = 0;
  let bestPenalty = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    builder.applyMask(mask);
    builder.drawFormatBits(mask);
    const penalty = builder.penaltyScore();
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }
    builder.applyMask(mask); // undo, to try the next mask
  }
  builder.applyMask(bestMask);
  builder.drawFormatBits(bestMask);

  return { size: builder.size, modules: builder.modules };
}

/**
 * The dark modules as a single SVG path `d`, offset by a quiet zone. Render it
 * inside `<svg viewBox="0 0 viewSize viewSize">` with one `<path>`.
 */
export function qrSvgPath(matrix: QrMatrix, quietZone = 4): { d: string; viewSize: number } {
  const viewSize = matrix.size + quietZone * 2;
  let d = '';
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y][x]) d += `M${x + quietZone} ${y + quietZone}h1v1h-1z`;
    }
  }
  return { d, viewSize };
}
