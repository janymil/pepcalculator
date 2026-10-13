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
import { toBase, unitsCompatible, type DoseUnit } from './calc';
import { vialOwnerId } from './owners';
import {
  countDoseDays,
  phaseDoseOn,
  planEndDate,
  timesOnDay,
  timesPerDay,
  type VialSchedule,
} from './schedule';
import { shareDose, shareDoseUnit, shareFor, shareSchedule, sharesOf } from './shares';
import { liveVials, vialStatus, type SavedVial, type VialStatus } from './vials';

/** A vial with this many doses or fewer reads as "running low". */
export const LOW_DOSES = 3;

/** A use-by date within this many days is worth flagging. */
export const EXPIRING_SOON_DAYS = 7;

/** How far the run-out projection walks before giving up. */
const RUNOUT_HORIZON_DAYS = 4000;

export interface VialSupply {
  vial: SavedVial;
  /** Injections left at the *viewer's* current dose. */
  dosesLeft: number;
  /** The dose one injection draws for the viewer, in base units (phase-aware). */
  doseBase: number;
  /** Base units still in the vial (mg or IU) — one number, whatever the dose. */
  remainingBase: number;
  volumeLeftMl: number;
  /**
   * Percentage of the vial still there, 0..100.
   *
   * `remainingBase` / `volumeLeftMl` / `percentLeft` are the **bottle's** truth:
   * one figure for everybody drawing from it. Only `dosesLeft` is a reading of
   * it, and so it is the only one that differs between two people.
   */
  percentLeft: number;
  /**
   * `yyyy-mm-dd` on which the last dose comes out of this vial — null when no
   * one's plan can be projected, or when every plan ends first. This is the
   * *combined* run-out: every person sharing the bottle shortens it.
   */
  runOutOn: string | null;
  /** Whole days from today until `runOutOn`; null when unknown. */
  daysOfSupply: number | null;
  /** Peptides only: the beyond-use date. Oils never expire on a 28-day rule. */
  expiresOn: string | null;
  daysUntilExpiry: number | null;
  /** True when some plan still needs this vial on/after its use-by date. */
  expiresWithDosesLeft: boolean;
  /** Roughly how many doses would still be in the vial at expiry, everyone's. */
  dosesAtRisk: number;
  /** Running low (<= `LOW_DOSES` doses left). */
  isLow: boolean;
  /** Everyone else drawing from this bottle, with their own reading of it. */
  shares: VialShareSupply[];
}

