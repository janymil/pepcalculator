import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  intervalOf,
  isDoseDay,
  isPlanFinished,
  isValidRule,
  isValidTimeZone,
  nextDose,
  nextRunAt,
  normalizeTimes,
  offsetMinutesAt,
  planEndDate,
  sanitizeRule,
  timesOnDay,
  toIsoDate,
  weekdayOf,
  zonedNow,
  zonedTimeToUtc,
} from './recurrence.mjs';

// The TypeScript original, imported across the boundary on purpose. The last
// describe block exists to prove the two implementations agree, and importing
// it here is the whole mechanism.
import {
  isDoseDay as tsIsDoseDay,
  nextDose as tsNextDose,
  planEndDate as tsPlanEndDate,
} from '../src/lib/schedule.ts';
import * as tsDates from '../src/lib/dates.ts';

/** A schedule in the shape both implementations accept. */
function makeSchedule(overrides = {}) {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    intervalDays: 0,
    startsOn: '2026-01-05',
    durationValue: 0,
    durationUnit: 'ongoing',
    ...overrides,
  };
}

describe('date helpers', () => {
  it('round-trips a Date through yyyy-mm-dd', () => {
    expect(toIsoDate(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 31, 12, 0, 0))).toBe('2026-12-31');
  });

  it('adds days across a month and a year boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-01-05', -5)).toBe('2025-12-31');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-01-05', '2026-01-08')).toBe(3);
    expect(daysBetween('2026-01-08', '2026-01-05')).toBe(-3);
    expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0);
  });

  it('names the weekday of a date', () => {
    // 2026-01-05 is a Monday.
    expect(weekdayOf('2026-01-05')).toBe(1);
    expect(weekdayOf('2026-01-11')).toBe(0);
  });
});

