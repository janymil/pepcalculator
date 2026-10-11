import { describe, expect, it } from 'vitest';
import type { VialSchedule } from './schedule';
import { buildSupply, vialSupply } from './supply';
import type { SavedVial } from './vials';

/** 5 mg in 2 mL -> 2.5 mg/mL, so a 250 mcg dose is 0.1 mL and 20 doses a vial. */
function makeVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    reconstitutedOn: '2026-01-05',
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    kind: 'peptide',
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    ...overrides,
  };
}

function daily(
  times: string[],
  startsOn = '2026-01-05',
  durationValue = 4,
  durationUnit: VialSchedule['durationUnit'] = 'weeks',
): VialSchedule {
  return { times, repeat: 'daily', weekdays: [], startsOn, durationValue, durationUnit };
}

describe('vialSupply without a plan', () => {
  it('cannot project a run-out, but still reports what is left', () => {
    const supply = vialSupply(makeVial(), '2026-01-05', '08:00');

    expect(supply.runOutOn).toBeNull();
    expect(supply.daysOfSupply).toBeNull();
    expect(supply.dosesLeft).toBe(20);
    expect(supply.volumeLeftMl).toBeCloseTo(2, 6);
    expect(supply.percentLeft).toBeCloseTo(100, 6);
  });
});

describe('vialSupply with a plan', () => {
  it('projects the day the last dose leaves the vial', () => {
    // One dose a day from 5 Jan, 20 doses in the vial -> the 20th lands on the 24th.
    const supply = vialSupply(makeVial({ schedule: daily(['09:00']) }), '2026-01-05', '08:00');

    expect(supply.runOutOn).toBe('2026-01-24');
    expect(supply.daysOfSupply).toBe(19);
    expect(supply.dosesLeft).toBe(20);
  });

  it('does not count times of day that have already passed', () => {
    const vial = makeVial({ schedule: daily(['08:00', '20:00']) });

    // 08:00 has happened and 20:00 has not, so day one still yields a dose; after
    // that it is two a day, putting the 20th dose on the tenth day (5 Jan + 9).
    expect(vialSupply(vial, '2026-01-05', '12:00').runOutOn).toBe('2026-01-14');
  });

  it('derives doses taken from the plan, not from the stored counter', () => {
    // Running since 20 Dec, one a day; on 5 Jan at 10:00 that is 17 done, so three
    // of the twenty are left — the vial is nearly empty without anyone logging it.
    const vial = makeVial({ schedule: daily(['09:00'], '2025-12-20', 0, 'ongoing') });
    const supply = vialSupply(vial, '2026-01-05', '10:00');

    expect(supply.dosesLeft).toBe(3);
    expect(supply.isLow).toBe(true);
    expect(supply.runOutOn).toBe('2026-01-08');
  });

  it('flags a vial that expires before the plan finishes', () => {
    // Mixed on 20 Dec, so the use-by date is 17 Jan; the plan needs it until the 24th.
    const vial = makeVial({
      reconstitutedOn: '2025-12-20',
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
    });
    const supply = vialSupply(vial, '2026-01-05', '08:00');

    expect(supply.expiresOn).toBe('2026-01-17');
    expect(supply.runOutOn).toBe('2026-01-24');
    expect(supply.expiresWithDosesLeft).toBe(true);
    // 18 Jan through 24 Jan inclusive: seven doses that would be thrown away.
    expect(supply.dosesAtRisk).toBe(7);
  });

  it('has no expiry risk when the plan ends before the use-by date', () => {
    const supply = vialSupply(makeVial({ schedule: daily(['09:00']) }), '2026-01-05', '08:00');

    expect(supply.expiresWithDosesLeft).toBe(false);
    expect(supply.dosesAtRisk).toBe(0);
  });
});

describe('buildSupply', () => {
  it('reports no run-out for a stack of unscheduled vials', () => {
    const summary = buildSupply([makeVial(), makeVial({ id: 'v2' })], '2026-01-05', '08:00');

    expect(summary.vials).toHaveLength(2);
    expect(summary.runsOutOn).toBeNull();
    expect(summary.vialsToReorder).toBe(0);
  });

  it('takes the soonest run-out across the stack', () => {
    // Same amount in each vial, but one is drawn twice a day.
    const twiceDaily = makeVial({ id: 'twice', schedule: daily(['08:00', '20:00'], '2026-01-05', 0, 'ongoing') });
    const onceDaily = makeVial({ id: 'once', schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing') });

    const summary = buildSupply([onceDaily, twiceDaily], '2026-01-05', '08:00');

    expect(summary.runsOutOn).toBe('2026-01-14');
  });

  it('counts the extra vials a plan needs after the first one runs out', () => {
    // A 4-week plan at one dose a day is 28 doses, and a vial holds 20.
    const summary = buildSupply([makeVial({ schedule: daily(['09:00']) })], '2026-01-05', '08:00');

    expect(summary.vialsToReorder).toBe(1);
  });

  it('needs no extra vials when the plan ends with the vial', () => {
    // A two-week plan finishes on 18 Jan, before the vial would be empty.
    const summary = buildSupply(
      [makeVial({ schedule: daily(['09:00'], '2026-01-05', 2, 'weeks') })],
      '2026-01-05',
      '08:00',
    );

    expect(summary.vialsToReorder).toBe(0);
  });

  it('lists expiring vials and low vials, and leaves empty ones alone', () => {
    const expiringSoon = makeVial({
      id: 'expiring',
      reconstitutedOn: '2025-12-10', // use-by 7 Jan — two days away
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
    });
    const nearlyEmpty = makeVial({
      id: 'low',
      schedule: daily(['09:00'], '2025-12-20', 0, 'ongoing'),
    });
    const finished = makeVial({ id: 'empty', dosesTaken: 40 });

    const summary = buildSupply([expiringSoon, nearlyEmpty, finished], '2026-01-05', '10:00');

    // `expiring` would otherwise also match the finished vial (it is expired too),
    // which is why the list requires doses to be left.
    expect(summary.expiring.map((row) => row.vial.id)).toEqual(['expiring']);
    expect(summary.low.map((row) => row.vial.id)).toEqual(['low']);
  });

  it('leaves tombstoned vials out of the outlook', () => {
    const deleted = makeVial({ id: 'gone', deletedAt: '2026-01-04T10:00:00.000Z' });
    const summary = buildSupply([deleted, makeVial({ id: 'live' })], '2026-01-05', '08:00');

    expect(summary.vials.map((row) => row.vial.id)).toEqual(['live']);
  });
});