/** How much is left *in one sharer's terms* — their dose, their number of doses. */
export interface VialShareSupply {
  ownerId: string;
  /** Day they joined the bottle. */
  from: string;
  /** The dose they draw, in their own unit. */
  doseAmount: number;
  doseUnit: DoseUnit;
  /** Injections left for them at that dose. */
  dosesLeft: number;
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

/** One person drawing from the vial: their plan, and the dose it draws. */
interface Participant {
  ownerId: string;
  schedule: VialSchedule;
  /** Base units (mg or IU) per injection, at *their* dose. */
  doseBase: number;
  doseUnit: DoseUnit;
}

/**
 * Everybody drawing from the vial, with each person's own plan resolved: the
 * owner's from the vial itself, everyone else's from their share — their own
 * dose and cadence where they set them, the owner's otherwise.
 *
 * A person whose units cannot be reconciled with the bottle (a dose in mg on a
 * vial labelled in IU) is left out rather than counted wrongly, and so is anyone
 * with no plan: there is nothing to project for them.
 */
function participantPlans(vial: SavedVial): Participant[] {
  const plans: Participant[] = [];

  const add = (
    ownerId: string,
    schedule: VialSchedule | undefined,
    doseAmount: number,
    doseUnit: DoseUnit,
  ) => {
    if (!schedule || timesPerDay(schedule) === 0) return;
    if (!unitsCompatible(vial.vialUnit, doseUnit)) return;
    plans.push({ ownerId, schedule, doseBase: toBase(doseAmount, doseUnit), doseUnit });
  };

  add(vialOwnerId(vial), vial.schedule, vial.doseAmount, vial.doseUnit);
  for (const entry of sharesOf(vial)) {
    add(
      entry.ownerId,
      shareSchedule(vial, entry),
      shareDose(vial, entry),
      shareDoseUnit(vial, entry),
    );
  }

  return plans;
}

/**
 * The dose one person draws on `iso`: the titration step's dose where the plan
 * steps up, otherwise their own. Always in base units.
 */
function doseOnDay(participant: Participant, iso: string): number {
  const phased = phaseDoseOn(participant.schedule, iso);
  return phased === null ? participant.doseBase : toBase(phased, participant.doseUnit);
}

/** Everything dissolved in the vial, in base units (mg or IU). */
function totalBaseOf(status: VialStatus): number {
  return status.concentrationPerMl * status.volumeTotalMl;
}

/**
 * What one person has already drawn: every scheduled dose before today, plus the
 * times of today that have already passed. Walking *their own* plan is what
 * keeps a late share honest — nothing before the day they joined is counted.
 */
function usedBy(participant: Participant, todayIso: string, nowTime: string): number {
  let used = 0;
  let cursor = participant.schedule.startsOn;
  for (let day = 0; day < RUNOUT_HORIZON_DAYS && cursor < todayIso; day += 1) {
    used += timesOnDay(participant.schedule, cursor).length * doseOnDay(participant, cursor);
    cursor = addDays(cursor, 1);
  }
  for (const time of timesOnDay(participant.schedule, todayIso)) {
    if (time < nowTime) used += doseOnDay(participant, todayIso);
  }
  return used;
}

/**
 * How much is gone from the bottle so far — **everyone's** draws added up. This
 * is the number that was wrong while a vial could only be one person's: two
 * people drawing from it empty it twice as fast, and until then the app had no
 * way of knowing.
 */
function usedBase(vial: SavedVial, status: VialStatus, todayIso: string, nowTime: string): number {
  const plans = participantPlans(vial);
  // An owner with no plan at all can only be counted by hand.
  const byHand = vial.schedule ? 0 : status.dosesTaken * status.doseBase;
  return plans.reduce((sum, participant) => sum + usedBy(participant, todayIso, nowTime), 0) + byHand;
}

/** Base units still in the vial right now. */
function remainingBase(vial: SavedVial, status: VialStatus, todayIso: string, nowTime: string): number {
  return totalBaseOf(status) - usedBase(vial, status, todayIso, nowTime);
}

/** The last day any of the plans runs, or null while one of them is ongoing. */
function lastPlanDay(plans: Participant[]): string | null {
  let last: string | null = null;
  for (const participant of plans) {
    const end = planEndDate(participant.schedule);
    if (end === null) return null;
    if (last === null || end > last) last = end;
  }
  return last;
}

/**
 * The date the last dose leaves the vial, walking the plans forward and
 * subtracting what each day *actually* draws — from **everybody** sharing the
 * bottle. That is what makes a step-up plan behave correctly (the same vial
 * lasts longer while the dose is still low) and what makes a shared one behave
 * correctly too (it runs out sooner, because two people draw from it).
 */
function runOutDate(
  vial: SavedVial,
  status: VialStatus,
  todayIso: string,
  nowTime: string,
): string | null {
  const plans = participantPlans(vial);
  if (plans.length === 0) return null;

  let remaining = remainingBase(vial, status, todayIso, nowTime);
  if (remaining <= 0) return todayIso;

  const end = lastPlanDay(plans);
  let cursor = todayIso;

  for (let day = 0; day < RUNOUT_HORIZON_DAYS; day += 1) {
    if (end !== null && cursor > end) return null;

    let drawn = 0;
    for (const participant of plans) {
      // Today only counts the times that are still ahead of us.
      const times = timesOnDay(participant.schedule, cursor).filter(
        (time) => cursor !== todayIso || time >= nowTime,
      );
      drawn += times.length * doseOnDay(participant, cursor);
    }
    if (drawn >= remaining) return cursor;

    remaining -= drawn;
    cursor = addDays(cursor, 1);
  }

  return null;
}

/**
 * Extra full vials the rest of the plans need after `runOutOn`. Counted in
 * volume rather than doses, so a later, larger titration step is not
 * under-estimated — and summed over everybody, so a shared bottle is reordered
 * at the rate it is actually being emptied.
 */
function extraVialsFor(
  vial: SavedVial,
  status: VialStatus,
  runOutOn: string | null,
): number {
  const plans = participantPlans(vial);
  if (plans.length === 0 || runOutOn === null) return 0;

  const end = lastPlanDay(plans);
  if (end === null || runOutOn >= end) return 0;

  const vialVolumeMl = status.volumeTotalMl;
  if (vialVolumeMl <= 0 || status.concentrationPerMl <= 0) return 0;

  let volumeMl = 0;
  let cursor = addDays(runOutOn, 1);
  for (let day = 0; day < RUNOUT_HORIZON_DAYS && cursor <= end; day += 1) {
    for (const participant of plans) {
      volumeMl +=
        (timesOnDay(participant.schedule, cursor).length * doseOnDay(participant, cursor)) /
        status.concentrationPerMl;
    }
    cursor = addDays(cursor, 1);
  }
  return Math.max(0, Math.ceil(volumeMl / vialVolumeMl));
}

/**
 * Everything the UI needs to talk about one vial's supply.
 *
 * `viewerId` is the person the numbers are being read *for*. It only changes
 * `dosesLeft` and `doseBase` — "how many injections is that for me?" — because
 * what is left in the bottle (`remainingBase`, `volumeLeftMl`, `runOutOn`) is one
 * figure regardless of who is asking. Defaults to the vial's owner.
 */
export function vialSupply(
  vial: SavedVial,
  todayIso: string,
  nowTime: string,
  viewerId?: string,
): VialSupply {
  const status = vialStatus(vial, todayIso);
  const plans = participantPlans(vial);

  const left = Math.max(0, remainingBase(vial, status, todayIso, nowTime));
  const volumeLeftMl = status.concentrationPerMl > 0 ? left / status.concentrationPerMl : 0;
  const percentLeft =
    status.volumeTotalMl > 0 ? (volumeLeftMl / status.volumeTotalMl) * 100 : 0;

  // `dosesLeft` is counted in *injections at the viewer's own dose*, which is the
  // number they actually care about: the same 3.5 mg is 7 doses at 0.5 mg and 14
  // at 0.25 mg.
  const viewerEntry = viewerId ? shareFor(vial, viewerId) : null;
  const viewerDoseBase = viewerEntry
    ? toBase(shareDose(vial, viewerEntry), shareDoseUnit(vial, viewerEntry))
    : status.doseBase;
  const dosesLeft = viewerDoseBase > 0 ? left / viewerDoseBase : 0;

  const runOutOn = plans.length > 0 ? runOutDate(vial, status, todayIso, nowTime) : null;

  const daysOfSupply = runOutOn === null ? null : Math.max(0, daysBetween(todayIso, runOutOn));

  const useBy = status.expiresOn;
  const expiresWithDosesLeft = runOutOn !== null && useBy !== null && runOutOn > useBy;

  // Doses that would still be wanted after the use-by date — everyone's, so the
  // warning is about the whole bottle and not just one person's share of it.
  const dosesAtRisk =
    expiresWithDosesLeft && useBy !== null && runOutOn !== null
      ? plans.reduce(
          (sum, participant) =>
            sum +
            countDoseDays(participant.schedule, addDays(useBy, 1), runOutOn) *
              timesPerDay(participant.schedule),
          0,
        )
      : 0;

  // Everyone else's own reading of what is left, for the "shared with" line.
  const shares = sharesOf(vial).map((entry) => {
    const doseBase = toBase(shareDose(vial, entry), shareDoseUnit(vial, entry));
    return {
      ownerId: entry.ownerId,
      from: entry.from,
      doseAmount: shareDose(vial, entry),
      doseUnit: shareDoseUnit(vial, entry),
      dosesLeft: doseBase > 0 ? left / doseBase : 0,
    };
  });

  return {
    vial,
    dosesLeft,
    doseBase: viewerDoseBase,
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
    shares,
  };
}

/** Projects the whole stack (pass an already person-scoped list). */
export function buildSupply(
  vials: SavedVial[],
  todayIso: string,
  nowTime: string,
  viewerId?: string,
): SupplySummary {
  const rows = liveVials(vials).map((vial) => vialSupply(vial, todayIso, nowTime, viewerId));

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
