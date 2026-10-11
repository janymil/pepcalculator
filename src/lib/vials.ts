/**
 * Saved-vial ("My reconstituted vials") logic.
 *
 * Like `calc.ts`, this is pure: no React, no DOM, no storage. A saved vial is a
 * snapshot of a reconstitution plus a running count of doses taken, from which
 * we can derive how much is left and when it expires. `todayIso` is injectable
 * so the expiry maths is deterministic in tests.
 */

import {
  DOSE_UNITS,
  isPositive,
  toBase,
  unitsCompatible,
  type DoseUnit,
  type MeasureSystem,
  type SyringeTypeId,
} from './calc';
import { addDays, daysBetween, toIsoDate } from './dates';
import type { VialSchedule } from './schedule';

/**
 * Beyond-use date: bacteriostatic water is typically kept for up to 28 days
 * once the powder has been mixed. Shown as guidance, not as instructions.
 */
export const BUD_DAYS = 28;

/** A dose below this many mL cannot realistically be measured. */
export const MIN_MEASURABLE_ML = 0.02;

/**
 * Vial kinds:
 *  - `peptide`  — powder reconstituted with water, drawn with an insulin syringe.
 *  - `anabolic` — ready-to-use oil whose strength is printed on the label.
 *  - `hormone`  — reconstituted like a peptide, but labelled and dosed in **IU**.
 *  - `glp1`     — a ready-to-use GLP-1 solution, usually dialled from a pen.
 */
export type VialKind = 'peptide' | 'anabolic' | 'hormone' | 'glp1';

/** How the draw is read off the device. Pens dial in clicks; syringes do not. */
export type VialDevice = 'syringe' | 'pen';

/** UI filter: everything, or a single kind. */
export type KindFilter = 'all' | VialKind;

export interface SavedVial {
  id: string;
  name: string;
  /**
   * Which person's stack this vial belongs to (see `lib/owners.ts`). Absent on
   * records saved before owners existed, and then treated as the default person.
   */
  ownerId?: string;
  /** ISO date (`yyyy-mm-dd`) the powder was mixed. */
  reconstitutedOn: string;
  /** Amount of powder that was in the vial. */
  vialAmount: number;
  vialUnit: DoseUnit;
  /** mL of bacteriostatic water that was added. */
  waterMl: number;
  /**
   * `'peptide'` (reconstituted powder) or `'anabolic'` (ready-to-use oil).
   * Records saved before kinds existed have no value — `vialKind()` treats
   * those as peptides.
   */
  kind?: VialKind;
  /**
   * Anabolics only: the strength on the label, in mg per mL.
   * GLP-1 pens use it too — it is the concentration printed on the pen.
   */
  concentrationMgPerMl?: number;
  /** Anabolics only: vial size in mL, when known. */
  vialMl?: number;
  /**
   * How the draw is read off the device. Absent on older records, and then
   * treated as a syringe.
   */
  device?: VialDevice;
  /** Pen only: how many dial clicks make one millilitre. */
  clicksPerMl?: number;
  /** The dose this vial is being used for. */
  doseAmount: number;
  doseUnit: DoseUnit;
  /**
   * Optional price paid for the whole vial, in `currency`. Used to show
   * cost-per-dose and what a plan will cost. Absent on older records.
   */
  price?: number;
  /** Optional ISO-4217 currency code for `price`, e.g. `EUR`. */
  currency?: string;
  /** How many doses have already been taken from this vial. */
  dosesTaken: number;
  syringeType: SyringeTypeId;
  syringeCapacityMl: number;
  /**
   * Optional dose plan. When present, "doses taken" is derived from the plan
   * automatically — the user never has to log anything after an injection.
   */
  schedule?: VialSchedule;
  /**
   * When this vial last changed locally. Used to decide which copy wins when
   * merging a backup or a sync from another device.
   */
  updatedAt?: string;
  /**
   * Tombstone: set instead of removing the vial outright, so the deletion can
   * travel to your other devices. Tombstoned vials are hidden everywhere except
   * in sync payloads.
   */
  deletedAt?: string;
}

