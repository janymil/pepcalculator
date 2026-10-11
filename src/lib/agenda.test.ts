import { describe, expect, it } from 'vitest';
import {
  agendaForDay,
  agendaForMonth,
  hasAnyPlan,
  scheduledVials,
  upcomingDays,
} from './agenda';
import type { VialSchedule } from './schedule';
import { tombstoneVial, type SavedVial } from './vials';

// 2024-01-01 is a Monday.
const MONDAY = '2024-01-01';

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
    schedule: makeSchedule({ times: ['09:00', '21:00'] }),
    ...overrides,
  };
}

describe('scheduledVials / hasAnyPlan', () => {
  it('keeps only live vials that have a plan', () => {
    const vials = [
      makeVial({ id: 'a' }),
      makeVial({ id: 'b', schedule: undefined }),
      tombstoneVial(makeVial({ id: 'c' }), '2024-01-01T10:00:00Z'),
    ];
    expect(scheduledVials(vials).map((vial) => vial.id)).toEqual(['a']);
    expect(hasAnyPlan(vials)).toBe(true);
  });

  it('reports no plan for an empty list', () => {
    expect(hasAnyPlan([])).toBe(false);
  });
});

describe('agendaForDay', () => {
  it('merges every vial and sorts by time', () => {
    const vials = [
      makeVial({ id: 'a', name: 'BPC-157', schedule: makeSchedule({ times: ['09:00', '21:00'] }) }),
      makeVial({ id: 'b', name: 'TB-500', schedule: makeSchedule({ times: ['08:00'] }) }),
    ];
    const entries = agendaForDay(vials, MONDAY, MONDAY);
    expect(entries.map((entry) => `${entry.time} ${entry.name}`)).toEqual([
      '08:00 TB-500',
      '09:00 BPC-157',
      '21:00 BPC-157',
    ]);
  });

  it('breaks ties on the vial name', () => {
    const vials = [
      makeVial({ id: 'a', name: 'Zeta', schedule: makeSchedule({ times: ['09:00'] }) }),
      makeVial({ id: 'b', name: 'Alpha', schedule: makeSchedule({ times: ['09:00'] }) }),
    ];
    expect(agendaForDay(vials, MONDAY, MONDAY).map((entry) => entry.name)).toEqual([
      'Alpha',
      'Zeta',
    ]);
  });

  it('carries the draw amounts (5 mg / 2 mL, 250 mcg, U-100 → 10 units)', () => {
    const entries = agendaForDay([makeVial()], MONDAY, MONDAY);
    expect(entries[0].volumePerDoseMl).toBeCloseTo(0.1, 9);
    expect(entries[0].unitsPerDose).toBeCloseTo(10, 9);
  });

  it('is empty on a day the plan does not cover', () => {
    const vials = [
      makeVial({
        schedule: makeSchedule({ repeat: 'weekdays', weekdays: [1, 3] }), // Mon, Wed
      }),
    ];
    expect(agendaForDay(vials, '2024-01-02', MONDAY)).toEqual([]); // Tuesday
  });
});

describe('agendaForMonth', () => {
  it('collects the entries per day', () => {
    const vials = [
      makeVial({ id: 'a', schedule: makeSchedule({ times: ['09:00', '21:00'] }) }),
      makeVial({ id: 'b', schedule: makeSchedule({ times: ['08:00'] }) }),
    ];
    const days = agendaForMonth(vials, 2024, 0, MONDAY); // January 2024
    // 2 weeks from Jan 1 → Jan 1..14, three doses a day.
    expect(days.get('2024-01-01')).toHaveLength(3);
    expect(days.get('2024-01-14')).toHaveLength(3);
    expect(days.has('2024-01-15')).toBe(false);
    expect(days.size).toBe(14);
  });
});

describe('upcomingDays', () => {
  it('drops today\'s doses that have already passed', () => {
    const vials = [
      makeVial({ id: 'a', schedule: makeSchedule({ times: ['09:00', '21:00'] }) }),
      makeVial({ id: 'b', schedule: makeSchedule({ times: ['08:00'] }) }),
    ];
    const days = upcomingDays(vials, MONDAY, '12:00', 2, MONDAY);
    expect(days[0].date).toBe('2024-01-01');
    expect(days[0].entries.map((entry) => entry.time)).toEqual(['21:00']);
    expect(days[1].date).toBe('2024-01-02');
    expect(days[1].entries).toHaveLength(3);
  });

  it('returns nothing when there are no plans', () => {
    expect(upcomingDays([], MONDAY, '08:00', 3, MONDAY)).toEqual([]);
  });

  it('returns nothing for a non-positive count', () => {
    expect(upcomingDays([makeVial()], MONDAY, '08:00', 0, MONDAY)).toEqual([]);
  });
});
