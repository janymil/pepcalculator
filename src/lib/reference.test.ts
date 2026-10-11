import { describe, expect, it } from 'vitest';
import { compoundById, matchCompound, rangeHint } from './reference';

describe('matchCompound', () => {
  it('matches on the id, whatever the punctuation or spacing', () => {
    expect(matchCompound('BPC-157')?.id).toBe('bpc157');
    expect(matchCompound('bpc 157')?.id).toBe('bpc157');
    expect(matchCompound('bpc157')?.id).toBe('bpc157');
  });

  it('matches a compound whose reference name carries a suffix', () => {
    expect(matchCompound('TB-500')?.id).toBe('tb500');
  });

  it('matches case-insensitively and through a short form', () => {
    expect(matchCompound('semaglutide')?.id).toBe('semaglutide');
    expect(matchCompound('Test E')?.id).toBe('test-e');
  });

  it('refuses names that are too short or simply unknown', () => {
    expect(matchCompound('')).toBeUndefined();
    expect(matchCompound('mg')).toBeUndefined();
    expect(matchCompound('something else')).toBeUndefined();
  });
});

describe('rangeHint', () => {
  const bpc = compoundById('bpc157') as NonNullable<ReturnType<typeof compoundById>>;

  it('reads a dose against the cited range', () => {
    expect(rangeHint(bpc, 0.35)).toBe('within');
    expect(rangeHint(bpc, 0.25)).toBe('within');
    expect(rangeHint(bpc, 0.2)).toBe('below');
    expect(rangeHint(bpc, 0.05)).toBe('wellBelow');
    expect(rangeHint(bpc, 1)).toBe('above');
  });

  it('converts the compound unit before comparing', () => {
    const ipamorelin = compoundById('ipamorelin') as NonNullable<
      ReturnType<typeof compoundById>
    >;
    // 100–300 mcg, expressed in mg.
    expect(rangeHint(ipamorelin, 0.2)).toBe('within');
    expect(rangeHint(ipamorelin, 0.02)).toBe('wellBelow');
  });

  it('has no opinion without a dose', () => {
    expect(rangeHint(bpc, 0)).toBeNull();
    expect(rangeHint(bpc, Number.NaN)).toBeNull();
  });
});
