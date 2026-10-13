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

  it('shortens the supply once a step-up plan raises the dose', () => {
    // 10 mg in 2 mL = 5 mg/mL, so 0.25 mg is 0.05 mL and 0.5 mg is 0.1 mL.
    // 28 days at 0.05 mL uses 1.4 mL, leaving 0.6 mL — six days at 0.1 mL.
    const stepped = makeVial({
      vialAmount: 10,
      waterMl: 2,
      doseAmount: 0.25,
      doseUnit: 'mg',
      schedule: {
        times: ['09:00'],
        repeat: 'daily',
        weekdays: [],
        startsOn: '2026-01-05',
        durationValue: 0,
        durationUnit: 'ongoing',
        phases: [
          { days: 28, doseAmount: 0.25 },
          { days: 0, doseAmount: 0.5 },
        ],
      },
    });

    expect(vialSupply(stepped, '2026-01-05', '08:00').runOutOn).toBe('2026-02-07');
  });

  it('reaches further on a flat plan that never steps up', () => {
    const flat = makeVial({
      vialAmount: 10,
      waterMl: 2,
      doseAmount: 0.25,
      doseUnit: 'mg',
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
    });

    // Forty doses of 0.05 mL is the whole 2 mL, so the last one is on 13 Feb.
    expect(vialSupply(flat, '2026-01-05', '08:00').runOutOn).toBe('2026-02-13');
  });
});

/** 5 mg in 2 mL -> 2.5 mg/mL; 250 mcg = 0.25 mg = 0.1 mL, so 20 doses a vial. */
describe('a shared bottle', () => {
  const ana = { ownerId: 'ana', from: '2026-01-15', doseAmount: 500, doseUnit: 'mcg' as const };

  it('counts a sharer’s doses only from the day they joined', () => {
    // One 250 mcg dose a day from 5 Jan; Ana joins on the 15th at 500 mcg a day.
    const vial = makeVial({
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
      shares: [ana],
    });

    // The ten days before she joined (5–14 Jan) are the owner's alone: 2.5 mg of
    // the 5 mg is gone, and not one drop of it is charged to her.
    const supply = vialSupply(vial, '2026-01-15', '07:00');
    expect(supply.remainingBase).toBeCloseTo(2.5, 9);
    expect(supply.volumeLeftMl).toBeCloseTo(1, 9);
  });

  it('reads the same bottle in each person’s own dose', () => {
    const vial = makeVial({
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
      shares: [ana],
    });

    // 2.5 mg left is ten of the owner's doses and five of Ana's — one bottle, two
    // honest answers to "how many injections is that?".
    expect(vialSupply(vial, '2026-01-15', '07:00', 'me').dosesLeft).toBeCloseTo(10, 9);
    expect(vialSupply(vial, '2026-01-15', '07:00', 'ana').dosesLeft).toBeCloseTo(5, 9);

    const [entry] = vialSupply(vial, '2026-01-15', '07:00').shares;
    expect(entry).toMatchObject({ ownerId: 'ana', from: '2026-01-15', doseAmount: 500 });
    expect(entry.dosesLeft).toBeCloseTo(5, 9);
  });

  it('runs out sooner once somebody else draws from it', () => {
    const alone = makeVial({ schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing') });
    const shared = makeVial({
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
      shares: [{ ownerId: 'ana', from: '2026-01-15', doseAmount: 250, doseUnit: 'mcg' }],
    });

    // Alone, 2.5 mg is ten days of one dose — the 24th. Two of you empty it in
    // five, which is the whole reason the old number was wrong.
    expect(vialSupply(alone, '2026-01-15', '07:00').runOutOn).toBe('2026-01-24');
    expect(vialSupply(shared, '2026-01-15', '07:00').runOutOn).toBe('2026-01-19');
  });

  it('follows the owner’s cadence re-anchored to the day they joined', () => {
    // Same once-a-day plan, but starting on the 10th instead of the 5th.
    const vial = makeVial({
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
      shares: [{ ownerId: 'ana', from: '2026-01-10' }],
    });

    // By the 12th the owner has taken 5–11 Jan (7 doses) and Ana 10–11 Jan (2).
    // Nine doses of 0.25 mg is 2.25 mg gone; counting only the owner's would have
    // left 3.25 mg in a bottle holding 2.75.
    const supply = vialSupply(vial, '2026-01-12', '07:00');
    expect(supply.remainingBase).toBeCloseTo(5 - 9 * 0.25, 9);
    expect(supply.remainingBase).not.toBeCloseTo(5 - 7 * 0.25, 9);
  });

  it('leaves a vial nobody shares exactly as it was', () => {
    const alone = makeVial({ schedule: daily(['09:00']) });

    expect(vialSupply({ ...alone, shares: undefined }, '2026-01-10', '08:00')).toMatchObject({
      runOutOn: vialSupply(alone, '2026-01-10', '08:00').runOutOn,
      dosesLeft: vialSupply(alone, '2026-01-10', '08:00').dosesLeft,
      shares: [],
    });
  });

  it('leaves out a sharer whose dose cannot be measured against the bottle', () => {
    // An IU vial cannot honour a dose written in mg, so it is skipped rather
    // than converted into a number nobody can draw.
    const hormone = makeVial({
      kind: 'hormone',
      vialUnit: 'IU',
      doseAmount: 250,
      doseUnit: 'IU',
      schedule: daily(['09:00'], '2026-01-05', 0, 'ongoing'),
    });
    const wrongUnits = {
      ...hormone,
      shares: [{ ownerId: 'ana', from: '2026-01-10', doseAmount: 5, doseUnit: 'mg' as const }],
    };

    expect(vialSupply(wrongUnits, '2026-01-12', '07:00').remainingBase).toBeCloseTo(
      vialSupply(hormone, '2026-01-12', '07:00').remainingBase,
      9,
    );
  });

  it('reorders more vials when two people are emptying the bottle', () => {
    const alone = buildSupply([makeVial({ schedule: daily(['09:00']) })], '2026-01-05', '08:00');
    const shared = buildSupply(
      [
        makeVial({
          schedule: daily(['09:00']),
          shares: [{ ownerId: 'ana', from: '2026-01-05', doseAmount: 250, doseUnit: 'mcg' }],
        }),
      ],
      '2026-01-05',
      '08:00',
    );

    expect(shared.vialsToReorder).toBeGreaterThan(alone.vialsToReorder);
  });
});

