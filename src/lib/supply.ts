/**
 * Supply outlook — "how long does my stack last, and what do I reorder?".
 *
 * The app already knows how much is left in every vial (`vials.ts`) and when
 * each plan takes its doses (`schedule.ts`). This module joins the two: for a
 * given stack it projects the day each vial runs out, notices the ones that will
 * expire with doses still in them, and works out how many more vials the plans
 * need. Nothing here is logged or estimated by hand — it is all derived.
 *
 * Pure module: no React, no DOM, `todayIso` / `nowTime` are injected.
 */

import { addDays, daysBetween } from './dates';
import { isLowStock } from './cost';
import {
  countDoseDays,
  elapsedDoses,
  planEndDate,
  timesOnDay,
  timesPerDay,
  type VialSchedule,
} from './schedule';
import { liveVials, vialStatus, type SavedVial } from './vials';

/** A vial with this many doses or fewer reads as "running low". */
export const LOW_DOSES = 3;

/** A use-by date within this many days is worth flagging. */
export const EXPIRING_SOON_DAYS = 7;

/** How far the run-out projection walks before giving up. */
const RUNOUT_HORIZON_DAYS = 4000;

export interface VialSupply {
  vial: SavedVial;
  /** Doses still in the vial. */
  dosesLeft: number;
  volumeLeftMl: number;
  /** Percentage of the vial still there, 0..100. */
  percentLeft: number;
  /**
   * `yyyy-mm-dd` on which the last dose comes out of this vial — null when the
   * vial has no plan (so it cannot be projected) or the plan ends first.
   */
  runOutOn: string | null;
  /** Whole days from today until `runOutOn`; null when unknown. */
  daysOfSupply: number | null;
  /** Peptides only: the beyond-use date. Oils never expire on a 28-day rule. */
  expiresOn: string | null;
  daysUntilExpiry: number | null;
  /** True when the plan still needs this vial on/after its use-by date. */
  expiresWithDosesLeft: boolean;
  /** Roughly how many doses would still be in the vial at expiry. */
  dosesAtRisk: number;
  /** Running low (<= `LOW_DOSES` doses left). */
  isLow: boolean;
}

export interface SupplySummary {
  /** One row per live vial, in the order they were given. */
  vials: VialSupply[];
  /** The soonest run-out across the whole stack, or null if none can be projected. */
  runsOutOn: string | null;
  /** Vials that are running low. */
  low: VialSupply[];
  /** Vials that are expired, or expire soon, while still holding doses. */
  expiring: VialSupply[];
  /** Extra vials needed to carry every plan through to its last day. */
  vialsToReorder: number;
}

/**
 * The date the last dose leaves the vial, walking the schedule forward from
 * today. `dosesLeft <= 0` means the vial is already empty, which we report as
 * *today*. Returns null when the plan ends before the vial is used up, because
 * then there is nothing to run out of.
 */
function runOutDate(
  schedule: VialSchedule,
  todayIso: string,
  nowTime: string,
  dosesLeft: number,
): string | null {
  if (dosesLeft <= 0) return todayIso;

  const end = planEndDate(schedule);
  let remaining = dosesLeft;
  let cursor = todayIso;

  for (let day = 0; day < RUNOUT_HORIZON_DAYS; day += 1) {
    if (end !== null && cursor > end) return null;

    // Today only counts the times that are still ahead of us.
    const times = timesOnDay(schedule, cursor).filter(
      (time) => cursor !== todayIso || time >= nowTime,
    );
    if (times.length >= remaining) return cursor;

    remaining -= times.length;
    cursor = addDays(cursor, 1);
  }

  return null;
}

/** Extra full vials this plan needs after `runOutOn`, to reach its last day. */
function extraVialsFor(vial: SavedVial, runOutOn: string | null, todayIso: string): number {
  const schedule = vial.schedule;
  if (!schedule || runOutOn === null) return 0;

  const end = planEndDate(schedule);
  if (end === null || runOutOn >= end) return 0;

  const perDay = timesPerDay(schedule);
  const dosesPerVial = vialStatus(vial, todayIso).totalDoses;
  if (perDay <= 0 || dosesPerVial <= 0) return 0;

  const extraDoses = countDoseDays(schedule, addDays(runOutOn, 1), end) * perDay;
  return Math.max(0, Math.ceil(extraDoses / dosesPerVial));
}

/** Everything the UI needs to talk about one vial's supply. */
export function vialSupply(vial: SavedVial, todayIso: string, nowTime: string): VialSupply {
  const status = vialStatus(vial, todayIso);
  const schedule = vial.schedule;
  const perDay = schedule ? timesPerDay(schedule) : 0;

  // A scheduled vial's progress is *derived* from the plan (see VialCard); the
  // stored `dosesTaken` only counts for vials the user marks by hand. Using the
  // stored field here would silently read zero for every planned vial.
  const dosesDone = schedule ? elapsedDoses(schedule, todayIso, nowTime) : status.dosesTaken;
  const dosesLeft = schedule
    ? Math.max(0, status.totalDoses - dosesDone)
    : status.dosesLeft;
  const volumeLeftMl = Math.max(0, status.volumeTotalMl - dosesDone * status.volumePerDoseMl);
  const percentLeft = status.volumeTotalMl > 0 ? (volumeLeftMl / status.volumeTotalMl) * 100 : 0;

  const runOutOn =
    schedule && perDay > 0 ? runOutDate(schedule, todayIso, nowTime, dosesLeft) : null;

  const daysOfSupply = runOutOn === null ? null : Math.max(0, daysBetween(todayIso, runOutOn));

  const expiresWithDosesLeft =
    runOutOn !== null && status.expiresOn !== null && runOutOn > status.expiresOn;

  const dosesAtRisk =
    expiresWithDosesLeft && status.expiresOn !== null && schedule
      ? countDoseDays(schedule, addDays(status.expiresOn, 1), runOutOn) * perDay
      : 0;

  return {
    vial,
    dosesLeft,
    volumeLeftMl,
    percentLeft,
    runOutOn,
    daysOfSupply,
    expiresOn: status.expiresOn,
    daysUntilExpiry: status.daysUntilExpiry,
    expiresWithDosesLeft,
    dosesAtRisk,
    isLow: isLowStock(dosesLeft, LOW_DOSES),
  };
}

/** Projects the whole stack (pass an already owner-filtered list). */
export function buildSupply(
  vials: SavedVial[],
  todayIso: string,
  nowTime: string,
): SupplySummary {
  const rows = liveVials(vials).map((vial) => vialSupply(vial, todayIso, nowTime));

  const runOuts = rows
    .map((row) => row.runOutOn)
    .filter((date): date is string => date !== null)
    .sort();

  return {
    vials: rows,
    runsOutOn: runOuts[0] ?? null,
    // "Running low" means still usable but nearly out — an empty vial is finished,
    // not low, and would just add noise to the nudge.
    low: rows.filter((row) => row.dosesLeft > 0 && row.isLow),
    expiring: rows.filter(
      (row) =>
        row.dosesLeft > 0 &&
        row.daysUntilExpiry !== null &&
        row.daysUntilExpiry <= EXPIRING_SOON_DAYS,
    ),
    vialsToReorder: rows.reduce(
      (total, row) => total + extraVialsFor(row.vial, row.runOutOn, todayIso),
      0,
    ),
  };
}
