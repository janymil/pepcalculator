import type { DoseUnit, SyringeTypeId } from './lib/calc';

/**
 * Form state keeps raw strings (not numbers) so the user can type freely,
 * including an empty field or a trailing decimal point, without the value
 * jumping around. App converts to numbers only when calculating.
 */

export interface PeptideForm {
  vialAmount: string;
  vialUnit: DoseUnit;
  waterMl: string;
  doseAmount: string;
  doseUnit: DoseUnit;
}

export interface AnabolicForm {
  concentration: string;
  doseAmount: string;
  doseUnit: DoseUnit;
  /** Optional — shown as "vial size". */
  vialMl: string;
}

export interface SyringeSettings {
  type: SyringeTypeId;
  capacityMl: number;
}

export type ThemeName = 'light' | 'dark';
