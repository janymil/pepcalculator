import { describe, expect, it } from 'vitest';
import {
  MAX_TIMER_MS,
  millisUntil,
  reminderKey,
  slotDate,
  timerDelay,
  upcomingDoses,
  type UpcomingDose,
} from './reminders';
import type { VialSchedule } from './schedule';
import { tombstoneVial, type SavedVial } from './vials';

// 2024-01-01 is a Monday — handy for weekday-pattern tests.
const MONDAY = '2024-01-01';

function makeVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    reconstitutedOn: MONDAY,
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

function makeSchedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: MONDAY,
    durationValue: 2,
    durationUnit: 'weeks',
    ...overrides,
  };
}

describe('upcomingDoses', () => {
  it('returns the next dose of a scheduled vial', () => {
    const vials = [makeVial({ schedule: makeSchedule() })];
    expect(upcomingDoses(vials, MONDAY, '08:00')).toEqual([
      { vialId: 'v1', name: 'BPC-157', date: MONDAY, time: '09:00' },
    ]);
  });

  it('ignores vials with no schedule', () => {
    expect(upcomingDoses([makeVial()], MONDAY, '08:00')).toEqual([]);
  });

  it('ignores tombstoned vials', () => {
    const dead = tombstoneVial(makeVial({ schedule: makeSchedule() }), '2024-01-01T10:00:00Z');
    expect(upcomingDoses([dead], MONDAY, '08:00')).toEqual([]);
  });

  it('orders across vials by date, then time', () => {
    const vials = [
      makeVial({ id: 'a', name: 'A', schedule: makeSchedule({ times: ['20:00'] }) }),
      makeVial({ id: 'b', name: 'B', schedule: makeSchedule({ times: ['08:00'] }) }),
      makeVial({ id: 'c', name: 'C', schedule: makeSchedule({ startsOn: '2024-01-02' }) }),
    ];
    const order = upcomingDoses(vials, MONDAY, '07:00').map((dose) => dose.vialId);
    expect(order).toEqual(['b', 'a', 'c']);
  });

  it('skips to the future when today\'s dose time has passed', () => {
    const vials = [makeVial({ schedule: makeSchedule({ times: ['09:00'] }) })];
    expect(upcomingDoses(vials, MONDAY, '10:00')[0]?.date).toBe('2024-01-02');
  });

  it('respects a weekday pattern', () => {
    // Monday and Wednesday only (1 = Mon, 3 = Wed).
    const vials = [
      makeVial({ schedule: makeSchedule({ repeat: 'weekdays', weekdays: [1, 3] }) }),
    ];
    // Monday 10:00 — Monday's dose already passed, next is Wednesday.
    expect(upcomingDoses(vials, MONDAY, '10:00')[0]?.date).toBe('2024-01-03');
  });

  it('returns nothing once the plan has finished', () => {
    const vials = [
      makeVial({
        schedule: makeSchedule({ startsOn: '2024-01-01', durationValue: 1, durationUnit: 'weeks' }),
      }),
    ];
    expect(upcomingDoses(vials, '2024-02-01', '08:00')).toEqual([]);
  });
});

describe('slotDate / millisUntil / timerDelay', () => {
  const dose: UpcomingDose = { vialId: 'v1', name: 'X', date: '2024-01-01', time: '09:30' };

  it('builds a local Date for the slot', () => {
    const at = slotDate('2024-01-01', '09:30');
    expect(at.getFullYear()).toBe(2024);
    expect(at.getMonth()).toBe(0);
    expect(at.getDate()).toBe(1);
    expect(at.getHours()).toBe(9);
    expect(at.getMinutes()).toBe(30);
  });

  it('measures the gap to the dose', () => {
    const now = new Date(2024, 0, 1, 9, 0, 0, 0);
    expect(millisUntil(dose, now)).toBe(30 * 60 * 1000);
  });

  it('is negative once the dose time has passed', () => {
    const now = new Date(2024, 0, 1, 10, 0, 0, 0);
    expect(millisUntil(dose, now)).toBe(-30 * 60 * 1000);
  });

  it('clamps the timer delay to a non-negative 32-bit value', () => {
    const past = new Date(2024, 0, 1, 10, 0, 0, 0);
    expect(timerDelay(dose, past)).toBe(0);

    const far: UpcomingDose = { ...dose, date: '2044-01-01' };
    expect(timerDelay(far, new Date(2024, 0, 1))).toBe(MAX_TIMER_MS);
  });
});

describe('reminderKey', () => {
  it('identifies one vial, date and time', () => {
    expect(reminderKey({ vialId: 'v1', name: 'X', date: '2024-01-01', time: '09:00' })).toBe(
      'dose:v1:2024-01-01:09:00',
    );
  });
});
