import { describe, expect, it } from 'vitest';
import { compoundById, formatRange, hasCitedRange, matchCompound, rangeHint } from './reference';

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

describe('hasCitedRange', () => {
  it('is true for an entry with a documented range', () => {
    const bpc = compoundById('bpc157') as NonNullable<ReturnType<typeof compoundById>>;
    expect(hasCitedRange(bpc)).toBe(true);
    expect(formatRange(bpc)).toBe('0.25–0.5 mg');
  });

  it('is false for an investigational entry, so nothing can invent one', () => {
    // Retatrutide is in trials: there is no approved dose to cite. The entry
    // therefore has no range at all — and every caller that needs one has to
    // narrow through the guard before it can read the fields.
    const reta = compoundById('retatrutide') as NonNullable<ReturnType<typeof compoundById>>;
    expect(hasCitedRange(reta)).toBe(false);
    expect(formatRange(reta)).toBeNull();
    expect(reta.investigational).toBe(true);
    // The facts the rest of the sheet needs are still there.
    expect(reta.halfLifeHours).toBeGreaterThan(0);
    expect(matchCompound('retatrutide')?.id).toBe('retatrutide');
  });

  it('never yields a dose verdict for an entry with no cited range', () => {
    const reta = compoundById('retatrutide') as NonNullable<ReturnType<typeof compoundById>>;
    expect(rangeHint(reta, 0.5)).toBeNull();
    expect(rangeHint(reta, 1)).toBeNull();
    expect(rangeHint(reta, 12)).toBeNull();
  });
});
