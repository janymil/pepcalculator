import { describe, expect, it } from 'vitest';
import {
  DURATION_PRESETS,
  countDoseDays,
  doseDaysInMonth,
  durationPresetId,
  elapsedDoses,
  isDoseDay,
  isPlanFinished,
  nextDose,
  normalizeTimes,
  planEndDate,
  timesOnDay,
  timesPerDay,
  totalPlannedDoses,
  vialsNeeded,
  type VialSchedule,
} from './schedule';

// 2024-01-01 is a Monday — handy for weekday-pattern tests.
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

describe('normalizeTimes / timesPerDay', () => {
  it('sorts, pads and de-duplicates times', () => {
    expect(normalizeTimes(['20:00', '8:00', '08:00'])).toEqual(['08:00', '20:00']);
  });

  it('drops invalid entries', () => {
    expect(normalizeTimes(['09:00', '', 'abc', '25'])).toEqual(['09:00']);
  });

  it('reports how many doses a day', () => {
    expect(timesPerDay(makeSchedule({ times: ['08:00', '20:00'] }))).toBe(2);
    expect(timesPerDay(makeSchedule({ times: [] }))).toBe(0);
  });
});

describe('planEndDate', () => {
  it('covers whole weeks inclusively', () => {
    // 4 weeks from 10 Oct 2026 = 28 days, so the last day is 6 Nov 2026.
    const schedule = makeSchedule({
      startsOn: '2026-10-10',
      durationValue: 4,
      durationUnit: 'weeks',
    });
    expect(planEndDate(schedule)).toBe('2026-11-06');
  });

  it('covers whole months inclusively', () => {
    const schedule = makeSchedule({
      startsOn: '2026-10-10',
      durationValue: 3,
      durationUnit: 'months',
    });
    expect(planEndDate(schedule)).toBe('2027-01-09');
  });

  it('returns null for an ongoing plan', () => {
    expect(planEndDate(makeSchedule({ durationUnit: 'ongoing', durationValue: 0 }))).toBeNull();
  });
});

describe('isDoseDay', () => {
  it('covers every day inside the window for a daily plan', () => {
    const schedule = makeSchedule({
      startsOn: '2026-10-10',
      durationValue: 1,
      durationUnit: 'weeks',
    });

    expect(isDoseDay(schedule, '2026-10-09')).toBe(false);
    expect(isDoseDay(schedule, '2026-10-10')).toBe(true);
    expect(isDoseDay(schedule, '2026-10-16')).toBe(true);
    expect(isDoseDay(schedule, '2026-10-17')).toBe(false);
  });

  it('honours the chosen weekdays', () => {
    // Mon / Wed / Fri for two weeks.
    const schedule = makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] });

    expect(isDoseDay(schedule, '2024-01-01')).toBe(true); // Mon
    expect(isDoseDay(schedule, '2024-01-02')).toBe(false); // Tue
    expect(isDoseDay(schedule, '2024-01-03')).toBe(true); // Wed
    expect(isDoseDay(schedule, '2024-01-06')).toBe(false); // Sat
  });

  it('never schedules anything when no weekday is selected', () => {
    const schedule = makeSchedule({ repeat: 'weekdays', weekdays: [] });
    expect(isDoseDay(schedule, MONDAY)).toBe(false);
  });

  it('lists the times for a dose day', () => {
    const schedule = makeSchedule({ times: ['20:00', '08:00'] });
    expect(timesOnDay(schedule, MONDAY)).toEqual(['08:00', '20:00']);
    expect(timesOnDay(schedule, '2023-12-31')).toEqual([]);
  });
});

describe('countDoseDays / totalPlannedDoses', () => {
  it('counts active days', () => {
    const schedule = makeSchedule(); // daily, 2 weeks from Mon
    expect(countDoseDays(schedule, MONDAY, '2024-01-14')).toBe(14);
  });

  it('counts only the chosen weekdays', () => {
    const schedule = makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] });
    expect(countDoseDays(schedule, MONDAY, '2024-01-14')).toBe(6);
  });

  it('multiplies by doses per day', () => {
    expect(totalPlannedDoses(makeSchedule())).toBe(14);
    expect(totalPlannedDoses(makeSchedule({ times: ['08:00', '20:00'] }))).toBe(28);
    expect(totalPlannedDoses(makeSchedule({ times: ['08:00', '14:00', '20:00'] }))).toBe(42);
  });

  it('is null for an ongoing plan', () => {
    expect(totalPlannedDoses(makeSchedule({ durationUnit: 'ongoing' }))).toBeNull();
  });
});

