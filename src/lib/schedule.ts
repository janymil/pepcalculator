/**
 * Dose-schedule logic for a saved vial.
 *
 * A schedule answers four questions the user actually has:
 *   1. how many times a day?  (`times`)
 *   2. every day, or only some days?  (`repeat` + `weekdays`)
 *   3. for how long?  (`durationValue` + `durationUnit`)
 *   4. when did it start?  (`startsOn`)
 *
 * From those, everything else is derived — no manual "I took a dose" logging.
 * Pure module: no React, no DOM, and `now` is always passed in, so all the
 * date maths is deterministic and unit-testable.
 */

import { addDays, addMonths, daysBetween, toIsoDate, weekdayOf } from './dates';

export type RepeatKind = 'daily' | 'weekdays' | 'interval';
export type DurationUnit = 'weeks' | 'months' | 'ongoing';

export interface VialSchedule {
  /** Times of day as `HH:mm`, e.g. `['08:00', '20:00']`. One entry per daily dose. */
  times: string[];
  repeat: RepeatKind;
  /** 0 = Sunday … 6 = Saturday. Only used when `repeat` is `'weekdays'`. */
  weekdays: number[];
  /**
   * Only used when `repeat` is `'interval'`: a dose every this many days, counted
   * from `startsOn`. `2` is every other day (EOD), `3` every third day, `7`
   * weekly. Absent on records saved before intervals existed.
   */
  intervalDays?: number;
  /** First day of the plan, `yyyy-mm-dd`. */
  startsOn: string;
  /** Duration amount; ignored when `durationUnit` is `'ongoing'`. */
  durationValue: number;
  durationUnit: DurationUnit;
}

export interface DoseSlot {
  date: string;
  time: string;
}

/** How far ahead we search for the next dose before giving up. */
export const SEARCH_HORIZON_DAYS = 400;

/** Safety cap so a very long plan can never freeze the UI. */
export const MAX_ENUMERATED_DAYS = 4000;

/** Default clock times for "n times a day". */
export const TIMES_PER_DAY_PRESETS: Record<number, string[]> = {
  1: ['09:00'],
  2: ['08:00', '20:00'],
  3: ['08:00', '14:00', '20:00'],
  4: ['08:00', '12:00', '16:00', '20:00'],
};

export const MAX_TIMES_PER_DAY = 4;

export type DurationPresetId = '4w' | '8w' | '12w' | '3m' | '4m' | 'ongoing';

export interface DurationPreset {
  id: DurationPresetId;
  value: number;
  unit: DurationUnit;
}

export const DURATION_PRESETS: readonly DurationPreset[] = [
  { id: '4w', value: 4, unit: 'weeks' },
  { id: '8w', value: 8, unit: 'weeks' },
  { id: '12w', value: 12, unit: 'weeks' },
  { id: '3m', value: 3, unit: 'months' },
  { id: '4m', value: 4, unit: 'months' },
  { id: 'ongoing', value: 0, unit: 'ongoing' },
];

/** Which duration preset a schedule currently matches. */
export function durationPresetId(schedule: VialSchedule): DurationPresetId {
  const found = DURATION_PRESETS.find(
    (preset) => preset.unit === schedule.durationUnit && preset.value === schedule.durationValue,
  );
  return found?.id ?? 'ongoing';
}

/** Valid, de-duplicated, ascending `HH:mm` times. */
export function normalizeTimes(times: string[]): string[] {
  const valid = times
    .map((time) => time.trim())
    .filter((time) => /^\d{1,2}:\d{2}$/.test(time))
    .map((time) => (time.length === 4 ? `0${time}` : time));
  return Array.from(new Set(valid)).sort();
}

/** How many doses are taken on an active day. */
export function timesPerDay(schedule: VialSchedule): number {
  return normalizeTimes(schedule.times).length;
}

/** Last day of the plan (inclusive), or null when the plan is ongoing. */
export function planEndDate(schedule: VialSchedule): string | null {
  if (schedule.durationUnit === 'ongoing' || schedule.durationValue <= 0) return null;
  if (schedule.durationUnit === 'weeks') {
    return addDays(schedule.startsOn, schedule.durationValue * 7 - 1);
  }
  return addDays(addMonths(schedule.startsOn, schedule.durationValue), -1);
}

/** Whether a dose is scheduled on the given date. */
export function isDoseDay(schedule: VialSchedule, iso: string): boolean {
  if (iso < schedule.startsOn) return false;
  const end = planEndDate(schedule);
  if (end !== null && iso > end) return false;

  if (schedule.repeat === 'weekdays') {
    if (schedule.weekdays.length === 0) return false;
    return schedule.weekdays.includes(weekdayOf(iso));
  }

  if (schedule.repeat === 'interval') {
    const step = intervalOf(schedule);
    // A broken or missing interval must never hide the whole plan, so anything
    // under two days simply means "every day".
    if (step < 2) return true;
    return daysBetween(schedule.startsOn, iso) % step === 0;
  }

  return true;
}

/** The times scheduled on a date (empty when it is not a dose day). */
export function timesOnDay(schedule: VialSchedule, iso: string): string[] {
  return isDoseDay(schedule, iso) ? normalizeTimes(schedule.times) : [];
}