export interface VialStatus {
  /** Strength in the base unit of the vial's family per mL (mg/mL or IU/mL). */
  concentrationPerMl: number;
  /** The dose in the base unit of its family. */
  doseBase: number;
  /** mL drawn per dose. */
  volumePerDoseMl: number;
  /**
   * Dial clicks for one dose — only meaningful for a pen (`device: 'pen'`).
   * `null` when the vial is not dialled.
   */
  clicksPerDose: number | null;
  /** How many doses the vial holds in total (may be fractional). */
  totalDoses: number;
  dosesTaken: number;
  dosesLeft: number;
  volumeTotalMl: number;
  volumeLeftMl: number;
  /** Fraction of the vial still remaining, 0..1. */
  percentLeft: number;
  /** ISO date the vial should be discarded by; `null` for anabolics (no BUD rule). */
  expiresOn: string | null;
  /** Whole days until `expiresOn`; negative once it has passed. `null` when there is no date. */
  daysUntilExpiry: number | null;
  isExpired: boolean;
}

/** The kind of a saved vial. Records from before kinds existed are peptides. */
export function vialKind(vial: SavedVial): VialKind {
  if (vial.kind === 'anabolic') return 'anabolic';
  if (vial.kind === 'hormone') return 'hormone';
  if (vial.kind === 'glp1') return 'glp1';
  return 'peptide';
}

/** True for vials that were dissolved from powder, rather than drawn as-is. */
export function isReconstituted(kind: VialKind): boolean {
  return kind === 'peptide' || kind === 'hormone';
}

/**
 * How the drawn amount is read off the device for this vial:
 *  - a pen always dials **clicks**;
 *  - peptides are read in insulin-syringe graduations;
 *  - everything else (oils, an IU-dosed hormone) is read in **mL** — for a
 *    hormone, "units" would be ambiguous with the IU printed on the label.
 */
export function kindMeasure(kind: VialKind, device: VialDevice = 'syringe'): MeasureSystem {
  if (device === 'pen') return 'clicks';
  return kind === 'peptide' ? 'insulin' : 'volume';
}

/** Keeps only the vials matching a UI filter (`all` keeps everything). */
export function filterVialsByKind(vials: SavedVial[], filter: KindFilter): SavedVial[] {
  if (filter === 'all') return vials;
  return vials.filter((vial) => vialKind(vial) === filter);
}

