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
  /**
   * A step-up (titration) protocol: the dose changes as the plan goes on, which
   * is how GLP-1s are actually started. Absent — or a single entry — means the
   * vial's own `doseAmount` applies throughout. See `phaseDoseOn`.
   */
  phases?: DosePhase[];
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

/**
 * One step of a step-up protocol.
 *
 * The dose is held for `days`, then the next step begins. A final step with
 * `days <= 0` runs until the plan ends, which is how "stay on this dose" is
 * expressed without inventing an end date.
 */
export interface DosePhase {
  /** How long this step lasts. `0` (or less) means "until the plan ends". */
  days: number;
  /** Dose per injection during the step, in the vial's own dose unit. */
  doseAmount: number;
}

/** Longest titration we will accept, so a bad payload cannot build a huge plan. */
export const MAX_PHASES = 12;

/** Steps that describe a real titration: at least two, all usable. */
export function validPhases(schedule: VialSchedule): DosePhase[] {
  const phases = (schedule.phases ?? []).slice(0, MAX_PHASES);
  const usable = phases.filter(
    (phase) => Number.isFinite(phase.days) && isFiniteDose(phase.doseAmount),
  );
  return usable.length >= 2 ? usable : [];
}

function isFiniteDose(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** True when this plan steps its dose up (or down) over time. */
export function isTitration(schedule: VialSchedule): boolean {
  return validPhases(schedule).length >= 2;
}

/**
 * Which step is in force on `iso` (0-based), or null when the plan is not a
 * titration. Dates before the plan starts, and dates after the last step, are
 * clamped rather than treated as errors.
 */
export function phaseIndexOn(schedule: VialSchedule, iso: string): number | null {
  const phases = validPhases(schedule);
  if (phases.length === 0) return null;

  const offset = daysBetween(schedule.startsOn, iso);
  if (offset <= 0) return 0;

  let cursor = 0;
  for (let index = 0; index < phases.length; index += 1) {
    const span = Math.round(phases[index].days);
    // An open-ended step swallows everything from here on.
    if (span <= 0) return index;
    cursor += span;
    if (offset < cursor) return index;
  }
  return phases.length - 1;
}

/** The step in force on `iso`, or null when the plan is not a titration. */
export function phaseOn(schedule: VialSchedule, iso: string): DosePhase | null {
  const index = phaseIndexOn(schedule, iso);
  return index === null ? null : validPhases(schedule)[index];
}

/**
 * The dose to use on `iso`, when the plan steps up. Returns null for a plan that
 * does not, so callers fall back to the vial's own dose.
 */
export function phaseDoseOn(schedule: VialSchedule, iso: string): number | null {
  return phaseOn(schedule, iso)?.doseAmount ?? null;
}

/** Total length of a titration in days, or null when the plan is not one. */
export function titrationDays(schedule: VialSchedule): number | null {
  const phases = validPhases(schedule);
  if (phases.length === 0) return null;
  return phases.reduce((total, phase) => total + Math.max(0, Math.round(phase.days)), 0);
}

/** One step of a titration, as the dates it actually covers. */
export interface PhaseWindow {
  start: string;
  /** null when the step runs on past the plan's end (an open-ended final step). */
  end: string | null;
  phase: DosePhase;
}

/**
 * Every step with its dates, which is what the vial card and the printed sheet
 * show. The last step always runs to the end of the plan, matching
 * `phaseIndexOn`.
 */
export function phaseWindows(schedule: VialSchedule): PhaseWindow[] {
  const phases = validPhases(schedule);
  if (phases.length === 0) return [];

  const planEnd = planEndDate(schedule);
  const windows: PhaseWindow[] = [];
  let cursor = schedule.startsOn;

  for (let index = 0; index < phases.length; index += 1) {
    const last = index === phases.length - 1;
    const span = Math.round(phases[index].days);

    // The final step, or one that declares no length, swallows the rest.
    if (last || span <= 0) {
      windows.push({ start: cursor, end: planEnd, phase: phases[index] });
      break;
    }

    let windowEnd = addDays(cursor, span - 1);
    if (planEnd !== null && windowEnd > planEnd) windowEnd = planEnd;
    windows.push({ start: cursor, end: windowEnd, phase: phases[index] });
    if (planEnd !== null && windowEnd >= planEnd) break;
    cursor = addDays(windowEnd, 1);
  }

  return windows;
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
