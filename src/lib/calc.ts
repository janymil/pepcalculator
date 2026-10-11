/**
 * Pure calculation engine for PepCalculator.
 *
 * This module has ZERO dependencies on React or the DOM. That keeps the maths
 * easy to unit-test and makes it trivial to reuse later (CLI, mobile app,
 * server-side API, browser extension, ...).
 *
 * Extensibility note:
 *  - `ModeId` describes the workflow (currently peptides and anabolics).
 *  - Adding a new workflow = add a new `calculate*` function here plus an entry
 *    in `src/config/modes.ts`. The UI renders itself from that registry.
 */

/** Which workflow the user is in. */
export type ModeId = 'peptide' | 'anabolic';

/** Unit an amount is expressed in. Peptides are often dosed in micrograms. */
export type DoseUnit = 'mg' | 'mcg';

/** Insulin syringe scale. U-100 means 100 "units" per millilitre. */
export type SyringeTypeId = 'U100' | 'U40' | 'U50';

export type WarningSeverity = 'error' | 'warning' | 'info';

/**
 * Machine-readable warning codes. The engine returns codes (not text) so the
 * UI can translate them via the i18n dictionaries.
 */
export type WarningCode =
  | 'missingVial'
  | 'missingWater'
  | 'missingConcentration'
  | 'missingDose'
  | 'doseAboveVial'
  | 'exceedsSyringe'
  | 'doseTooSmall'
  | 'doseTooSmallVolume';

export interface CalcWarning {
  code: WarningCode;
  severity: WarningSeverity;
  /** Values interpolated into the translated message, e.g. { volume, capacity }. */
  params?: Record<string, number | string>;
}

export interface CalcResult {
  /** True when every required input is present and nothing is blocking. */
  ok: boolean;
  /** Strength of the solution in mg per mL. */
  concentrationMgPerMl: number;
  /** The requested dose converted to mg. */
  doseMg: number;
  /** Volume to draw, in mL. */
  volumeMl: number;
  /**
   * The same volume expressed in insulin units for the selected syringe.
   * Only meaningful for the `insulin` measure system (peptides) — oil syringes
   * are read in millilitres.
   */
  units: number;
  /** Units per mL for the selected syringe scale (100 / 40 / 50). */
  unitsPerMl: number;
  /** Total mg available in one vial, when known. */
  totalVialMg: number | null;
  /** How many full doses fit in one vial, when known. */
  dosesPerVial: number | null;
  /**
   * Inverse mode only: the dose (in `doseUnit`) obtained from a volume the user
   * actually drew. `null` when the concentration or the volume is unusable.
   */
  doseFromVolume: number | null;
  warnings: CalcWarning[];
}

export interface SyringeType {
  id: SyringeTypeId;
  unitsPerMl: number;
  label: string;
}

/** Supported insulin syringe scales. */
export const SYRINGE_TYPES: readonly SyringeType[] = [
  { id: 'U100', unitsPerMl: 100, label: 'U-100' },
  { id: 'U40', unitsPerMl: 40, label: 'U-40' },
  { id: 'U50', unitsPerMl: 50, label: 'U-50' },
];

/** Returns how many insulin units make up 1 mL for the given scale. */
export function unitsPerMlOf(type: SyringeTypeId): number {
  return SYRINGE_TYPES.find((t) => t.id === type)?.unitsPerMl ?? 100;
}

/** Converts an amount expressed in `unit` into milligrams. */
export function toMg(amount: number, unit: DoseUnit): number {
  return unit === 'mcg' ? amount / 1000 : amount;
}

/** Converts milligrams into the requested display unit. */
export function fromMg(mg: number, unit: DoseUnit): number {
  return unit === 'mcg' ? mg * 1000 : mg;
}

/** A usable measurement must be a finite number greater than zero. */
export function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * How the drawn amount is read off the syringe:
 *  - `insulin` → an insulin syringe, counted in *units* (reconstituted peptides).
 *  - `volume`  → a plain mL syringe, counted in *millilitres* (anabolic oils).
 */
export type MeasureSystem = 'insulin' | 'volume';

interface AssembleArgs {
  concentrationMgPerMl: number;
  doseMg: number;
  totalVialMg: number | null;
  unitsPerMl: number;
  syringeCapacityMl: number;
  warnings: CalcWarning[];
  /** Decides which "too small to measure" message fits this workflow. */
  measure: MeasureSystem;
  /** Inverse mode: a volume the user actually drew, in mL. */
  inverseVolumeMl?: number;
  /** Inverse mode: the unit to express `doseFromVolume` in. */
  inverseDoseUnit?: DoseUnit;
}