describe('the schedule rules', () => {
  it('normalises times: pads, de-duplicates, sorts, refuses nonsense', () => {
    expect(normalizeTimes(['8:00', '08:00', '20:00', 'nope', '7:30'])).toEqual([
      '07:30',
      '08:00',
      '20:00',
    ]);
  });

  it('caps times at four a day', () => {
    expect(normalizeTimes(['01:00', '02:00', '03:00', '04:00', '05:00'])).toHaveLength(4);
  });

  it('reads an interval, and refuses one out of range', () => {
    expect(intervalOf(makeSchedule({ intervalDays: 3 }))).toBe(3);
    expect(intervalOf(makeSchedule({ intervalDays: 31 }))).toBe(0);
    expect(intervalOf(makeSchedule({ intervalDays: 0 }))).toBe(0);
  });

  it('has no end date for an ongoing plan', () => {
    expect(planEndDate(makeSchedule())).toBeNull();
    expect(planEndDate(makeSchedule({ durationUnit: 'ongoing', durationValue: 0 }))).toBeNull();
  });

  it('ends a weeks plan on the last day of the last week', () => {
    // Four weeks from Monday 2026-01-05 ends on Sunday 2026-02-01.
    expect(planEndDate(makeSchedule({ durationValue: 4, durationUnit: 'weeks' }))).toBe(
      '2026-02-01',
    );
  });

  it('ends a months plan the day before the same date next month', () => {
    expect(planEndDate(makeSchedule({ durationValue: 1, durationUnit: 'months' }))).toBe(
      '2026-02-04',
    );
  });

  it('never finishes an ongoing plan, however far ahead you look', () => {
    expect(isPlanFinished(makeSchedule(), '2099-01-01')).toBe(false);
    expect(
      isPlanFinished(makeSchedule({ durationValue: 4, durationUnit: 'weeks' }), '2026-02-02'),
    ).toBe(true);
  });

  it('does not schedule a dose before the plan starts, or after it ends', () => {
    const plan = makeSchedule({ durationValue: 1, durationUnit: 'weeks' });
    expect(isDoseDay(plan, '2026-01-04')).toBe(false);
    expect(isDoseDay(plan, '2026-01-05')).toBe(true);
    // One week from Monday 5 January ends on Sunday the 11th.
    expect(isDoseDay(plan, '2026-01-11')).toBe(true);
    expect(isDoseDay(plan, '2026-01-12')).toBe(false);
  });

  it('honours the named weekdays, and refuses a plan that names none', () => {
    const plan = makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] });
    expect(isDoseDay(plan, '2026-01-05')).toBe(true); // Monday
    expect(isDoseDay(plan, '2026-01-06')).toBe(false); // Tuesday
    expect(isDoseDay(plan, '2026-01-07')).toBe(true); // Wednesday
    expect(isDoseDay(makeSchedule({ repeat: 'weekdays', weekdays: [] }), '2026-01-05')).toBe(false);
  });

  it('counts an interval from the start date, and treats 0 or 1 as every day', () => {
    const eod = makeSchedule({ repeat: 'interval', intervalDays: 2 });
    expect(isDoseDay(eod, '2026-01-05')).toBe(true);
    expect(isDoseDay(eod, '2026-01-06')).toBe(false);
    expect(isDoseDay(eod, '2026-01-07')).toBe(true);
    expect(isDoseDay(makeSchedule({ repeat: 'interval', intervalDays: 1 }), '2026-01-06')).toBe(
      true,
    );
  });

  it('finds the next dose, and keeps the ones left later today', () => {
    const plan = makeSchedule({ times: ['08:00', '20:00'] });
    expect(nextDose(plan, '2026-01-05', '07:00')).toEqual({ date: '2026-01-05', time: '08:00' });
    expect(nextDose(plan, '2026-01-05', '09:00')).toEqual({ date: '2026-01-05', time: '20:00' });
    expect(nextDose(plan, '2026-01-05', '21:00')).toEqual({ date: '2026-01-06', time: '08:00' });
  });

  it('treats a dose due exactly now as still due', () => {
    // The app is inclusive here, so the server must be too: a reminder computed
    // at precisely the dose minute has a dose to send.
    const plan = makeSchedule({ times: ['08:00'] });
    expect(nextDose(plan, '2026-01-05', '08:00')).toEqual({ date: '2026-01-05', time: '08:00' });
  });

  it('skips forward to the start date when the plan has not begun', () => {
    const plan = makeSchedule({ startsOn: '2026-03-01', times: ['08:00'] });
    expect(nextDose(plan, '2026-01-05', '09:00')).toEqual({ date: '2026-03-01', time: '08:00' });
  });

  it('has no next dose once the plan has run out', () => {
    const week = makeSchedule({ durationValue: 1, durationUnit: 'weeks', times: ['08:00'] });
    expect(nextDose(week, '2026-01-11', '07:00')).toEqual({ date: '2026-01-11', time: '08:00' });
    expect(nextDose(week, '2026-01-11', '09:00')).toBeNull();
    expect(nextDose(week, '2026-02-01', '07:00')).toBeNull();
  });

  it('has no next dose when no time is set', () => {
    expect(nextDose(makeSchedule({ times: [] }), '2026-01-05', '09:00')).toBeNull();
  });

  it("lists a day's times only on a dose day", () => {
    const eod = makeSchedule({ repeat: 'interval', intervalDays: 2, times: ['08:00', '20:00'] });
    expect(timesOnDay(eod, '2026-01-05')).toEqual(['08:00', '20:00']);
    expect(timesOnDay(eod, '2026-01-06')).toEqual([]);
  });
});

describe('validating a rule that arrived over the wire', () => {
  it('accepts a well-formed rule', () => {
    expect(isValidRule(makeSchedule())).toBe(true);
    expect(isValidRule(makeSchedule({ repeat: 'weekdays', weekdays: [1, 3] }))).toBe(true);
    expect(isValidRule(makeSchedule({ repeat: 'interval', intervalDays: 7 }))).toBe(true);
  });

  it('refuses a rule it cannot schedule from', () => {
    expect(isValidRule(null)).toBe(false);
    expect(isValidRule('daily')).toBe(false);
    expect(isValidRule(makeSchedule({ startsOn: '05/01/2026' }))).toBe(false);
    expect(isValidRule(makeSchedule({ repeat: 'hourly' }))).toBe(false);
    expect(isValidRule(makeSchedule({ durationUnit: 'days' }))).toBe(false);
    expect(isValidRule(makeSchedule({ durationValue: Number.NaN }))).toBe(false);
    expect(isValidRule(makeSchedule({ times: [] }))).toBe(false);
    expect(isValidRule(makeSchedule({ times: ['soon'] }))).toBe(false);
    expect(isValidRule(makeSchedule({ repeat: 'interval', intervalDays: 60 }))).toBe(false);
    expect(isValidRule(makeSchedule({ repeat: 'weekdays', weekdays: [] }))).toBe(false);
  });

  it('refuses a plan longer than ten years, so nothing runs away', () => {
    expect(isValidRule(makeSchedule({ durationValue: 521, durationUnit: 'weeks' }))).toBe(false);
    expect(isValidRule(makeSchedule({ durationValue: 520, durationUnit: 'weeks' }))).toBe(true);
  });

  it('drops every field the scheduler does not need', () => {
    const clean = sanitizeRule({
      ...makeSchedule({ times: ['8:00', '20:00'] }),
      admin: true,
      phone: '+421900000000',
      nonsense: { nested: 1 },
    });
    expect(clean).toEqual({
      times: ['08:00', '20:00'],
      repeat: 'daily',
      weekdays: [],
      intervalDays: 0,
      startsOn: '2026-01-05',
      durationValue: 0,
      durationUnit: 'ongoing',
    });
  });

  it('keeps weekdays only on a weekday plan, and sorts them', () => {
    expect(sanitizeRule(makeSchedule({ repeat: 'weekdays', weekdays: [5, 1, 1] }))?.weekdays).toEqual(
      [1, 5],
    );
    expect(sanitizeRule(makeSchedule({ weekdays: [1, 2] }))?.weekdays).toEqual([]);
  });

  it('answers null for a rule it would not have accepted', () => {
    expect(sanitizeRule(makeSchedule({ times: [] }))).toBeNull();
  });
});

