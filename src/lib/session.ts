/**
 * A dosing **session**: every dose that falls on the same date at the same time.
 *
 * The app has always drawn one dose at a time, but a real stack often means two
 * compounds at one sitting — a peptide and an oil, or two peptides taken
 * together. Nothing here changes what is drawn; it names the group, so the Today
 * card and the arm's-length check card can show the whole sitting instead of one
 * line of it. That is the difference between "draw 10 units" and "draw 10 units
 * *and* 0.25 mL, then use two sites".
 *
 * Pure, like every module under `src/lib`: the clock is always passed in.
 */

import { addDays } from './dates';
import { dosesOnDate, type TodayDose } from './today';
import type { KindFilter, SavedVial } from './vials';

export interface DoseSession {
  /** `yyyy-mm-dd` the sitting falls on. */
  date: string;
  /** `HH:mm` it happens at. */
  time: string;
  /** The first dose of the sitting — what the app already called "next". */
  dose: TodayDose;
  /** Everything in it, `dose` first, then the rest in saved order. */
  items: TodayDose[];
  /** True when more than one vial has to be drawn. */
  combined: boolean;
}

/**
 * Groups doses that share a date and a time.
 *
 * A vial cannot appear twice in one group: a vial's own times are distinct
 * slots, and two entries for one bottle would read as "draw it twice".
 */
export function groupSessions(doses: TodayDose[]): DoseSession[] {
  const byKey = new Map<string, DoseSession>();

  for (const dose of doses) {
    const key = `${dose.date} ${dose.time}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { date: dose.date, time: dose.time, dose, items: [dose], combined: false });
      continue;
    }
    if (existing.items.some((item) => item.vialId === dose.vialId)) continue;

    existing.items.push(dose);
    existing.combined = true;
  }

  return [...byKey.values()].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
  );
}

/** Every sitting on `date`, chronological. */
export function sessionsOnDate(
  vials: SavedVial[],
  date: string,
  nowIso: string,
  nowTime: string,
  filter: KindFilter = 'all',
): DoseSession[] {
  return groupSessions(dosesOnDate(vials, date, nowIso, nowTime, filter));
}

/**
 * The soonest sitting that still has something to draw, today or within the
 * horizon. Every dose in a session shares its time, so they are all due together
 * — the first one decides whether the sitting has happened.
 */
export function nextSession(
  vials: SavedVial[],
  todayIso: string,
  nowTime: string,
  horizonDays = 7,
  filter: KindFilter = 'all',
): DoseSession | null {
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(todayIso, offset);
    const sessions = sessionsOnDate(vials, date, todayIso, nowTime, filter);
    const upcoming = sessions.find((session) => !session.dose.taken);
    if (upcoming) return upcoming;
  }
  return null;
}
