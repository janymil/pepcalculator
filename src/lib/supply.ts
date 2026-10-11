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
import { toBase } from './calc';
import {
  countDoseDays,
  phaseDoseOn,
  planEndDate,
  timesOnDay,
  timesPerDay,
} from './schedule';
import { liveVials, vialStatus, type SavedVial, type VialStatus } from './vials';

/** A vial with this many doses or fewer reads as "running low". */
export const LOW_DOSES = 3;

/** A use-by date within this many days is worth flagging. */
export const EXPIRING_SOON_DAYS = 7;

/** How far the run-out projection walks before giving up. */
const RUNOUT_HORIZON_DAYS = 4000;

export interface VialSupply {
  vial: SavedVial;
  /** Injections left at the *current* step's dose. */
  dosesLeft: number;
  /** The dose one injection draws, in base units (phase-aware). */
  doseBase: number;
  /** Base units still in the vial (mg or IU). */
  remainingBase: number;
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
 * The dose drawn for one injection on `iso`: the titration step's dose when the
 * plan is stepping up, otherwise the vial's own dose. Always in base units.
 */
function doseOnDay(vial: SavedVial, iso: string, status: VialStatus): number {
  const phased = vial.schedule ? phaseDoseOn(vial.schedule, iso) : null;
  return phased === null ? status.doseBase : toBase(phased, vial.doseUnit);
}

/** Everything dissolved in the vial, in base units (mg or IU). */
function totalBaseOf(status: VialStatus): number {
  return status.concentrationPerMl * status.volumeTotalMl;
}

/**
 * How much has already been drawn: every scheduled dose up to yesterday, plus
 * the times of today that have already passed.
 */
function usedDose(vial: SavedVial, status: VialStatus, todayIso: string, nowTime: string): number {
  const schedule = vial.schedule;
  // Without a plan we can only trust the running count.
  if (!schedule) return status.dosesTaken * status.doseBase;

  let used = 0;
  let cursor = schedule.startsOn;
  for (let day = 0; day < RUNOUT_HORIZON_DAYS && cursor < todayIso; day += 1) {
    used += timesOnDay(schedule, cursor).length * doseOnDay(vial, cursor, status);
    cursor = addDays(cursor, 1);
  }
  for (const time of timesOnDay(schedule, todayIso)) {
    if (time < nowTime) used += doseOnDay(vial, todayIso, status);
  }
  return used;
}

/** Base units still in the vial right now. */
function remainingBase(vial: SavedVial, status: VialStatus, todayIso: string, nowTime: string): number {
  const drawn = vial.schedule
    ? usedDose(vial, status, todayIso, nowTime)
    : status.dosesTaken * status.doseBase;
  return totalBaseOf(status) - drawn;
}

/**
 * The date the last dose leaves the vial, walking the schedule forward and
 * subtracting what each day *actually* draws. That is what makes a step-up plan
 * behave correctly: the same vial lasts longer while the dose is still low.
 */
function runOutDate(
  vial: SavedVial,
  status: VialStatus,
  todayIso: string,
  nowTime: string,
): string | null {
  const schedule = vial.schedule;
  if (!schedule) return null;

  let remaining = remainingBase(vial, status, todayIso, nowTime);
  if (remaining <= 0) return todayIso;

  const end = planEndDate(schedule);
  let cursor = todayIso;

  for (let day = 0; day < RUNOUT_HORIZON_DAYS; day += 1) {
    if (end !== null && cursor > end) return null;

    // Today only counts the times that are still ahead of us.
    const times = timesOnDay(schedule, cursor).filter(
      (time) => cursor !== todayIso || time >= nowTime,
    );
    const drawn = times.length * doseOnDay(vial, cursor, status);
    if (drawn >= remaining) return cursor;

    remaining -= drawn;
    cursor = addDays(cursor, 1);
  }

  return null;
}

/**
 * Extra full vials the rest of the plan needs after `runOutOn`. Counted in
 * volume rather than doses, so a later, larger titration step is not
 * under-estimated.
 */
function extraVialsFor(
  vial: SavedVial,
  status: VialStatus,
  runOutOn: string | null,
): number {
  const schedule = vial.schedule;
  if (!schedule || runOutOn === null) return 0;

  const end = planEndDate(schedule);
  if (end === null || runOutOn >= end) return 0;

  const vialVolumeMl = status.volumeTotalMl;
  if (vialVolumeMl <= 0 || status.concentrationPerMl <= 0) return 0;

  let volumeMl = 0;
  let cursor = addDays(runOutOn, 1);
  for (let day = 0; day < RUNOUT_HORIZON_DAYS && cursor <= end; day += 1) {
    const times = timesOnDay(schedule, cursor).length;
    volumeMl += (times * doseOnDay(vial, cursor, status)) / status.concentrationPerMl;
    cursor = addDays(cursor, 1);
  }
  return Math.max(0, Math.ceil(volumeMl / vialVolumeMl));
}

/** Everything the UI needs to talk about one vial's supply. */
export function vialSupply(vial: SavedVial, todayIso: string, nowTime: string): VialSupply {
  const status = vialStatus(vial, todayIso);
  const schedule = vial.schedule;

  const left = Math.max(0, remainingBase(vial, status, todayIso, nowTime));
  // `dosesLeft` is counted in *injections at the current step*, which is the
  // number the user actually cares about — for a step-up plan the same vial
  // holds more of them while the dose is still low.
  const dosesLeft = status.doseBase > 0 ? left / status.doseBase : 0;
  const volumeLeftMl = status.concentrationPerMl > 0 ? left / status.concentrationPerMl : 0;
  const percentLeft =
    status.volumeTotalMl > 0 ? (volumeLeftMl / status.volumeTotalMl) * 100 : 0;

  const runOutOn =
    schedule && timesPerDay(schedule) > 0
      ? runOutDate(vial, status, todayIso, nowTime)
      : null;

  const daysOfSupply = runOutOn === null ? null : Math.max(0, daysBetween(todayIso, runOutOn));

  const expiresWithDosesLeft =
    runOutOn !== null && status.expiresOn !== null && runOutOn > status.expiresOn;

  const dosesAtRisk =
    expiresWithDosesLeft && status.expiresOn !== null && schedule
      ? countDoseDays(schedule, addDays(status.expiresOn, 1), runOutOn) *
        timesPerDay(schedule)
      : 0;

  return {
    vial,
    dosesLeft,
    doseBase: status.doseBase,
    remainingBase: left,
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
      (total, row) => total + extraVialsFor(row.vial, vialStatus(row.vial, todayIso), row.runOutOn),
      0,
    ),
  };
}