describe('elapsedDoses (this is what replaces manual logging)', () => {
  it('is zero before the plan starts', () => {
    expect(elapsedDoses(makeSchedule(), '2023-12-31', '23:59')).toBe(0);
  });

  it('counts nothing before the first time of the day', () => {
    expect(elapsedDoses(makeSchedule(), MONDAY, '08:00')).toBe(0);
  });

  it('counts a dose once its time has passed', () => {
    expect(elapsedDoses(makeSchedule(), MONDAY, '10:00')).toBe(1);
  });

  it('accumulates completed days', () => {
    // Day 3 of the plan, well after 09:00 -> 2 full days + today's dose.
    expect(elapsedDoses(makeSchedule(), '2024-01-03', '12:00')).toBe(3);
  });

  it('handles two doses a day', () => {
    const schedule = makeSchedule({ times: ['08:00', '20:00'] });

    expect(elapsedDoses(schedule, MONDAY, '10:00')).toBe(1);
    expect(elapsedDoses(schedule, MONDAY, '21:00')).toBe(2);
    expect(elapsedDoses(schedule, '2024-01-02', '07:00')).toBe(2);
  });

  it('ignores days that are not dose days', () => {
    const schedule = makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] });

    // 2024-01-02 is a Tuesday: only Monday has produced a dose so far.
    expect(elapsedDoses(schedule, '2024-01-02', '23:00')).toBe(1);
  });
});

describe('nextDose', () => {
  it("returns today's dose when its time has not passed yet", () => {
    expect(nextDose(makeSchedule(), MONDAY, '08:00')).toEqual({ date: MONDAY, time: '09:00' });
  });

  it('still returns the current dose at its exact time', () => {
    expect(nextDose(makeSchedule(), MONDAY, '09:00')).toEqual({ date: MONDAY, time: '09:00' });
  });

  it('rolls over to the next day afterwards', () => {
    expect(nextDose(makeSchedule(), MONDAY, '10:00')).toEqual({
      date: '2024-01-02',
      time: '09:00',
    });
  });

  it('picks the later slot when there are two doses a day', () => {
    const schedule = makeSchedule({ times: ['08:00', '20:00'] });
    expect(nextDose(schedule, MONDAY, '10:00')).toEqual({ date: MONDAY, time: '20:00' });
  });

  it('starts at the plan start when now is earlier', () => {
    const schedule = makeSchedule({ startsOn: '2026-10-10' });
    expect(nextDose(schedule, '2026-10-01', '09:00')).toEqual({
      date: '2026-10-10',
      time: '09:00',
    });
  });

  it('returns null once the plan has ended', () => {
    const schedule = makeSchedule({
      startsOn: '2026-10-10',
      durationValue: 4,
      durationUnit: 'weeks',
    });
    expect(nextDose(schedule, '2027-01-01', '09:00')).toBeNull();
  });

  it('returns null when no times are set', () => {
    expect(nextDose(makeSchedule({ times: [] }), MONDAY, '09:00')).toBeNull();
  });
});

describe('isPlanFinished', () => {
  it('stays false until the last day has passed', () => {
    const schedule = makeSchedule({
      startsOn: '2026-10-10',
      durationValue: 4,
      durationUnit: 'weeks',
    });
    expect(isPlanFinished(schedule, '2026-11-06')).toBe(false);
    expect(isPlanFinished(schedule, '2026-11-07')).toBe(true);
  });

  it('is never finished while ongoing', () => {
    expect(isPlanFinished(makeSchedule({ durationUnit: 'ongoing' }), '2099-01-01')).toBe(false);
  });
});

describe('doseDaysInMonth', () => {
  it('returns the dose days of the month', () => {
    const schedule = makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] });
    expect([...doseDaysInMonth(schedule, 2024, 0)].sort()).toEqual([
      '2024-01-01',
      '2024-01-03',
      '2024-01-05',
      '2024-01-08',
      '2024-01-10',
      '2024-01-12',
    ]);
  });

  it('returns nothing for a month outside the plan', () => {
    const schedule = makeSchedule({
      startsOn: '2026-10-10',
      durationValue: 4,
      durationUnit: 'weeks',
    });
    expect(doseDaysInMonth(schedule, 2027, 5).size).toBe(0);
  });
});

describe('durationPresetId', () => {
  it('matches the stored duration back to a preset', () => {
    expect(durationPresetId(makeSchedule({ durationValue: 12, durationUnit: 'weeks' }))).toBe('12w');
    expect(durationPresetId(makeSchedule({ durationValue: 3, durationUnit: 'months' }))).toBe('3m');
    expect(durationPresetId(makeSchedule({ durationUnit: 'ongoing', durationValue: 0 }))).toBe(
      'ongoing',
    );
  });

  it('exposes the presets the UI offers', () => {
    expect(DURATION_PRESETS.map((preset) => preset.id)).toEqual([
      '4w',
      '8w',
      '12w',
      '3m',
      '4m',
      'ongoing',
    ]);
  });
});

describe('vialsNeeded', () => {
  it('rounds up to whole vials', () => {
    expect(vialsNeeded(60, 20)).toBe(3);
    expect(vialsNeeded(20, 20)).toBe(1);
    expect(vialsNeeded(21, 20)).toBe(2);
  });

  it('never suggests less than one vial', () => {
    expect(vialsNeeded(0, 20)).toBe(1);
    expect(vialsNeeded(10, 0)).toBe(1);
  });
});