/** Derives everything the UI needs to show for a saved vial. */
export function vialStatus(vial: SavedVial, todayIso: string = toIsoDate(new Date())): VialStatus {
  const anabolic = vialKind(vial) === 'anabolic';

  // Units from different families (a vial in IU, a dose in mg) cannot be
  // reconciled, so nothing is derived from them at all.
  const unitsMatch = unitsCompatible(vial.vialUnit, vial.doseUnit);

  const totalBase = isPositive(vial.vialAmount) ? toBase(vial.vialAmount, vial.vialUnit) : 0;
  const concentrationPerMl = !unitsMatch
    ? 0
    : anabolic
      ? isPositive(vial.concentrationMgPerMl ?? 0)
        ? (vial.concentrationMgPerMl as number)
        : 0
      : isPositive(vial.waterMl) && totalBase > 0
        ? totalBase / vial.waterMl
        : 0;

  const doseBase = isPositive(vial.doseAmount) ? toBase(vial.doseAmount, vial.doseUnit) : 0;
  const volumePerDoseMl =
    concentrationPerMl > 0 && doseBase > 0 ? doseBase / concentrationPerMl : 0;

  // A pen dials whole clicks, so the same volume is also expressed that way.
  const clicksPerMl = isPositive(vial.clicksPerMl ?? 0) ? (vial.clicksPerMl as number) : 0;
  const clicksPerDose =
    vial.device === 'pen' && clicksPerMl > 0 && volumePerDoseMl > 0
      ? volumePerDoseMl * clicksPerMl
      : null;

  // Peptides know their mL from the water added; oils only if a size was entered.
  const volumeTotalMl = anabolic
    ? isPositive(vial.vialMl ?? 0)
      ? (vial.vialMl as number)
      : 0
    : isPositive(vial.waterMl)
      ? vial.waterMl
      : 0;

  // Peptide: amount in the vial ÷ dose. Oil: mL in the vial ÷ mL per dose.
  // Both are gated on a usable strength, so a family mismatch yields nothing.
  const totalDoses = anabolic
    ? volumeTotalMl > 0 && volumePerDoseMl > 0
      ? volumeTotalMl / volumePerDoseMl
      : 0
    : concentrationPerMl > 0 && doseBase > 0
      ? totalBase / doseBase
      : 0;

  const dosesTaken = Math.max(0, Math.floor(vial.dosesTaken));
  const dosesLeft = Math.max(0, totalDoses - dosesTaken);

  const volumeLeftMl = Math.max(0, volumeTotalMl - dosesTaken * volumePerDoseMl);
  const percentLeft = volumeTotalMl > 0 ? volumeLeftMl / volumeTotalMl : 0;

  // The 28-day BUD is a bacteriostatic-water rule, so it does not apply to oils.
  const expiresOn = anabolic ? null : addDays(vial.reconstitutedOn, BUD_DAYS);
  const daysUntilExpiry = expiresOn === null ? null : daysBetween(todayIso, expiresOn);

  return {
    concentrationPerMl,
    doseBase,
    volumePerDoseMl,
    clicksPerDose,
    totalDoses,
    dosesTaken,
    dosesLeft,
    volumeTotalMl,
    volumeLeftMl,
    percentLeft,
    expiresOn,
    daysUntilExpiry,
    isExpired: daysUntilExpiry !== null && daysUntilExpiry < 0,
  };
}

/** A vial is only worth saving when its numbers make sense for its kind. */
export function canSaveVial(
  vial: Pick<SavedVial, 'doseAmount'> & {
    kind?: VialKind;
    vialAmount?: number;
    waterMl?: number;
    concentrationMgPerMl?: number;
  },
): boolean {
  if (!isPositive(vial.doseAmount)) return false;
  // A label-driven vial just needs its concentration; everything else is
  // reconstituted, so it needs a vial and water.
  if (!isReconstituted(vial.kind ?? 'peptide')) return isPositive(vial.concentrationMgPerMl ?? 0);
  return isPositive(vial.vialAmount ?? 0) && isPositive(vial.waterMl ?? 0);
}

