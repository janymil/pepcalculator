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

import { addDays, parseIsoDate, toIsoDate } from './dates';
import { nextDose, planEndDate, timesOnDay } from './schedule';
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

/* ---------- the push queue (reminders that arrive with the app closed) ---------- */

/** How far ahead the server queue is filled, and how many entries it may hold. */
export const PUSH_HORIZON_DAYS = 60;
export const MAX_PUSH_QUEUE = 300;

/**
 * One notification the push server should deliver: an absolute UTC instant plus
 * the text, already rendered in the user's language. The service worker shows it
 * verbatim, which is what keeps the worker language-free (see `public/sw.js`).
 */
export interface PushScheduleEntry {
  at: string;
  title: string;
  body: string;
  tag: string;
}

/**
 * Every dose still ahead of `now`, up to `PUSH_HORIZON_DAYS` away, as the queue
 * a push server should deliver.
 *
 * The instants are the plan's own clock times on the plan's own dose days — the
 * same `timesOnDay` the calendar uses — so a push can never disagree with the
 * app. The list is capped by horizon and count, so an "ongoing" plan cannot
 * build an unbounded payload.
 */
export function pushQueue(
  vials: SavedVial[],
  now: Date,
  title: string,
  body: (vialName: string, time: string) => string,
): PushScheduleEntry[] {
  const entries: PushScheduleEntry[] = [];
  const todayIso = toIsoDate(now);
  const horizonEnd = addDays(todayIso, PUSH_HORIZON_DAYS - 1);

  for (const vial of liveVials(vials)) {
    const schedule = vial.schedule;
    if (!schedule) continue;

    const planEnd = planEndDate(schedule);
    const last = planEnd !== null && planEnd < horizonEnd ? planEnd : horizonEnd;
    let cursor = todayIso < schedule.startsOn ? schedule.startsOn : todayIso;

    for (let day = 0; day <= PUSH_HORIZON_DAYS && cursor <= last; day += 1) {
      for (const time of timesOnDay(schedule, cursor)) {
        // Fires at the dose's own clock time; anything already past is skipped.
        const at = slotDate(cursor, time);
        if (at.getTime() <= now.getTime()) continue;
        entries.push({
          at: at.toISOString(),
          title,
          body: body(vial.name || '', time),
          tag: reminderKey({ vialId: vial.id, name: vial.name, date: cursor, time }),
        });
      }
      cursor = addDays(cursor, 1);
    }
  }

  entries.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return entries.slice(0, MAX_PUSH_QUEUE);
}