/** Shared tail-end of every calculation: derive volume, units and warnings. */
function assemble(args: AssembleArgs): CalcResult {
  const {
    concentrationMgPerMl,
    doseMg,
    totalVialMg,
    unitsPerMl,
    syringeCapacityMl,
    measure,
    inverseVolumeMl,
    inverseDoseUnit,
  } = args;
  const warnings = [...args.warnings];

  const ready = isPositive(concentrationMgPerMl) && isPositive(doseMg);

  const volumeMl = ready ? doseMg / concentrationMgPerMl : 0;
  const units = ready ? volumeMl * unitsPerMl : 0;
  const dosesPerVial = totalVialMg !== null && isPositive(doseMg) ? totalVialMg / doseMg : null;

  // Inverse mode: "I drew this much — what dose is that?"
  const doseFromVolume =
    inverseVolumeMl !== undefined && inverseDoseUnit !== undefined &&
    isPositive(concentrationMgPerMl) && isPositive(inverseVolumeMl)
      ? fromMg(concentrationMgPerMl * inverseVolumeMl, inverseDoseUnit)
      : null;

  if (ready) {
    if (totalVialMg !== null && doseMg > totalVialMg) {
      warnings.push({
        code: 'doseAboveVial',
        severity: 'warning',
        params: { vials: totalVialMg > 0 ? doseMg / totalVialMg : 0 },
      });
    }
    if (isPositive(syringeCapacityMl) && volumeMl > syringeCapacityMl) {
      warnings.push({
        code: 'exceedsSyringe',
        severity: 'error',
        params: { volume: volumeMl, capacity: syringeCapacityMl },
      });
    }
    // A dose this small is hard to measure accurately. Insulin syringes are
    // read in units (2 units on U-100 = 0.02 mL); oil syringes are read in mL.
    const minMeasurableMl = measure === 'insulin' ? 2 / unitsPerMl : 0.02;
    if (volumeMl > 0 && volumeMl < minMeasurableMl) {
      warnings.push(
        measure === 'insulin'
          ? { code: 'doseTooSmall', severity: 'warning', params: { units } }
          : { code: 'doseTooSmallVolume', severity: 'warning', params: { volume: volumeMl } },
      );
    }
  }

  const ok = ready && !warnings.some((w) => w.severity === 'error');

  return {
    ok,
    concentrationMgPerMl,
    doseMg,
    volumeMl,
    units,
    unitsPerMl,
    totalVialMg,
    dosesPerVial,
    doseFromVolume,
    warnings,
  };
}

export interface PeptideInput {
  /** Amount of lyophilized powder in the vial, in `vialUnit`. */
  vialAmount: number;
  vialUnit: DoseUnit;
  /** Millilitres of bacteriostatic water used to dissolve the powder. */
  waterMl: number;
  /** Desired dose per injection. */
  doseAmount: number;
  doseUnit: DoseUnit;
  syringeType: SyringeTypeId;
  syringeCapacityMl: number;
  /** Inverse mode: a volume the user drew, in mL. */
  inverseVolumeMl?: number;
  /** Inverse mode: unit to express the derived dose in. */
  inverseDoseUnit?: DoseUnit;
}

/**
 * Peptides: powder is reconstituted with bacteriostatic water.
 *   concentration = vialAmount / waterMl
 *   volume        = dose / concentration
 */
export function calculatePeptide(input: PeptideInput): CalcResult {
  const warnings: CalcWarning[] = [];

  if (!isPositive(input.vialAmount)) warnings.push({ code: 'missingVial', severity: 'error' });
  if (!isPositive(input.waterMl)) warnings.push({ code: 'missingWater', severity: 'error' });
  if (!isPositive(input.doseAmount)) warnings.push({ code: 'missingDose', severity: 'error' });

  const totalVialMg = isPositive(input.vialAmount) ? toMg(input.vialAmount, input.vialUnit) : 0;
  const concentrationMgPerMl =
    isPositive(input.waterMl) && totalVialMg > 0 ? totalVialMg / input.waterMl : 0;
  const doseMg = isPositive(input.doseAmount) ? toMg(input.doseAmount, input.doseUnit) : 0;

  return assemble({
    concentrationMgPerMl,
    doseMg,
    totalVialMg: totalVialMg > 0 ? totalVialMg : null,
    unitsPerMl: unitsPerMlOf(input.syringeType),
    syringeCapacityMl: input.syringeCapacityMl,
    warnings,
    measure: 'insulin',
    inverseVolumeMl: input.inverseVolumeMl,
    inverseDoseUnit: input.inverseDoseUnit,
  });
}

export interface AnabolicInput {
  /** Strength of the oil in mg per mL (read from the label). */
  concentrationMgPerMl: number;
  doseAmount: number;
  doseUnit: DoseUnit;
  /** Optional vial size in mL, used to compute doses per vial. */
  vialMl: number | null;
  syringeType: SyringeTypeId;
  syringeCapacityMl: number;
  /** Inverse mode: a volume the user drew, in mL. */
  inverseVolumeMl?: number;
  /** Inverse mode: unit to express the derived dose in. */
  inverseDoseUnit?: DoseUnit;
}

/**
 * Anabolics: already dissolved in oil, so there is nothing to reconstitute.
 * The label gives the concentration directly.
 *   volume = dose / concentration
 */
export function calculateAnabolic(input: AnabolicInput): CalcResult {
  const warnings: CalcWarning[] = [];

  if (!isPositive(input.concentrationMgPerMl))
    warnings.push({ code: 'missingConcentration', severity: 'error' });
  if (!isPositive(input.doseAmount)) warnings.push({ code: 'missingDose', severity: 'error' });

  const doseMg = isPositive(input.doseAmount) ? toMg(input.doseAmount, input.doseUnit) : 0;
  const vialMl = input.vialMl !== null && isPositive(input.vialMl) ? input.vialMl : null;
  const totalVialMg =
    vialMl !== null && isPositive(input.concentrationMgPerMl)
      ? input.concentrationMgPerMl * vialMl
      : null;

  return assemble({
    concentrationMgPerMl: input.concentrationMgPerMl,
    doseMg,
    totalVialMg,
    unitsPerMl: unitsPerMlOf(input.syringeType),
    syringeCapacityMl: input.syringeCapacityMl,
    warnings,
    measure: 'volume',
    inverseVolumeMl: input.inverseVolumeMl,
    inverseDoseUnit: input.inverseDoseUnit,
  });
}
