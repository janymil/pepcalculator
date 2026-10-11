import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, toIsoDate } from './dates';
import {
  BUD_DAYS,
  TOMBSTONE_TTL_DAYS,
  canSaveVial,
  clearAllVials,
  createVialId,
  filterVialsByKind,
  liveVials,
  looksLikeSavedVial,
  mergeVials,
  normalizeSavedVial,
  purgeTombstones,
  searchVials,
  sortVials,
  tombstoneVial,
  vialKind,
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

    expect(status.concentrationPerMl).toBeCloseTo(2.5, 9);
    expect(status.doseBase).toBeCloseTo(0.25, 9);
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

    expect(status.concentrationPerMl).toBe(0);
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

  it('clearAllVials tombstones every live vial at once', () => {
    const cleared = clearAllVials(
      [makeVial(), makeVial({ id: 'v2' })],
      '2026-02-01T00:00:00.000Z',
    );
    expect(liveVials(cleared)).toEqual([]);
    expect(cleared.every((vial) => vial.deletedAt === '2026-02-01T00:00:00.000Z')).toBe(true);
  });

  it('clearAllVials leaves existing tombstones (and returns the same array when empty)', () => {
    const already = makeVial({ id: 'old', deletedAt: '2026-01-01T00:00:00.000Z' });
    const cleared = clearAllVials([already], '2026-02-01T00:00:00.000Z');
    // The earlier deletion timestamp must survive, not be overwritten.
    expect(cleared[0].deletedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(clearAllVials([], '2026-02-01T00:00:00.000Z')).toEqual([]);
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

/** 250 mg/mL oil, dosed at 250 mg (1 mL per dose) in a 10 mL vial. */
function makeAnabolic(overrides: Partial<SavedVial> = {}): SavedVial {
  return makeVial({
    kind: 'anabolic',
    vialAmount: 0,
    waterMl: 0,
    concentrationMgPerMl: 250,
    vialMl: 10,
    doseAmount: 250,
    doseUnit: 'mg',
    ...overrides,
  });
}

describe('anabolic vials', () => {
  it('treats legacy vials without a kind as peptides', () => {
    expect(vialKind({ ...makeVial(), kind: undefined })).toBe('peptide');
    expect(vialKind(makeVial({ kind: 'anabolic' }))).toBe('anabolic');
  });

  it('computes the volume from the label concentration, not from water', () => {
    const status = vialStatus(makeAnabolic(), '2024-01-01');
    expect(status.concentrationPerMl).toBe(250);
    expect(status.volumePerDoseMl).toBeCloseTo(1, 9); // 250 mg ÷ 250 mg per mL
    expect(status.volumeTotalMl).toBe(10);
    expect(status.totalDoses).toBeCloseTo(10, 9); // 10 mL ÷ 1 mL per dose
  });

  it('has no beyond-use date for oils', () => {
    const status = vialStatus(makeAnabolic(), '2024-01-01');
    expect(status.expiresOn).toBeNull();
    expect(status.daysUntilExpiry).toBeNull();
    expect(status.isExpired).toBe(false);
  });

  it('needs a concentration (not water) to be saveable', () => {
    expect(canSaveVial({ kind: 'anabolic', concentrationMgPerMl: 250, doseAmount: 250 })).toBe(true);
    expect(canSaveVial({ kind: 'anabolic', concentrationMgPerMl: 0, doseAmount: 250 })).toBe(false);
    expect(canSaveVial({ kind: 'peptide', vialAmount: 0, waterMl: 2, doseAmount: 250 })).toBe(
      false,
    );
  });

  it('filters a mixed list by kind', () => {
    const vials = [makeVial({ id: 'p' }), makeAnabolic({ id: 'a' })];
    expect(filterVialsByKind(vials, 'all').map((vial) => vial.id)).toEqual(['p', 'a']);
    expect(filterVialsByKind(vials, 'peptide').map((vial) => vial.id)).toEqual(['p']);
    expect(filterVialsByKind(vials, 'anabolic').map((vial) => vial.id)).toEqual(['a']);
  });

  it('normalizes the kind when reading old or hand-edited data', () => {
    expect(normalizeSavedVial({ ...makeAnabolic(), kind: undefined }).kind).toBe('peptide');
    expect(normalizeSavedVial(makeAnabolic()).kind).toBe('anabolic');
  });
});

describe('purgeTombstones', () => {
  const today = '2026-06-01';

  it('keeps every live vial', () => {
    const list = purgeTombstones([makeVial(), makeAnabolic({ id: 'a1' })], today);
    expect(list.map((vial) => vial.id)).toEqual(['v1', 'a1']);
  });

  it('keeps a fresh tombstone so the deletion can still reach other devices', () => {
    const fresh = makeVial({ deletedAt: '2026-05-31T09:30:00.000Z' });
    expect(purgeTombstones([fresh], today).map((vial) => vial.id)).toEqual(['v1']);
  });

  it('drops a tombstone once it is older than the default window', () => {
    // 2026-03-03 -> 2026-06-01 is exactly 90 days, i.e. past the window.
    const old = makeVial({ deletedAt: '2026-03-03T00:00:00.000Z' });
    expect(purgeTombstones([old], today)).toEqual([]);
  });

  it('keeps a tombstone on the last day of the window', () => {
    const lastDay = makeVial({ deletedAt: '2026-03-04T00:00:00.000Z' }); // 89 days
    expect(purgeTombstones([lastDay], today)).toHaveLength(1);
  });

  it('honours a custom window', () => {
    const grave = makeVial({ deletedAt: '2026-05-31T00:00:00.000Z' }); // 1 day old
    expect(purgeTombstones([grave], today, 1)).toEqual([]);
    expect(purgeTombstones([grave], today, 2)).toHaveLength(1);
  });

  it('keeps an un-dateable tombstone rather than losing the deletion', () => {
    const broken = makeVial({ deletedAt: 'whenever' });
    expect(purgeTombstones([broken], today)).toHaveLength(1);
  });

  it('defaults to a 90-day retention window', () => {
    expect(TOMBSTONE_TTL_DAYS).toBe(90);
  });
});


describe('searchVials / sortVials', () => {
  const today = '2026-10-10';
  const a = makeVial({ id: 'a', name: 'BPC-157', updatedAt: '2026-10-01T00:00:00.000Z' });
  const b = makeVial({ id: 'b', name: 'TB-500', updatedAt: '2026-10-05T00:00:00.000Z' });
  const oil = makeVial({
    id: 'c',
    name: 'Test E',
    kind: 'anabolic',
    vialMl: 10,
    concentrationMgPerMl: 250,
    reconstitutedOn: today,
  });

  it('returns everything for a blank query and matches names case-insensitively', () => {
    expect(searchVials([a, b], '')).toHaveLength(2);
    expect(searchVials([a, b], 'bpc').map((v) => v.id)).toEqual(['a']);
    expect(searchVials([a, b], 'ZZZ')).toEqual([]);
  });

  it('sorts by most recently updated', () => {
    expect(sortVials([a, b], 'newest', today).map((v) => v.id)).toEqual(['b', 'a']);
  });

  it('sorts by name', () => {
    expect(sortVials([b, a], 'name', today).map((v) => v.name)).toEqual(['BPC-157', 'TB-500']);
  });

  it('sorts by expiry, soonest first, with oils last', () => {
    // Both peptides expire on day 28 from their mix date; the oil never expires.
    const soon = makeVial({ id: 'soon', name: 'Soon', reconstitutedOn: '2026-10-05' });
    const later = makeVial({ id: 'later', name: 'Later', reconstitutedOn: '2026-10-10' });
    const ids = sortVials([oil, later, soon], 'expiry', today).map((v) => v.id);
    expect(ids).toEqual(['soon', 'later', 'c']);
  });
});

describe('hormone vials (dosed in IU)', () => {
  /** 10 IU in 1 mL, 2 IU a shot: 10 IU/mL, so 0.2 mL a dose and 5 doses a vial. */
  const hormone = () =>
    makeVial({
      kind: 'hormone',
      name: 'HGH',
      vialAmount: 10,
      vialUnit: 'IU',
      waterMl: 1,
      doseAmount: 2,
      doseUnit: 'IU',
    });

  it('is its own kind, filtered apart from plain peptides', () => {
    expect(vialKind(hormone())).toBe('hormone');
    expect(vialKind(makeVial())).toBe('peptide');
    expect(filterVialsByKind([hormone(), makeVial()], 'hormone')).toHaveLength(1);
  });

  it('derives an IU/mL strength and a volume per dose', () => {
    const status = vialStatus(hormone(), '2026-10-11');

    expect(status.concentrationPerMl).toBeCloseTo(10, 9);
    expect(status.doseBase).toBeCloseTo(2, 9);
    expect(status.volumePerDoseMl).toBeCloseTo(0.2, 9);
    expect(status.totalDoses).toBeCloseTo(5, 9);
  });

  it('expires like a peptide — it is reconstituted with water', () => {
    expect(vialStatus(hormone(), '2026-10-11').expiresOn).toBe('2026-11-07');
  });

  it('derives nothing at all when the units come from different families', () => {
    // A vial in IU and a dose in mcg cannot be reconciled, so nothing is drawn.
    const mixed = makeVial({ kind: 'hormone', vialUnit: 'IU', doseAmount: 250, doseUnit: 'mcg' });
    const status = vialStatus(mixed, '2026-10-11');

    expect(status.concentrationPerMl).toBe(0);
    expect(status.volumePerDoseMl).toBe(0);
    expect(status.dosesLeft).toBe(0);
  });

  it('accepts IU through a backup or sync payload', () => {
    expect(looksLikeSavedVial(hormone())).toBe(true);
    expect(looksLikeSavedVial(normalizeSavedVial(hormone()))).toBe(true);
    expect(looksLikeSavedVial({ ...hormone(), vialUnit: 'grains' })).toBe(false);
  });
});

