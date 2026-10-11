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

/** HGH/HCG use exactly the same fields as a peptide — only the units differ. */
export type HormoneForm = PeptideForm;

/** A GLP-1 pen is described by the label's concentration, exactly like an oil. */
export type Glp1Form = AnabolicForm;

/** Device-level settings for a pen workflow. */
export interface PenSettings {
  /** How many dial clicks make 1 mL. See `DEFAULT_CLICKS_PER_ML`. */
  clicksPerMl: number;
}

export type ThemeName = 'light' | 'dark';
