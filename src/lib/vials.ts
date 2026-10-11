/**
 * Saved-vial ("My reconstituted vials") logic.
 *
 * Like `calc.ts`, this is pure: no React, no DOM, no storage. A saved vial is a
 * snapshot of a reconstitution plus a running count of doses taken, from which
 * we can derive how much is left and when it expires. `todayIso` is injectable
 * so the expiry maths is deterministic in tests.
 */

import { isPositive, toMg, type DoseUnit, type SyringeTypeId } from './calc';
import { addDays, daysBetween, toIsoDate } from './dates';
import type { VialSchedule } from './schedule';

/**
 * Beyond-use date: bacteriostatic water is typically kept for up to 28 days
 * once the powder has been mixed. Shown as guidance, not as instructions.
 */
export const BUD_DAYS = 28;

/** A dose below this many mL cannot realistically be measured. */
export const MIN_MEASURABLE_ML = 0.02;

/** Peptides are reconstituted powder; anabolics are ready-to-use oils. */
export type VialKind = 'peptide' | 'anabolic';

/** UI filter: everything, or a single kind. */
export type KindFilter = 'all' | VialKind;

export interface SavedVial {
  id: string;
  name: string;
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
  /** Anabolics only: the strength on the label, in mg per mL. */
  concentrationMgPerMl?: number;
  /** Anabolics only: vial size in mL, when known. */
  vialMl?: number;
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
  concentrationMgPerMl: number;
  doseMg: number;
  /** mL drawn per dose. */
  volumePerDoseMl: number;
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
  return vial.kind === 'anabolic' ? 'anabolic' : 'peptide';
}

/** Keeps only the vials matching a UI filter (`all` keeps everything). */
export function filterVialsByKind(vials: SavedVial[], filter: KindFilter): SavedVial[] {
  if (filter === 'all') return vials;
  return vials.filter((vial) => vialKind(vial) === filter);
}

/** Derives everything the UI needs to show for a saved vial. */
export function vialStatus(vial: SavedVial, todayIso: string = toIsoDate(new Date())): VialStatus {
  const anabolic = vialKind(vial) === 'anabolic';

  const totalMg = isPositive(vial.vialAmount) ? toMg(vial.vialAmount, vial.vialUnit) : 0;
  const concentrationMgPerMl = anabolic
    ? isPositive(vial.concentrationMgPerMl ?? 0)
      ? (vial.concentrationMgPerMl as number)
      : 0
    : isPositive(vial.waterMl) && totalMg > 0
      ? totalMg / vial.waterMl
      : 0;

  const doseMg = isPositive(vial.doseAmount) ? toMg(vial.doseAmount, vial.doseUnit) : 0;
  const volumePerDoseMl =
    concentrationMgPerMl > 0 && doseMg > 0 ? doseMg / concentrationMgPerMl : 0;

  // Peptides know their mL from the water added; oils only if a size was entered.
  const volumeTotalMl = anabolic
    ? isPositive(vial.vialMl ?? 0)
      ? (vial.vialMl as number)
      : 0
    : isPositive(vial.waterMl)
      ? vial.waterMl
      : 0;

  // Peptide: mg in the vial ÷ dose. Oil: mL in the vial ÷ mL per dose.
  const totalDoses = anabolic
    ? volumeTotalMl > 0 && volumePerDoseMl > 0
      ? volumeTotalMl / volumePerDoseMl
      : 0
    : totalMg > 0 && doseMg > 0
      ? totalMg / doseMg
      : 0;

  const dosesTaken = Math.max(0, Math.floor(vial.dosesTaken));
  const dosesLeft = Math.max(0, totalDoses - dosesTaken);

  const volumeLeftMl = Math.max(0, volumeTotalMl - dosesTaken * volumePerDoseMl);
  const percentLeft = volumeTotalMl > 0 ? volumeLeftMl / volumeTotalMl : 0;

  // The 28-day BUD is a bacteriostatic-water rule, so it does not apply to oils.
  const expiresOn = anabolic ? null : addDays(vial.reconstitutedOn, BUD_DAYS);
  const daysUntilExpiry = expiresOn === null ? null : daysBetween(todayIso, expiresOn);

  return {
    concentrationMgPerMl,
    doseMg,
    volumePerDoseMl,
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
  if (vial.kind === 'anabolic') return isPositive(vial.concentrationMgPerMl ?? 0);
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
    (vial.vialUnit === 'mg' || vial.vialUnit === 'mcg') &&
    (vial.doseUnit === 'mg' || vial.doseUnit === 'mcg')
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
    price: typeof vial.price === 'number' && vial.price > 0 ? vial.price : undefined,
    currency: typeof vial.currency === 'string' && vial.currency ? vial.currency : undefined,
  };
}

/**
 * Merges two sets of vials, keyed by id: unknown ids are added, and when both
 * sides hold the same vial the newer `updatedAt` wins. Tombstones take part in
 * the same comparison, which is how a deletion propagates. Nothing is ever
 * removed, so it is safe to run on every sync.
 */
export function mergeVials(current: SavedVial[], incoming: SavedVial[]): SavedVial[] {
  const byId = new Map(current.map((vial) => [vial.id, vial]));
  for (const vial of incoming) {
    const existing = byId.get(vial.id);
    if (!existing) {
      byId.set(vial.id, vial);
      continue;
    }
    if ((vial.updatedAt ?? '') >= (existing.updatedAt ?? '')) byId.set(vial.id, vial);
  }
  return [...byId.values()];
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
