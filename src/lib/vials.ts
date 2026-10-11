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
  /** The dose this vial is being used for. */
  doseAmount: number;
  doseUnit: DoseUnit;
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
  /** ISO date the vial should be discarded by. */
  expiresOn: string;
  /** Whole days until `expiresOn`; negative once it has passed. */
  daysUntilExpiry: number;
  isExpired: boolean;
}

/** Derives everything the UI needs to show for a saved vial. */
export function vialStatus(vial: SavedVial, todayIso: string = toIsoDate(new Date())): VialStatus {
  const totalMg = isPositive(vial.vialAmount) ? toMg(vial.vialAmount, vial.vialUnit) : 0;
  const concentrationMgPerMl =
    isPositive(vial.waterMl) && totalMg > 0 ? totalMg / vial.waterMl : 0;

  const doseMg = isPositive(vial.doseAmount) ? toMg(vial.doseAmount, vial.doseUnit) : 0;
  const volumePerDoseMl =
    concentrationMgPerMl > 0 && doseMg > 0 ? doseMg / concentrationMgPerMl : 0;

  const totalDoses = totalMg > 0 && doseMg > 0 ? totalMg / doseMg : 0;
  const dosesTaken = Math.max(0, Math.floor(vial.dosesTaken));
  const dosesLeft = Math.max(0, totalDoses - dosesTaken);

  const volumeTotalMl = isPositive(vial.waterMl) ? vial.waterMl : 0;
  const volumeLeftMl = Math.max(0, volumeTotalMl - dosesTaken * volumePerDoseMl);
  const percentLeft = volumeTotalMl > 0 ? volumeLeftMl / volumeTotalMl : 0;

  const expiresOn = addDays(vial.reconstitutedOn, BUD_DAYS);
  const daysUntilExpiry = daysBetween(todayIso, expiresOn);

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
    isExpired: daysUntilExpiry < 0,
  };
}

/** A vial is only worth saving when the reconstitution makes sense. */
export function canSaveVial(vial: Pick<SavedVial, 'vialAmount' | 'waterMl' | 'doseAmount'>): boolean {
  return isPositive(vial.vialAmount) && isPositive(vial.waterMl) && isPositive(vial.doseAmount);
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
    dosesTaken: typeof vial.dosesTaken === 'number' ? vial.dosesTaken : 0,
    syringeType:
      vial.syringeType === 'U40' || vial.syringeType === 'U50' ? vial.syringeType : 'U100',
    syringeCapacityMl: typeof vial.syringeCapacityMl === 'number' ? vial.syringeCapacityMl : 1,
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
 * Soft-deletes a vial: keeps the record but marks it deleted, so the removal
 * reaches your other devices on the next sync. Stamping `updatedAt` makes the
 * tombstone win over the still-live copies elsewhere.
 */
export function tombstoneVial(vial: SavedVial, deletedAt: string): SavedVial {
  return { ...vial, deletedAt, updatedAt: deletedAt };
}
