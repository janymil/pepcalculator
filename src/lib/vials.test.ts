import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toIsoDate } from './dates';
import {
  BUD_DAYS,
  canSaveVial,
  createVialId,
  liveVials,
  looksLikeSavedVial,
  mergeVials,
  normalizeSavedVial,
  tombstoneVial,
  vialStatus,
  type SavedVial,
} from './vials';

/** 5 mg vial + 2 mL water, dosed at 250 mcg. */
function makeVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    reconstitutedOn: '2026-10-10',
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    ...overrides,
  };
}

describe('date helpers', () => {
  it('formats a Date as a local yyyy-mm-dd string', () => {
    expect(toIsoDate(new Date(2026, 9, 10))).toBe('2026-10-10');
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('adds days across month boundaries', () => {
    expect(addDays('2026-10-10', BUD_DAYS)).toBe('2026-11-07');
    expect(addDays('2026-10-10', 0)).toBe('2026-10-10');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-10', '2026-11-07')).toBe(28);
    expect(daysBetween('2026-11-07', '2026-10-10')).toBe(-28);
    expect(daysBetween('2026-10-10', '2026-10-10')).toBe(0);
  });
});

describe('vialStatus', () => {
  it('derives concentration, dose volume and doses per vial', () => {
    const status = vialStatus(makeVial(), '2026-10-10');

    expect(status.concentrationMgPerMl).toBeCloseTo(2.5, 9);
    expect(status.doseMg).toBeCloseTo(0.25, 9);
    expect(status.volumePerDoseMl).toBeCloseTo(0.1, 9);
    expect(status.totalDoses).toBeCloseTo(20, 9);
    expect(status.dosesLeft).toBeCloseTo(20, 9);
    expect(status.volumeTotalMl).toBeCloseTo(2, 9);
    expect(status.volumeLeftMl).toBeCloseTo(2, 9);
    expect(status.percentLeft).toBeCloseTo(1, 9);
  });

  it('subtracts logged doses from what is left', () => {
    const status = vialStatus(makeVial({ dosesTaken: 5 }), '2026-10-10');

    expect(status.dosesTaken).toBe(5);
    expect(status.dosesLeft).toBeCloseTo(15, 9);
    // 5 doses x 0.1 mL = 0.5 mL used, so 1.5 mL remains of 2 mL.
    expect(status.volumeLeftMl).toBeCloseTo(1.5, 9);
    expect(status.percentLeft).toBeCloseTo(0.75, 9);
  });

  it('never goes below zero when more doses were logged than the vial holds', () => {
    const status = vialStatus(makeVial({ dosesTaken: 40 }), '2026-10-10');

    expect(status.dosesLeft).toBe(0);
    expect(status.volumeLeftMl).toBe(0);
    expect(status.percentLeft).toBe(0);
  });

  it('sets the beyond-use date 28 days after reconstitution', () => {
    const status = vialStatus(makeVial(), '2026-10-10');

    expect(status.expiresOn).toBe(addDays('2026-10-10', BUD_DAYS));
    expect(status.daysUntilExpiry).toBe(28);
    expect(status.isExpired).toBe(false);
  });

  it('flags a vial as expired once the date has passed', () => {
    const status = vialStatus(makeVial(), '2026-12-01');

    expect(status.daysUntilExpiry).toBeLessThan(0);
    expect(status.isExpired).toBe(true);
  });

  it('treats the last allowed day as still usable', () => {
    const status = vialStatus(makeVial({ reconstitutedOn: '2026-10-10' }), '2026-11-07');

    expect(status.daysUntilExpiry).toBe(0);
    expect(status.isExpired).toBe(false);
  });

  it('stays sane when the inputs are incomplete', () => {
    const status = vialStatus(makeVial({ vialAmount: 0, waterMl: 0 }), '2026-10-10');

    expect(status.concentrationMgPerMl).toBe(0);
    expect(status.volumePerDoseMl).toBe(0);
    expect(status.dosesLeft).toBe(0);
  });
});

describe('canSaveVial', () => {
  it('requires a vial amount, water and a dose', () => {
    expect(canSaveVial({ vialAmount: 5, waterMl: 2, doseAmount: 250 })).toBe(true);
    expect(canSaveVial({ vialAmount: 5, waterMl: 0, doseAmount: 250 })).toBe(false);
    expect(canSaveVial({ vialAmount: 0, waterMl: 2, doseAmount: 250 })).toBe(false);
    expect(canSaveVial({ vialAmount: 5, waterMl: 2, doseAmount: 0 })).toBe(false);
  });
});

describe('createVialId', () => {
  it('produces unique ids', () => {
    const ids = new Set([createVialId(), createVialId(), createVialId()]);
    expect(ids.size).toBe(3);
  });
});

describe('mergeVials', () => {
  it('adds incoming vials and keeps existing ones', () => {
    const merged = mergeVials([makeVial()], [makeVial({ id: 'v2', name: 'Other' })]);
    expect(merged.map((vial) => vial.id).sort()).toEqual(['v1', 'v2']);
  });

  it('does not duplicate the same id', () => {
    const merged = mergeVials([makeVial()], [makeVial({ name: 'Renamed' })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Renamed');
  });

  it('lets the newer updatedAt win, whichever side it comes from', () => {
    const older = makeVial({ name: 'Old', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeVial({ name: 'New', updatedAt: '2026-02-01T00:00:00.000Z' });

    expect(mergeVials([older], [newer])[0].name).toBe('New');
    // An older incoming copy must not overwrite a newer local one.
    expect(mergeVials([newer], [older])[0].name).toBe('New');
  });
});

describe('tombstones (soft delete)', () => {
  it('hides deleted vials from the live list', () => {
    const kept = makeVial();
    const removed = makeVial({ id: 'v2', deletedAt: '2026-03-01T00:00:00.000Z' });
    expect(liveVials([kept, removed]).map((vial) => vial.id)).toEqual(['v1']);
  });

  it('stamps the deletion as newest so it beats the copy on the other device', () => {
    const live = makeVial({ updatedAt: '2026-01-01T00:00:00.000Z' });
    const grave = tombstoneVial(live, '2026-02-01T00:00:00.000Z');

    expect(grave.deletedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(grave.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(mergeVials([live], [grave])[0].deletedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('resurrects the vial if the other device edits it afterwards', () => {
    const grave = tombstoneVial(makeVial(), '2026-02-01T00:00:00.000Z');
    const edited = makeVial({ name: 'Back again', updatedAt: '2026-03-01T00:00:00.000Z' });

    const merged = mergeVials([grave], [edited]);
    expect(merged).toHaveLength(1);
    expect(merged[0].deletedAt).toBeUndefined();
    expect(merged[0].name).toBe('Back again');
  });
});

describe('looksLikeSavedVial / normalizeSavedVial', () => {
  it('rejects junk and accepts a real vial', () => {
    expect(looksLikeSavedVial(null)).toBe(false);
    expect(looksLikeSavedVial({ id: 'x' })).toBe(false);
    expect(looksLikeSavedVial({ ...makeVial(), doseUnit: 'grams' })).toBe(false);
    expect(looksLikeSavedVial(makeVial())).toBe(true);
  });

  it('fills in defaults for missing optional fields', () => {
    const normalized = normalizeSavedVial({
      id: 'x',
      name: 'x',
      reconstitutedOn: '2026-01-01',
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 1,
      doseAmount: 1,
      doseUnit: 'mg',
    });

    expect(normalized.dosesTaken).toBe(0);
    expect(normalized.syringeType).toBe('U100');
    expect(normalized.syringeCapacityMl).toBe(1);
  });
});
