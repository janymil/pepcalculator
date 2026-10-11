/**
 * Dose reminders.
 *
 * Pure module: no React, no DOM, no timers. It answers one question — "what is
 * the next scheduled dose across all my vials?" — from the same `VialSchedule`
 * maths the calendar uses, so a reminder can never disagree with the app.
 *
 * The calling hook turns a reminder into a `setTimeout`; keeping that wiring out
 * of here makes the interesting part (ordering, caps, "is it over?") testable.
 */

import { parseIsoDate } from './dates';
import { nextDose } from './schedule';
import { liveVials, type SavedVial } from './vials';

export interface UpcomingDose {
  vialId: string;
  name: string;
  /** `yyyy-mm-dd` of the dose. */
  date: string;
  /** `HH:mm` of the dose. */
  time: string;
}

/**
 * `setTimeout` treats delays as a 32-bit signed int: anything larger overflows
 * and fires immediately. Clamping to ~24.8 days keeps a far-off dose from
 * popping in the user's face.
 */
export const MAX_TIMER_MS = 2_147_483_647;

/** Chronological: date, then time, then vial name to keep the order stable. */
function bySoonest(a: UpcomingDose, b: UpcomingDose): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.time !== b.time) return a.time < b.time ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * The next scheduled dose for every live vial that has a plan, soonest first.
 * Vials with no schedule, and plans that have already ended, contribute nothing.
 */
export function upcomingDoses(vials: SavedVial[], nowIso: string, nowTime: string): UpcomingDose[] {
  const upcoming: UpcomingDose[] = [];
  for (const vial of liveVials(vials)) {
    if (!vial.schedule) continue;
    const slot = nextDose(vial.schedule, nowIso, nowTime);
    if (!slot) continue;
    upcoming.push({ vialId: vial.id, name: vial.name, date: slot.date, time: slot.time });
  }
  return upcoming.sort(bySoonest);
}

/** The `yyyy-mm-dd` / `HH:mm` pair as a local `Date` (seconds truncated). */
export function slotDate(date: string, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const at = parseIsoDate(date);
  at.setHours(hours || 0, minutes || 0, 0, 0);
  return at;
}

/** Milliseconds from `now` until the dose; negative once the time has passed. */
export function millisUntil(dose: UpcomingDose, now: Date): number {
  return slotDate(dose.date, dose.time).getTime() - now.getTime();
}

/** Delay for `setTimeout`, never negative and never overflowing 32 bits. */
export function timerDelay(dose: UpcomingDose, now: Date): number {
  return Math.max(0, Math.min(millisUntil(dose, now), MAX_TIMER_MS));
}

/** Stable identity for one dose — used as the notification tag so it replaces
 * (rather than stacks) if the same dose somehow fires twice. */
export function reminderKey(dose: UpcomingDose): string {
  return `dose:${dose.vialId}:${dose.date}:${dose.time}`;
}
