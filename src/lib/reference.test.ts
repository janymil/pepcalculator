import { describe, expect, it } from 'vitest';
import {
  compoundById,
  formatRange,
  hasCitedRange,
  matchCompound,
  rangeAppliesTo,
  rangeHint,
} from './reference';

/** A compound that is definitely in the list, without a non-null assertion. */
const ref = (id: string): NonNullable<ReturnType<typeof compoundById>> =>
  compoundById(id) as NonNullable<ReturnType<typeof compoundById>>;

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

describe('compound routes', () => {
  /** The molecules that reach people both as a compounded vial and as a pen. */
  const bothRoutes = ['semaglutide', 'tirzepatide', 'retatrutide'];

  it('declares the route for every molecule that reaches people two ways', () => {
    for (const id of bothRoutes) {
      expect(ref(id).route, id).toBe('vial');
    }
  });

  it('leaves the route unset where there is only one route to confuse', () => {
    // BPC-157 is drawn from a vial and always will be, so a route field there
    // would be noise rather than protection.
    expect(ref('bpc157').route).toBeUndefined();
  });

  it('refuses to compare a vial range against a pen dose', () => {
    expect(rangeAppliesTo(ref('tirzepatide'), 'clicks')).toBe(false);
    // The same figures do describe a syringe draw from a reconstituted vial.
    expect(rangeAppliesTo(ref('tirzepatide'), 'insulin')).toBe(true);
    expect(rangeAppliesTo(ref('tirzepatide'), 'volume')).toBe(true);
  });

  it('lets a range with no declared route apply to any draw', () => {
    expect(rangeAppliesTo(ref('bpc157'), 'clicks')).toBe(true);
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
