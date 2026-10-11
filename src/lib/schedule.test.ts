import { describe, expect, it } from 'vitest';
import {
  DURATION_PRESETS,
  INTERVAL_PRESETS,
  countDoseDays,
  doseDaysInMonth,
  dosesPerWeek,
  durationPresetId,
  elapsedDoses,
  intervalOf,
  intervalPresetId,
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

describe('dosesPerWeek', () => {
  it('counts a daily protocol as seven', () => {
    expect(dosesPerWeek(makeSchedule())).toBe(7);
  });

  it('counts a twice-daily protocol as fourteen', () => {
    expect(dosesPerWeek(makeSchedule({ times: ['08:00', '20:00'] }))).toBe(14);
  });

  it('counts only the chosen weekdays', () => {
    const schedule = makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] });
    expect(dosesPerWeek(schedule)).toBe(3);
  });

  it('is zero when no times are set', () => {
    expect(dosesPerWeek(makeSchedule({ times: [] }))).toBe(0);
  });
});

describe('interval schedules (EOD, E3D, weekly)', () => {
  const everyOtherDay = makeSchedule({ repeat: 'interval', intervalDays: 2 });

  it('takes a dose every other day from the start date', () => {
    // MONDAY is the start, so doses fall on Monday, Wednesday, Friday…
    expect(isDoseDay(everyOtherDay, '2024-01-01')).toBe(true);
    expect(isDoseDay(everyOtherDay, '2024-01-02')).toBe(false);
    expect(isDoseDay(everyOtherDay, '2024-01-03')).toBe(true);
    expect(isDoseDay(everyOtherDay, '2024-01-05')).toBe(true);
  });

  it('still honours the plan window', () => {
    // A two-week plan from Monday ends on the Sunday of the second week.
    expect(isDoseDay(everyOtherDay, '2023-12-31')).toBe(false);
    expect(isDoseDay(everyOtherDay, '2024-01-15')).toBe(false);
  });

  it('counts the right number of doses and days', () => {
    // Two weeks of every other day: 7 dose days, one dose each.
    expect(totalPlannedDoses(everyOtherDay)).toBe(7);
  });

  it('averages the weekly rate instead of counting both window ends', () => {
    // Every other day is 3.5 a week; every third day is 7/3.
    expect(dosesPerWeek(everyOtherDay)).toBeCloseTo(3.5, 6);
    expect(dosesPerWeek(makeSchedule({ repeat: 'interval', intervalDays: 3 }))).toBeCloseTo(7 / 3, 6);
    expect(dosesPerWeek(makeSchedule({ repeat: 'interval', intervalDays: 7 }))).toBeCloseTo(1, 6);
    // Twice on a dose day doubles it.
    expect(
      dosesPerWeek(makeSchedule({ repeat: 'interval', intervalDays: 2, times: ['08:00', '20:00'] })),
    ).toBeCloseTo(7, 6);
  });

  it('adds up the doses already due', () => {
    expect(elapsedDoses(everyOtherDay, MONDAY, '23:00')).toBe(1);
    expect(elapsedDoses(everyOtherDay, '2024-01-03', '23:00')).toBe(2);
    expect(elapsedDoses(everyOtherDay, '2024-01-02', '23:00')).toBe(1);
  });

  it('points the next dose at the next interval day', () => {
    // On a non-dose day, the next dose is the following day.
    expect(nextDose(everyOtherDay, '2024-01-02', '09:00')).toEqual({
      date: '2024-01-03',
      time: '09:00',
    });
  });

  it('reads the preset back out of a schedule', () => {
    expect(INTERVAL_PRESETS.map((preset) => preset.days)).toEqual([2, 3, 4, 7, 14]);
    expect(intervalPresetId(makeSchedule({ repeat: 'interval', intervalDays: 2 }))).toBe('eod');
    expect(intervalPresetId(makeSchedule({ repeat: 'interval', intervalDays: 7 }))).toBe('weekly');
    expect(intervalPresetId(makeSchedule({ repeat: 'interval', intervalDays: 5 }))).toBeNull();
    expect(intervalOf(makeSchedule({ repeat: 'interval', intervalDays: 2 }))).toBe(2);
  });

  it('falls back to daily rather than hiding the plan when the gap is unusable', () => {
    const broken = makeSchedule({ repeat: 'interval', intervalDays: 0 });
    expect(intervalOf(broken)).toBe(0);
    expect(isDoseDay(broken, '2024-01-02')).toBe(true);

    const tooLong = makeSchedule({ repeat: 'interval', intervalDays: 999 });
    expect(intervalOf(tooLong)).toBe(0);
    expect(isDoseDay(tooLong, '2024-01-02')).toBe(true);
  });

  it('lets a twice-a-day interval plan still take both times', () => {
    const twice = makeSchedule({ repeat: 'interval', intervalDays: 3, times: ['08:00', '20:00'] });
    expect(isDoseDay(twice, '2024-01-01')).toBe(true);
    expect(timesOnDay(twice, '2024-01-01')).toEqual(['08:00', '20:00']);
    expect(timesOnDay(twice, '2024-01-02')).toEqual([]);
  });
});
