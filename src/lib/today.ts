/**
 * "What do I take today?" — the data behind the Today card on the Calculator
 * page and the global agenda.
 *
 * Like every other module under `src/lib`, this is pure: no React, no DOM, no
 * storage, and `nowIso` / `nowTime` are always passed in so the maths is
 * deterministic in tests. It reuses the exact same schedule helpers as the
 * calendar and reminders, so the three views can never disagree.
 */

import { toBase, unitsPerMlOf, type MeasureSystem } from './calc';
import { addDays } from './dates';
import { totalPlannedDoses, elapsedDoses, phaseDoseOn, timesOnDay } from './schedule';
import {
  kindMeasure,
  vialKind,
  vialStatus,
  type KindFilter,
  type SavedVial,
  type VialKind,
} from './vials';

/** One scheduled dose for a specific date. */
export interface TodayDose {
  vialId: string;
  /** Name as saved (may be blank — the UI falls back to an "untitled" label). */
  name: string;
  /** Which workflow the vial belongs to; this decides how the draw is read. */
  kind: VialKind;
  /** Exactly how the draw is read off the device (units, mL or pen clicks). */
  measure: MeasureSystem;
  /** `yyyy-mm-dd` the dose falls on. */
  date: string;
  /** `HH:mm` of the dose. */
  time: string;
  /** mL drawn for one dose. */
  volumeMl: number;
  /**
   * The number the user actually reads off their syringe: insulin units for
   * peptides, or mL for oils (where "units" would be meaningless).
   */
  drawValue: number;
  /** True when the shot is already due (i.e. its time has passed). */
  taken: boolean;
  /** The saved vial, so a card can offer "load into the calculator". */
  vial: SavedVial;
}

/** Only live vials of the requested kind. */
function keep(vials: SavedVial[], filter: KindFilter): SavedVial[] {
  if (filter === 'all') return vials;
  return vials.filter((vial) => vialKind(vial) === filter);
}

/**
 * Whether a particular `HH:mm` slot has already happened — but *only* for the
 * date being looked at, and only while the plan is still running. Everything
 * else counts as "still ahead".
 */
function slotIsTaken(
  vial: SavedVial,
  date: string,
  time: string,
  nowIso: string,
  nowTime: string,
): boolean {
  const schedule = vial.schedule;
  if (!schedule) return false;
  return date < nowIso || (date === nowIso && time < nowTime);
}

/** A single dose, with everything the card needs to render it. */
function toDose(
  vial: SavedVial,
  date: string,
  time: string,
  nowIso: string,
  nowTime: string,
): TodayDose {
  const status = vialStatus(vial, nowIso);
  const kind = vialKind(vial);
  const measure = kindMeasure(kind, vial.device);

  // The dose for *this* date: a step-up plan changes it as it goes, so the
  // schedule is asked rather than the vial's single stored dose.
  const phased = vial.schedule ? phaseDoseOn(vial.schedule, date) : null;
  const doseBase = toBase(phased ?? vial.doseAmount, vial.doseUnit);
  const volumeMl = status.concentrationPerMl > 0 ? doseBase / status.concentrationPerMl : 0;

  // A pen dials; a peptide is read in graduations; everything else in mL — for a
  // hormone, "units" would be confused with the IU printed on the vial.
  const drawValue =
    measure === 'volume'
      ? volumeMl
      : measure === 'clicks'
        ? volumeMl * (vial.clicksPerMl ?? 0)
        : volumeMl * unitsPerMlOf(vial.syringeType);

  return {
    vialId: vial.id,
    name: vial.name,
    kind,
    measure,
    date,
    time,
    volumeMl,
    drawValue,
    taken: slotIsTaken(vial, date, time, nowIso, nowTime),
    vial,
  };
}

/**
 * Every scheduled dose on `date`, across the saved vials — chronological, so
 * the first entry is the next thing to draw.
 */
export function dosesOnDate(
  vials: SavedVial[],
  date: string,
  nowIso: string,
  nowTime: string,
  filter: KindFilter = 'all',
): TodayDose[] {
  const doses: TodayDose[] = [];
  for (const vial of keep(vials, filter)) {
    if (!vial.schedule) continue;
    for (const time of timesOnDay(vial.schedule, date)) {
      doses.push(toDose(vial, date, time, nowIso, nowTime));
    }
  }
  return doses.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * The soonest dose that has *not* happened yet on `date` — or across the next
 * `horizonDays` if nothing is left today. This is what the Today card calls the
 * "next dose", and what a reminder would fire on next.
 */
export function nextDoseToday(
  vials: SavedVial[],
  todayIso: string,
  nowTime: string,
  horizonDays = 7,
  filter: KindFilter = 'all',
): TodayDose | null {
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = addDays(todayIso, offset);
    const doses = dosesOnDate(vials, date, todayIso, nowTime, filter);
    const upcoming = doses.find((dose) => !dose.taken);
    if (upcoming) return upcoming;
  }
  return null;
}

/** A saved vial can be "marked taken" by hand only while it has no schedule. */
export function hasSchedule(vial: SavedVial): boolean {
  return Boolean(vial.schedule);
}

/** How many doses of a plan are still to come (null for ongoing plans). */
export function dosesRemaining(vial: SavedVial, todayIso: string, nowTime: string): number | null {
  if (!vial.schedule) return null;
  const planned = totalPlannedDoses(vial.schedule);
  if (planned === null) return null;
  return Math.max(0, planned - elapsedDoses(vial.schedule, todayIso, nowTime));
}