describe('the user\'s timezone', () => {
  it('accepts a real zone and refuses a made-up one', () => {
    expect(isValidTimeZone('Europe/Bratislava')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });

  it('reads the offset in force at an instant, winter and summer', () => {
    // Bratislava is UTC+1 in January and UTC+2 in July.
    expect(offsetMinutesAt(Date.UTC(2026, 0, 15, 12), 'Europe/Bratislava')).toBe(60);
    expect(offsetMinutesAt(Date.UTC(2026, 6, 15, 12), 'Europe/Bratislava')).toBe(120);
  });

  it('turns a wall clock into the right absolute instant', () => {
    expect(zonedTimeToUtc('2026-01-15', '08:00', 'Europe/Bratislava')).toBe(
      Date.UTC(2026, 0, 15, 7, 0, 0),
    );
    expect(zonedTimeToUtc('2026-07-15', '08:00', 'Europe/Bratislava')).toBe(
      Date.UTC(2026, 6, 15, 6, 0, 0),
    );
    expect(zonedTimeToUtc('2026-01-15', '08:00', 'UTC')).toBe(Date.UTC(2026, 0, 15, 8, 0, 0));
  });

  it('reads the wall clock back out of an instant', () => {
    expect(zonedNow(Date.UTC(2026, 0, 15, 7, 30), 'Europe/Bratislava')).toEqual({
      iso: '2026-01-15',
      time: '08:30',
    });
  });

  it('renders midnight as 00, never 24', () => {
    expect(zonedNow(Date.UTC(2026, 0, 15, 0, 5), 'UTC').time).toBe('00:05');
  });
});

describe('the next run, as an absolute instant', () => {
  it('finds today\'s dose when it is still ahead', () => {
    const plan = makeSchedule({ times: ['08:00'] });
    // 07:00 in Bratislava on 15 January.
    const now = Date.UTC(2026, 0, 15, 6, 0, 0);
    expect(nextRunAt(plan, now, 'Europe/Bratislava')).toBe(Date.UTC(2026, 0, 15, 7, 0, 0));
  });

  it('moves to tomorrow once today\'s time has passed', () => {
    const plan = makeSchedule({ times: ['08:00'] });
    // 09:00 in Bratislava.
    const now = Date.UTC(2026, 0, 15, 8, 0, 0);
    expect(nextRunAt(plan, now, 'Europe/Bratislava')).toBe(Date.UTC(2026, 0, 16, 7, 0, 0));
  });

  it('never hands back the dose it was just asked about', () => {
    // This is the guard that stops a send loop: the scheduler asks "strictly
    // after the dose I delivered", so the same instant can never come back.
    const plan = makeSchedule({ times: ['08:00'] });
    const delivered = Date.UTC(2026, 0, 15, 7, 0, 0);
    expect(nextRunAt(plan, delivered, 'Europe/Bratislava')).toBe(Date.UTC(2026, 0, 16, 7, 0, 0));
  });

  it('always returns an instant in the future', () => {
    const plan = makeSchedule({ times: ['08:00', '20:00'] });
    // Every minute across a day must still produce a future instant.
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      const now = Date.UTC(2026, 0, 15, 0, minute, 0);
      const at = nextRunAt(plan, now, 'Europe/Bratislava');
      expect(at).toBeGreaterThan(now);
    }
  });

  it('keeps the same wall-clock time across a DST change', () => {
    const plan = makeSchedule({ times: ['08:00'] });
    // Bratislava moves to UTC+2 on 29 March 2026. A dose set for 08:00 must stay
    // at 08:00 local, which is a different instant either side of the change.
    expect(nextRunAt(plan, Date.UTC(2026, 2, 27, 0, 0, 0), 'Europe/Bratislava')).toBe(
      Date.UTC(2026, 2, 27, 7, 0, 0),
    );
    expect(nextRunAt(plan, Date.UTC(2026, 2, 30, 0, 0, 0), 'Europe/Bratislava')).toBe(
      Date.UTC(2026, 2, 30, 6, 0, 0),
    );
  });

  it('runs forever on an ongoing plan', () => {
    const plan = makeSchedule({ times: ['08:00'] });
    // Far past any horizon the push queue ever had: still a real answer.
    const far = Date.UTC(2031, 5, 1, 0, 0, 0);
    expect(nextRunAt(plan, far, 'Europe/Bratislava')).toBe(Date.UTC(2031, 5, 1, 6, 0, 0));
  });

  it('answers null once a finished plan has no dose left', () => {
    const plan = makeSchedule({ durationValue: 1, durationUnit: 'weeks', times: ['08:00'] });
    const after = Date.UTC(2026, 1, 10, 12, 0, 0);
    expect(nextRunAt(plan, after, 'Europe/Bratislava')).toBeNull();
  });

  it('answers null rather than guessing when the zone is unusable', () => {
    expect(nextRunAt(makeSchedule(), Date.UTC(2026, 0, 15), 'Mars/Olympus')).toBeNull();
  });
});

