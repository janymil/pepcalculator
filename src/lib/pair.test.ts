import { describe, expect, it } from 'vitest';
import { buildPairHash, parsePairHash } from './pair';

const CODE = 'PC-7K2M-9QXA-4BCD-EFGH-JKLM-NPQR';

describe('buildPairHash / parsePairHash', () => {
  it('round-trips a code and a server', () => {
    const hash = buildPairHash(CODE, 'https://sync.example');
    expect(parsePairHash(hash)).toEqual({ code: CODE, server: 'https://sync.example' });
  });

  it('accepts a messy code and returns it canonical', () => {
    const hash = buildPairHash('pc7k2m9qxa4bcdefghjklmnpqr', 'https://sync.example');
    expect(parsePairHash(hash)?.code).toBe(CODE);
  });

  it('carries an optional person name, trimmed', () => {
    const hash = buildPairHash(CODE, 'https://sync.example', '  Jan  ');
    expect(parsePairHash(hash)).toMatchObject({ name: 'Jan' });
  });

  it('keeps the code in the hash, and not in the clear', () => {
    const hash = buildPairHash(CODE, 'https://sync.example');
    expect(hash.startsWith('#pair=')).toBe(true);
    expect(hash.includes(CODE)).toBe(false);
  });

  it('finds the payload even beside another hash segment', () => {
    const hash = buildPairHash(CODE, '');
    expect(parsePairHash(`${hash}&view=calendar`)?.code).toBe(CODE);
  });

  it('returns null when there is no usable payload', () => {
    expect(parsePairHash('')).toBeNull();
    expect(parsePairHash('#calendar')).toBeNull();
    expect(parsePairHash('#pair=')).toBeNull();
    expect(parsePairHash('#pair=eA')).toBeNull(); // valid base64, not our JSON
  });

  it('refuses an invalid code or a nonsense server', () => {
    expect(parsePairHash(buildPairHash('PC-NOPE', 'https://x.example'))).toBeNull();
    expect(parsePairHash(buildPairHash(CODE, 'javascript:alert(1)'))).toBeNull();
  });
});