/** Collision-resistant id for a new saved vial. */
export function createVialId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `vial-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Minimal shape check for a vial arriving from outside the app (backup, sync). */
export function looksLikeSavedVial(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const vial = value as Record<string, unknown>;
  return (
    typeof vial.id === 'string' &&
    typeof vial.name === 'string' &&
    typeof vial.reconstitutedOn === 'string' &&
    typeof vial.vialAmount === 'number' &&
    typeof vial.waterMl === 'number' &&
    typeof vial.doseAmount === 'number' &&
    DOSE_UNITS.includes(vial.vialUnit as DoseUnit) &&
    DOSE_UNITS.includes(vial.doseUnit as DoseUnit)
  );
}

/** Fills in fields an older or hand-edited payload might be missing. */
export function normalizeSavedVial(value: unknown): SavedVial {
  const vial = value as Record<string, unknown>;
  return {
    ...(vial as unknown as SavedVial),
    kind: vial.kind === 'anabolic' ? 'anabolic' : 'peptide',
    dosesTaken: typeof vial.dosesTaken === 'number' ? vial.dosesTaken : 0,
    syringeType:
      vial.syringeType === 'U40' || vial.syringeType === 'U50' ? vial.syringeType : 'U100',
    syringeCapacityMl: typeof vial.syringeCapacityMl === 'number' ? vial.syringeCapacityMl : 1,
    concentrationMgPerMl:
      typeof vial.concentrationMgPerMl === 'number' ? vial.concentrationMgPerMl : undefined,
    vialMl: typeof vial.vialMl === 'number' ? vial.vialMl : undefined,
    device: vial.device === 'pen' ? 'pen' : undefined,
    clicksPerMl:
      vial.device === 'pen' && typeof vial.clicksPerMl === 'number' && vial.clicksPerMl > 0
        ? vial.clicksPerMl
        : undefined,
    price: typeof vial.price === 'number' && vial.price > 0 ? vial.price : undefined,
    currency: typeof vial.currency === 'string' && vial.currency ? vial.currency : undefined,
    ownerId: typeof vial.ownerId === 'string' && vial.ownerId.trim() !== '' ? vial.ownerId : undefined,
  };
}

/** A vial that changed on two devices since they last agreed. */
export interface VialConflict {
  id: string;
  /** The name as kept, so a message can name it. */
  name: string;
  /** `updatedAt` of the copy that was kept. */
  keptAt: string;
  /** `updatedAt` of the copy that was discarded. */
  discardedAt: string;
}

/** Everything that makes a vial *the same vial*, ignoring when it changed. */
function sameVialContent(a: SavedVial, b: SavedVial): boolean {
  const { updatedAt: _aUp, ...restA } = a;
  const { updatedAt: _bUp, ...restB } = b;
  return JSON.stringify(restA) === JSON.stringify(restB);
}

/**
 * Merges two sets of vials by id and **reports where both sides disagreed**.
 *
 * The merge itself is unchanged (union by id, newest `updatedAt` wins, including
 * tombstones) — that is what makes it safe to run on every sync. What this adds
 * is honesty: when both devices changed the same vial to *different* things, one
 * of those edits is about to disappear, and the user is told instead of the app
 * quietly picking a winner.
 *
 * A tombstone arriving over a live edit counts as a conflict too, because
 * "deleted on the phone, edited on the laptop" is exactly the case worth
 * surfacing.
 */
export function mergeWithConflicts(
  current: SavedVial[],
  incoming: SavedVial[],
): { vials: SavedVial[]; conflicts: VialConflict[] } {
  const byId = new Map(current.map((vial) => [vial.id, vial]));
  const conflicts: VialConflict[] = [];

  for (const vial of incoming) {
    const existing = byId.get(vial.id);
    if (!existing) {
      byId.set(vial.id, vial);
      continue;
    }

    // The same content, just a newer stamp: nothing was lost, so say nothing.
    if (sameVialContent(existing, vial)) {
      if ((vial.updatedAt ?? '') >= (existing.updatedAt ?? '')) byId.set(vial.id, vial);
      continue;
    }

    const incomingWins = (vial.updatedAt ?? '') >= (existing.updatedAt ?? '');
    const winner = incomingWins ? vial : existing;
    const loser = incomingWins ? existing : vial;
    byId.set(vial.id, winner);

    conflicts.push({
      id: vial.id,
      name: winner.name || loser.name,
      keptAt: winner.updatedAt ?? '',
      discardedAt: loser.updatedAt ?? '',
    });
  }

  return { vials: [...byId.values()], conflicts };
}

/**
 * Merges two sets of vials, keyed by id: unknown ids are added, and when both
 * sides hold the same vial the newer `updatedAt` wins. Tombstones take part in
 * the same comparison, which is how a deletion propagates. Nothing is ever
 * removed, so it is safe to run on every sync.
 *
 * Use `mergeWithConflicts` when the caller wants to know what was overwritten.
 */
export function mergeVials(current: SavedVial[], incoming: SavedVial[]): SavedVial[] {
  return mergeWithConflicts(current, incoming).vials;
}

/** The vials a user should actually see — tombstones excluded. */
export function liveVials(vials: SavedVial[]): SavedVial[] {
  return vials.filter((vial) => !vial.deletedAt);
}

/**
 * How long a deletion tombstone is kept before it can be swept away.
 *
 * A tombstone is the **only** record that a vial was deleted, and merges are
 * additive ("union by id, newest wins"). So a device that has been offline for
 * longer than this window may still hold the live vial and would push it back,
 * resurrecting the deletion. Ninety days is far longer than any realistic gap
 * between two devices syncing, while keeping the payload from growing forever.
 * Shorten it only if you accept that trade-off.
 */
export const TOMBSTONE_TTL_DAYS = 90;

/**
 * Drops tombstones older than `ttlDays` (90 by default) — the only place a
 * saved vial is ever really removed; everything else soft-deletes. Live vials
 * and fresh tombstones pass through untouched, and a tombstone whose
 * `deletedAt` cannot be dated is kept, because losing a deletion is worse than
 * keeping it a while longer.
 */
export function purgeTombstones(
  vials: SavedVial[],
  todayIso: string = toIsoDate(new Date()),
  ttlDays: number = TOMBSTONE_TTL_DAYS,
): SavedVial[] {
  return vials.filter((vial) => {
    if (!vial.deletedAt) return true;
    // `deletedAt` is a full ISO timestamp; only its date part matters here.
    if (!/^\d{4}-\d{2}-\d{2}/.test(vial.deletedAt)) return true;
    return daysBetween(vial.deletedAt.slice(0, 10), todayIso) < ttlDays;
  });
}

/**
 * Soft-deletes a vial: keeps the record but marks it deleted, so the removal
 * reaches your other devices on the next sync. Stamping `updatedAt` makes the
 * tombstone win over the still-live copies elsewhere.
 */
export function tombstoneVial(vial: SavedVial, deletedAt: string): SavedVial {
  return { ...vial, deletedAt, updatedAt: deletedAt };
}

/**
 * Soft-deletes **every** live vial in one go — the "clear all my data" path.
 * Already-tombstoned records are left as they are so their original deletion
 * time is preserved. Returns the original array when there is nothing to clear,
 * which keeps React state updates from firing needlessly.
 */
export function clearAllVials(vials: SavedVial[], deletedAt: string): SavedVial[] {
  let changed = false;
  const cleared = vials.map((vial) => {
    if (vial.deletedAt) return vial;
    changed = true;
    return tombstoneVial(vial, deletedAt);
  });
  return changed ? cleared : vials;
}

/** How the Vials page is ordered. */
export type VialSort = 'newest' | 'name' | 'expiry';

/** Case-insensitive name search; a blank query returns the list untouched. */
export function searchVials(vials: SavedVial[], query: string): SavedVial[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return vials;
  return vials.filter((vial) => (vial.name || '').toLowerCase().includes(needle));
}

/**
 * Returns a sorted copy of the list:
 *  - `newest`  — most recently changed first (`updatedAt`, then mix date),
 *  - `name`    — locale-aware, A→Z,
 *  - `expiry`  — soonest use-by first, with expiring-less oils last.
 */
export function sortVials(vials: SavedVial[], sort: VialSort, todayIso: string): SavedVial[] {
  const list = [...vials];

  if (sort === 'name') {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }

  if (sort === 'expiry') {
    list.sort((a, b) => {
      const left = vialStatus(a, todayIso).daysUntilExpiry;
      const right = vialStatus(b, todayIso).daysUntilExpiry;
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return left - right;
    });
    return list;
  }

  list.sort((a, b) =>
    (b.updatedAt ?? b.reconstitutedOn ?? '').localeCompare(a.updatedAt ?? a.reconstitutedOn ?? ''),
  );
  return list;
}
