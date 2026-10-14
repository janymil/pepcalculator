import { describe, expect, it } from 'vitest';
import { NUDGE_INTERVAL_DAYS, dataFingerprint, shouldNudgeBackup, type BackupNudgeInput } from './backupReminder';
import type { Measurement } from './measure';
import type { Owner } from './owners';
import type { SavedVial } from './vials';

const OWNERS: Owner[] = [{ id: 'me', name: '' }];

function vial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'p1',
    name: 'BPC-157',
    kind: 'peptide',
    reconstitutedOn: '2024-01-01',
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

describe('dataFingerprint', () => {
  it('is the same for the same data, and different when something changes', () => {
    const before = dataFingerprint([vial()], OWNERS, []);
    expect(dataFingerprint([vial()], OWNERS, [])).toBe(before);
    expect(dataFingerprint([vial({ dosesTaken: 1 })], OWNERS, [])).not.toBe(before);
    expect(dataFingerprint([vial(), vial({ id: 'p2' })], OWNERS, [])).not.toBe(before);
  });

  it('does not treat a reordered list as a change (a sync can reorder it)', () => {
    const a = vial({ id: 'a' });
    const b = vial({ id: 'b' });
    expect(dataFingerprint([a, b], OWNERS, [])).toBe(dataFingerprint([b, a], OWNERS, []));
  });

  it('ignores soft-deleted vials, exactly as a backup leaves them out', () => {
    const gone = vial({ id: 'gone', deletedAt: '2024-01-02T00:00:00.000Z' });
    expect(dataFingerprint([vial(), gone], OWNERS, [])).toBe(dataFingerprint([vial()], OWNERS, []));
  });

  it('notices a new measurement, and a renamed person', () => {
    const entry: Measurement = { id: 'm1', date: '2024-01-01', weightKg: 80, updatedAt: '2024-01-01T00:00:00.000Z' };
    const base = dataFingerprint([vial()], OWNERS, []);
    expect(dataFingerprint([vial()], OWNERS, [entry])).not.toBe(base);
    expect(dataFingerprint([vial()], [{ id: 'me', name: 'Kim' }], [])).not.toBe(base);
  });
});

describe('shouldNudgeBackup', () => {
  const base: BackupNudgeInput = {
    hasData: true,
    changed: true,
    lastBackup: '2024-01-01',
    nudgedOn: '',
    seenOn: '2024-01-01',
    todayIso: '2024-01-09',
  };

  it('nudges once the quiet period is over and something changed', () => {
    expect(shouldNudgeBackup(base)).toBe(true);
  });

  it('stays quiet when nothing changed since the last copy', () => {
    expect(shouldNudgeBackup({ ...base, changed: false })).toBe(false);
  });

  it('stays quiet when there is nothing to save', () => {
    expect(shouldNudgeBackup({ ...base, hasData: false })).toBe(false);
  });

  it('stays quiet inside the quiet period after the last copy', () => {
    const day = (n: number) => `2024-01-${String(1 + n).padStart(2, '0')}`;
    expect(shouldNudgeBackup({ ...base, todayIso: day(NUDGE_INTERVAL_DAYS - 1) })).toBe(false);
    expect(shouldNudgeBackup({ ...base, todayIso: day(NUDGE_INTERVAL_DAYS) })).toBe(true);
  });

  it('stays away for a full period after the reminder is dismissed', () => {
    expect(shouldNudgeBackup({ ...base, nudgedOn: '2024-01-08' })).toBe(false);
    expect(shouldNudgeBackup({ ...base, nudgedOn: '2024-01-08', todayIso: '2024-01-15' })).toBe(true);
  });

  it('does not nag a brand-new user: the clock starts the day data first appears', () => {
    const fresh = { ...base, lastBackup: '', seenOn: '2024-01-09' };
    expect(shouldNudgeBackup(fresh)).toBe(false);
    expect(shouldNudgeBackup({ ...fresh, todayIso: '2024-01-16' })).toBe(true);
  });

  it('has nothing to measure from before the first sight is recorded', () => {
    expect(shouldNudgeBackup({ ...base, lastBackup: '', seenOn: '' })).toBe(false);
  });

  it('accepts a full timestamp for the last copy', () => {
    expect(shouldNudgeBackup({ ...base, lastBackup: '2024-01-01T09:30:00.000Z' })).toBe(true);
  });
});
