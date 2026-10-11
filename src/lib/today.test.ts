import { describe, expect, it } from 'vitest';
import type { VialSchedule } from './schedule';
import { dosesOnDate, dosesRemaining, hasSchedule, nextDoseToday } from './today';
import type { SavedVial } from './vials';

const MONDAY = '2024-01-01';
const TUESDAY = '2024-01-02';

function schedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: MONDAY,
    durationValue: 4,
    durationUnit: 'weeks',
    ...overrides,
  };
}

function peptide(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'p1',
    name: 'BPC-157',
    kind: 'peptide',
    reconstitutedOn: MONDAY,
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    schedule: schedule(),
    ...overrides,
  };
}

function oil(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'a1',
    name: 'Test E',
    kind: 'anabolic',
    reconstitutedOn: MONDAY,
    vialAmount: 0,
    vialUnit: 'mg',
    waterMl: 0,
    concentrationMgPerMl: 250,
    vialMl: 10,
    doseAmount: 250,
    doseUnit: 'mg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 3,
    schedule: schedule({ times: ['08:00'] }),
    ...overrides,
  };
}

describe('dosesOnDate', () => {
  it('lists every dose on the date, ordered by time, with the draw amount', () => {
    const doses = dosesOnDate([peptide(), oil()], MONDAY, MONDAY, '07:00');
    expect(doses.map((dose) => dose.time)).toEqual(['08:00', '09:00']);

    const peptideDose = doses.find((dose) => dose.kind === 'peptide');
    // 5 mg / 2 mL = 2.5 mg/mL; 250 mcg -> 0.1 mL -> 10 units on U-100.
    expect(peptideDose?.volumeMl).toBeCloseTo(0.1, 5);
    expect(peptideDose?.drawValue).toBeCloseTo(10, 5);

    const oilDose = doses.find((dose) => dose.kind === 'anabolic');
    // Oils are read in mL: 250 mg at 250 mg/mL -> 1 mL.
    expect(oilDose?.drawValue).toBeCloseTo(1, 5);
  });

  it('ignores vials with no plan', () => {
    expect(dosesOnDate([peptide({ schedule: undefined })], MONDAY, MONDAY, '07:00')).toEqual([]);
  });

  it('can be filtered to a single kind', () => {
    const doses = dosesOnDate([peptide(), oil()], MONDAY, MONDAY, '07:00', 'anabolic');
    expect(doses).toHaveLength(1);
    expect(doses[0].kind).toBe('anabolic');
  });

  it('marks slots that have already passed as taken', () => {
    const doses = dosesOnDate([peptide()], MONDAY, MONDAY, '12:00');
    expect(doses[0].taken).toBe(true);

    const earlier = dosesOnDate([peptide()], MONDAY, MONDAY, '08:00');
    expect(earlier[0].taken).toBe(false);
  });

  it('treats past days as taken and future days as pending', () => {
    expect(dosesOnDate([peptide()], MONDAY, TUESDAY, '00:00')[0].taken).toBe(true);
    expect(dosesOnDate([peptide()], TUESDAY, MONDAY, '23:59')[0].taken).toBe(false);
  });
});

describe('nextDoseToday', () => {
  it('returns the next dose later today', () => {
    const vial = peptide({ schedule: schedule({ times: ['08:00', '20:00'] }) });
    const next = nextDoseToday([vial], MONDAY, '12:00');
    expect(next?.time).toBe('20:00');
  });

  it('rolls over to a later day when nothing is left today', () => {
    const vial = peptide({ schedule: schedule({ repeat: 'weekdays', weekdays: [2] }) });
    const next = nextDoseToday([vial], MONDAY, '12:00');
    expect(next?.date).toBe(TUESDAY);
  });

  it('returns null when there is nothing scheduled', () => {
    expect(nextDoseToday([peptide({ schedule: undefined })], MONDAY, '07:00')).toBeNull();
  });
});

describe('dosesRemaining / hasSchedule', () => {
  it('counts the doses still to come in a finished-length plan', () => {
    // 1/day for 4 weeks = 28 doses; by day 3 (skipping 2 complete days) -> 26 left.
    const vial = peptide();
    expect(dosesRemaining(vial, '2024-01-03', '07:00')).toBe(26);
  });

  it('has no answer for ongoing plans', () => {
    const vial = peptide({ schedule: schedule({ durationUnit: 'ongoing', durationValue: 0 }) });
    expect(dosesRemaining(vial, MONDAY, '07:00')).toBeNull();
  });

  it('reports whether a vial has a schedule', () => {
    expect(hasSchedule(peptide())).toBe(true);
    expect(hasSchedule(peptide({ schedule: undefined }))).toBe(false);
  });
});