/** Number of active (dose) days between two dates, inclusive. */
export function countDoseDays(schedule: VialSchedule, fromIso: string, toIso: string): number {
  if (toIso < fromIso) return 0;
  let count = 0;
  let cursor = fromIso;
  for (let i = 0; i < MAX_ENUMERATED_DAYS && cursor <= toIso; i += 1) {
    if (isDoseDay(schedule, cursor)) count += 1;
    cursor = addDays(cursor, 1);
  }
  return count;
}

/** Total number of doses in the whole plan (null when the plan is ongoing). */
export function totalPlannedDoses(schedule: VialSchedule): number | null {
  const end = planEndDate(schedule);
  if (end === null) return null;
  return countDoseDays(schedule, schedule.startsOn, end) * timesPerDay(schedule);
}

/**
 * How many doses the plan says should already have been taken by now.
 *
 * This is what replaces manual logging: we simply trust the schedule. No app
 * interaction is needed after an injection.
 */
export function elapsedDoses(schedule: VialSchedule, nowIso: string, nowTime: string): number {
  const perDay = timesPerDay(schedule);
  if (perDay === 0 || nowIso < schedule.startsOn) return 0;

  const completedDays = countDoseDays(schedule, schedule.startsOn, addDays(nowIso, -1));
  const times = normalizeTimes(schedule.times);
  const earlierToday = isDoseDay(schedule, nowIso)
    ? times.filter((time) => time < nowTime).length
    : 0;

  return completedDays * perDay + earlierToday;
}

/** The next scheduled dose at or after the given moment (null once the plan ends). */
export function nextDose(
  schedule: VialSchedule,
  nowIso: string,
  nowTime: string,
): DoseSlot | null {
  const times = normalizeTimes(schedule.times);
  if (times.length === 0) return null;

  const end = planEndDate(schedule);
  let cursor = nowIso < schedule.startsOn ? schedule.startsOn : nowIso;

  for (let i = 0; i < SEARCH_HORIZON_DAYS; i += 1) {
    if (end !== null && cursor > end) return null;

    if (isDoseDay(schedule, cursor)) {
      const isToday = cursor === nowIso;
      for (const time of times) {
        if (!isToday || time >= nowTime) return { date: cursor, time };
      }
    }

    cursor = addDays(cursor, 1);
  }

  return null;
}

/** True once the plan's last day has passed. */
export function isPlanFinished(schedule: VialSchedule, nowIso: string): boolean {
  const end = planEndDate(schedule);
  return end !== null && nowIso > end;
}

/**
 * Dose days of a month, as ISO strings — drives the calendar grid.
 * `month` is 0-based, like `Date#getMonth()`.
 */
export function doseDaysInMonth(schedule: VialSchedule, year: number, month: number): Set<string> {
  const days = new Set<string>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toIsoDate(new Date(year, month, day));
    if (isDoseDay(schedule, iso)) days.add(iso);
  }
  return days;
}

/** How many vials a whole plan needs, given how many doses one vial holds. */
export function vialsNeeded(plannedDoses: number, dosesPerVial: number): number {
  if (!Number.isFinite(dosesPerVial) || dosesPerVial <= 0) return 1;
  return Math.max(1, Math.ceil(plannedDoses / dosesPerVial));
}

/**
 * Average doses per week, used for the "cost per month" line and any other
 * per-week view, so a twice-a-week plan and a twice-a-day one are not confused.
 *
 * A seven-day window is exact for daily and weekday patterns (every weekday
 * appears once), but it would *over-count* an interval plan — the window
 * includes both endpoints — so intervals are averaged directly instead.
 */
export function dosesPerWeek(schedule: VialSchedule): number {
  const perDay = timesPerDay(schedule);
  if (perDay === 0) return 0;

  if (schedule.repeat === 'interval') {
    const step = intervalOf(schedule);
    // "Every N days" is exactly 7/N doses a week, times however many a day.
    if (step >= 2) return (7 / step) * perDay;
  }

  const activeDays = countDoseDays(schedule, schedule.startsOn, addDays(schedule.startsOn, 6));
  return activeDays * perDay;
}

/* ---------- interval schedules (EOD, E3D, weekly…) ---------- */

/** Longest gap an interval schedule may declare. */
export const MAX_INTERVAL_DAYS = 30;

/**
 * The interval in whole days, or 0 when the schedule's value is unusable. Kept
 * separate so `isDoseDay` and the UI agree on what counts as valid.
 */
export function intervalOf(schedule: VialSchedule): number {
  const days = Math.round(schedule.intervalDays ?? 0);
  return days >= 1 && days <= MAX_INTERVAL_DAYS ? days : 0;
}

export type IntervalPresetId = 'eod' | 'e3d' | 'e4d' | 'weekly' | 'biweekly';

export interface IntervalPreset {
  id: IntervalPresetId;
  days: number;
}

/** The gaps people actually use for peptides, TRT esters and vitamin shots. */
export const INTERVAL_PRESETS: readonly IntervalPreset[] = [
  { id: 'eod', days: 2 },
  { id: 'e3d', days: 3 },
  { id: 'e4d', days: 4 },
  { id: 'weekly', days: 7 },
  { id: 'biweekly', days: 14 },
];

/** Which interval preset a schedule currently matches, or null for a custom gap. */
export function intervalPresetId(schedule: VialSchedule): IntervalPresetId | null {
  const days = intervalOf(schedule);
  return INTERVAL_PRESETS.find((preset) => preset.days === days)?.id ?? null;
}