describe('the agreement with the TypeScript original', () => {
  const schedules = [
    makeSchedule(),
    makeSchedule({ times: ['08:00', '20:00'] }),
    makeSchedule({ times: ['06:30', '12:00', '18:00', '22:00'] }),
    makeSchedule({ repeat: 'weekdays', weekdays: [1, 3, 5] }),
    makeSchedule({ repeat: 'weekdays', weekdays: [0, 6] }),
    makeSchedule({ repeat: 'interval', intervalDays: 2 }),
    makeSchedule({ repeat: 'interval', intervalDays: 3 }),
    makeSchedule({ repeat: 'interval', intervalDays: 7 }),
    makeSchedule({ durationValue: 4, durationUnit: 'weeks' }),
    makeSchedule({ durationValue: 3, durationUnit: 'months' }),
    makeSchedule({
      startsOn: '2026-06-15',
      durationValue: 8,
      durationUnit: 'weeks',
      times: ['08:00', '20:00'],
    }),
    makeSchedule({
      repeat: 'interval',
      intervalDays: 2,
      durationValue: 12,
      durationUnit: 'weeks',
      times: ['07:15'],
    }),
  ];

  /** Dates spanning well before and long past each plan's own end. */
  const dates = [];
  for (let offset = -10; offset < 200; offset += 1) dates.push(addDays('2026-01-05', offset));
  const times = ['00:00', '07:00', '08:00', '08:01', '19:59', '23:59'];

  it('agrees on when the next dose is, for every cadence and moment', () => {
    let compared = 0;
    for (const schedule of schedules) {
      for (const date of dates) {
        for (const time of times) {
          expect(
            nextDose(schedule, date, time),
            `${schedule.repeat}/${schedule.intervalDays} ${schedule.times.join('+')} at ${date} ${time}`,
          ).toEqual(tsNextDose(schedule, date, time));
          compared += 1;
        }
      }
    }
    expect(compared).toBe(schedules.length * dates.length * times.length);
  });

  it('agrees on which days are dose days', () => {
    for (const schedule of schedules) {
      for (const date of dates) {
        expect(isDoseDay(schedule, date)).toBe(tsIsDoseDay(schedule, date));
      }
    }
  });

  it('agrees on when a plan ends', () => {
    for (const schedule of schedules) {
      expect(planEndDate(schedule)).toBe(tsPlanEndDate(schedule));
    }
  });

  it('agrees on the date arithmetic underneath', () => {
    for (const date of dates) {
      expect(addDays(date, 11)).toBe(tsDates.addDays(date, 11));
      expect(addDays(date, -3)).toBe(tsDates.addDays(date, -3));
      expect(daysBetween('2026-01-05', date)).toBe(tsDates.daysBetween('2026-01-05', date));
      expect(weekdayOf(date)).toBe(tsDates.weekdayOf(date));
      expect(toIsoDate(new Date(2026, 0, 5, 12))).toBe(tsDates.toIsoDate(new Date(2026, 0, 5, 12)));
    }
  });
});



