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

/**
 * Which workflow the user is in.
 *  - `peptide`  — lyophilized powder you reconstitute with water.
 *  - `anabolic` — ready-to-use oil, strength printed on the label.
 *  - `hormone`  — HGH, HCG and similar, usually labelled and dosed in **IU**.
 *  - `glp1`     — a ready-to-use GLP-1 solution dialled from a pen, in clicks.
 */
export type ModeId = 'peptide' | 'anabolic' | 'hormone' | 'glp1';

/**
 * Unit an amount is expressed in.
 *
 * `IU` is an **activity** unit, not a mass: one IU of HGH is a defined
 * biological effect, not a number of milligrams. The engine therefore works in
 * the base unit of each family (mg for mass, IU for activity) and refuses to mix
 * the two rather than inventing a conversion factor it cannot know.
 */
export type DoseUnit = 'mg' | 'mcg' | 'IU';

/** Units within one family convert into each other; families never do. */
export type UnitFamily = 'mass' | 'activity';

/** Which family a unit belongs to. */
export function unitFamily(unit: DoseUnit): UnitFamily {
  return unit === 'IU' ? 'activity' : 'mass';
}

/** True when two units describe the same kind of quantity. */
export function unitsCompatible(a: DoseUnit, b: DoseUnit): boolean {
  return unitFamily(a) === unitFamily(b);
}

/** Every unit the engine understands, in the order the UI offers them. */
export const DOSE_UNITS: readonly DoseUnit[] = ['mg', 'mcg', 'IU'];

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
  | 'mixedUnits'
  | 'doseAboveVial'
  | 'exceedsSyringe'
  | 'doseTooSmall'
  | 'doseTooSmallClicks'
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
  /**
   * Strength of the solution, in the **base unit of the vial's family** per mL:
   * mg/mL for mass, IU/mL for activity. See `toBase`.
   */
  concentrationPerMl: number;
  /** The requested dose, in the base unit of its family. */
  doseBase: number;
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
  /** Total amount available in one vial (base unit), when known. */
  totalVialBase: number | null;
  /** How many full doses fit in one vial, when known. */
  dosesPerVial: number | null;
  /**
   * The same volume expressed in dial **clicks** for a pen setup. Zero unless a
   * `clicksPerMl` was supplied.
   */
  clicks: number;
  /** Clicks per mL for the pen in use (0 when this is not a pen workflow). */
  clicksPerMl: number;
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

/**
 * Converts an amount into the **base unit of its family**: mg for mass, IU for
 * activity. There is deliberately no mg↔IU conversion — that needs a
 * substance-specific factor this app has no business guessing.
 */
export function toBase(amount: number, unit: DoseUnit): number {
  return unit === 'mcg' ? amount / 1000 : amount;
}

/** Converts a base-unit amount back into the requested unit. */
export function fromBase(value: number, unit: DoseUnit): number {
  return unit === 'mcg' ? value * 1000 : value;
}

/** A usable measurement must be a finite number greater than zero. */
export function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * How the drawn amount is read off the device:
 *  - `insulin` → an insulin syringe, counted in *units* (reconstituted peptides).
 *  - `volume`  → a plain mL syringe or barrel, counted in *millilitres*.
 *  - `clicks`  → a pen dial, counted in *clicks* (GLP-1 and similar).
 */
export type MeasureSystem = 'insulin' | 'volume' | 'clicks';

/**
 * How many dial clicks make one millilitre.
 *
 * This is a **property of the pen in front of the user**, not of any product, so
 * it is always an input with a plain default rather than a table of brands the
 * app could get wrong. 100 clicks/mL means one click is 0.01 mL.
 */
export const DEFAULT_CLICKS_PER_ML = 100;

interface AssembleArgs {
  concentrationPerMl: number;
  doseBase: number;
  totalVialBase: number | null;
  unitsPerMl: number;
  syringeCapacityMl: number;
  warnings: CalcWarning[];
  /** Decides which "too small to measure" message fits this workflow. */
  measure: MeasureSystem;
  /** Pen dial resolution, for a `clicks` workflow. */
  clicksPerMl?: number;
  /**
   * The vial and the dose were given in units from different families (say the
   * vial in IU and the dose in mg). Nothing can be drawn, so the result is
   * withheld rather than computed from a made-up conversion.
   */
  unitMismatch?: boolean;
  /** Inverse mode: a volume the user actually drew, in mL. */
  inverseVolumeMl?: number;
  /** Inverse mode: the unit to express `doseFromVolume` in. */
  inverseDoseUnit?: DoseUnit;
}

/** Shared tail-end of every calculation: derive volume, units and warnings. */
function assemble(args: AssembleArgs): CalcResult {
  const {
    concentrationPerMl,
    doseBase,
    totalVialBase,
    unitsPerMl,
    syringeCapacityMl,
    measure,
    inverseVolumeMl,
    inverseDoseUnit,
  } = args;
  const warnings = [...args.warnings];

  const ready = !args.unitMismatch && isPositive(concentrationPerMl) && isPositive(doseBase);

  const volumeMl = ready ? doseBase / concentrationPerMl : 0;
  const units = ready ? volumeMl * unitsPerMl : 0;
  const clicksPerMl = args.clicksPerMl ?? 0;
  const clicks = ready && isPositive(clicksPerMl) ? volumeMl * clicksPerMl : 0;
  const dosesPerVial =
    totalVialBase !== null && isPositive(doseBase) ? totalVialBase / doseBase : null;

  // Inverse mode: "I drew this much — what dose is that?"
  const doseFromVolume =
    inverseVolumeMl !== undefined && inverseDoseUnit !== undefined &&
    isPositive(concentrationPerMl) && isPositive(inverseVolumeMl)
      ? fromBase(concentrationPerMl * inverseVolumeMl, inverseDoseUnit)
      : null;

  if (ready) {
    if (totalVialBase !== null && doseBase > totalVialBase) {
      warnings.push({
        code: 'doseAboveVial',
        severity: 'warning',
        params: { vials: totalVialBase > 0 ? doseBase / totalVialBase : 0 },
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
    // read in units (2 units on U-100 = 0.02 mL); a pen dials whole clicks; oil
    // syringes are read in mL.
    const minMeasurableMl =
      measure === 'insulin'
        ? 2 / unitsPerMl
        : measure === 'clicks' && isPositive(clicksPerMl)
          ? 1 / clicksPerMl
          : 0.02;
    if (volumeMl > 0 && volumeMl < minMeasurableMl) {
      warnings.push(
        measure === 'clicks'
          ? { code: 'doseTooSmallClicks', severity: 'warning', params: { clicks } }
          : measure === 'insulin'
            ? { code: 'doseTooSmall', severity: 'warning', params: { units } }
            : { code: 'doseTooSmallVolume', severity: 'warning', params: { volume: volumeMl } },
      );
    }
  }

  const ok = ready && !warnings.some((w) => w.severity === 'error');

  return {
    ok,
    concentrationPerMl,
    doseBase,
    volumeMl,
    units,
    unitsPerMl,
    clicks,
    clicksPerMl,
    totalVialBase,
    dosesPerVial,
    doseFromVolume,
    warnings,
  };
}

export interface ReconstitutedInput {
  /** Amount in the vial, in `vialUnit` (mg, mcg or IU). */
  vialAmount: number;
  vialUnit: DoseUnit;
  /** Millilitres of bacteriostatic water used to dissolve it. */
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

/** The peptide workflow's input, kept under its original name. */
export type PeptideInput = ReconstitutedInput;

/**
 * Shared engine for anything dissolved before drawing (peptides and hormones
 * alike):
 *   concentration = vialAmount / waterMl
 *   volume        = dose / concentration
 *
 * The two workflows differ only in how the drawn amount is read off the device,
 * which is what `measure` selects.
 */
function reconstituted(input: ReconstitutedInput, measure: MeasureSystem): CalcResult {
  const warnings: CalcWarning[] = [];

  const hasVial = isPositive(input.vialAmount);
  const hasDose = isPositive(input.doseAmount);

  if (!hasVial) warnings.push({ code: 'missingVial', severity: 'error' });
  if (!isPositive(input.waterMl)) warnings.push({ code: 'missingWater', severity: 'error' });
  if (!hasDose) warnings.push({ code: 'missingDose', severity: 'error' });

  // A vial in IU and a dose in mg (or the reverse) cannot be reconciled, so say
  // so plainly rather than dividing two unrelated quantities.
  const unitMismatch = hasVial && hasDose && !unitsCompatible(input.vialUnit, input.doseUnit);
  if (unitMismatch) {
    warnings.push({
      code: 'mixedUnits',
      severity: 'error',
      params: { vialUnit: input.vialUnit, doseUnit: input.doseUnit },
    });
  }

  const totalVialBase = hasVial ? toBase(input.vialAmount, input.vialUnit) : 0;
  const concentrationPerMl =
    !unitMismatch && isPositive(input.waterMl) && totalVialBase > 0
      ? totalVialBase / input.waterMl
      : 0;
  const doseBase = hasDose ? toBase(input.doseAmount, input.doseUnit) : 0;

  return assemble({
    concentrationPerMl,
    doseBase,
    totalVialBase: totalVialBase > 0 ? totalVialBase : null,
    unitsPerMl: unitsPerMlOf(input.syringeType),
    syringeCapacityMl: input.syringeCapacityMl,
    warnings,
    measure,
    unitMismatch,
    inverseVolumeMl: input.inverseVolumeMl,
    inverseDoseUnit: input.inverseDoseUnit,
  });
}

/** Peptides: drawn with an insulin syringe and read in its unit graduations. */
export function calculatePeptide(input: PeptideInput): CalcResult {
  return reconstituted(input, 'insulin');
}

/**
 * Hormones (HGH, HCG…): labelled and dosed in **IU**, so the headline answer is
 * the volume in mL. The graduation count is still shown alongside it, because
 * that is what the user reads off the barrel — but labelling it "units" would
 * collide with the IU printed on the vial, which is exactly the confusion this
 * workflow exists to avoid.
 */
export function calculateHormone(input: PeptideInput): CalcResult {
  return reconstituted(input, 'volume');
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
  /**
   * How the draw is read. Defaults to `volume` (a plain mL barrel); a GLP-1 pen
   * passes `clicks`, which also needs `clicksPerMl`.
   */
  measure?: MeasureSystem;
  /** Pen dial resolution, for a `clicks` workflow. */
  clicksPerMl?: number;
  /** Inverse mode: a volume the user drew, in mL. */
  inverseVolumeMl?: number;
  /** Inverse mode: unit to express the derived dose in. */
  inverseDoseUnit?: DoseUnit;
}

/**
 * Suggests a water volume that makes the draw easier to read.
 *
 * "Use more water" is only useful advice if it comes with a number, so this
 * works backwards from a target: find the concentration that would put
 * `targetUnits` on the syringe, then round the water up to the next 0.5 mL step
 * (about what a syringe can actually measure). Returns null when the inputs are
 * unusable, or when more water would not be an improvement on what the user
 * already used.
 */
export interface WaterSuggestion {
  /** The rounder water volume to try, in mL. */
  waterMl: number;
  /** The volume that would then be drawn, in mL. */
  volumeMl: number;
  /** The insulin units that would then show on the syringe. */
  units: number;
}

export function suggestWaterMl(input: {
  vialAmount: number;
  vialUnit: DoseUnit;
  doseAmount: number;
  doseUnit: DoseUnit;
  unitsPerMl: number;
  /** How many units we would like to see on the syringe. Default 10. */
  targetUnits?: number;
  /** Never suggest more than this, because a vial only holds so much. Default 10 mL. */
  maxWaterMl?: number;
  /** What the user is using now — a suggestion must beat it to be worth showing. */
  currentWaterMl?: number;
}): WaterSuggestion | null {
  const { vialAmount, vialUnit, doseAmount, doseUnit, unitsPerMl } = input;
  const targetUnits = input.targetUnits ?? 10;
  const maxWaterMl = input.maxWaterMl ?? 10;

  if (!isPositive(unitsPerMl) || !isPositive(targetUnits)) return null;

  // The suggestion is simple arithmetic within one unit family, so a mismatched
  // pair (vial in IU, dose in mg) gets nothing rather than a nonsense number.
  if (!unitsCompatible(vialUnit, doseUnit)) return null;

  const totalBase = toBase(vialAmount, vialUnit);
  const doseBase = toBase(doseAmount, doseUnit);
  if (!isPositive(totalBase) || !isPositive(doseBase)) return null;

  // The volume that shows `targetUnits`, and the concentration it implies.
  const targetVolumeMl = targetUnits / unitsPerMl;
  const concentrationNeeded = doseBase / targetVolumeMl;
  if (!isPositive(concentrationNeeded)) return null;

  const idealWaterMl = totalBase / concentrationNeeded;
  if (!Number.isFinite(idealWaterMl) || idealWaterMl <= 0) return null;

  const rounded = Math.min(Math.ceil(idealWaterMl * 2) / 2, maxWaterMl);
  if (rounded < 0.5) return null;
  if (input.currentWaterMl !== undefined && rounded <= input.currentWaterMl + 0.01) return null;

  const volumeMl = doseBase / (totalBase / rounded);
  const units = volumeMl * unitsPerMl;
  if (!Number.isFinite(units) || units <= 0) return null;

  return { waterMl: rounded, volumeMl, units };
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

  // A label in mg/mL can never express an IU dose — the two are different kinds
  // of quantity, so the calculation is withheld rather than fudged.
  const unitMismatch = isPositive(input.doseAmount) && input.doseUnit === 'IU';
  if (unitMismatch) {
    warnings.push({
      code: 'mixedUnits',
      severity: 'error',
      params: { vialUnit: 'mg', doseUnit: 'IU' },
    });
  }

  const doseBase = isPositive(input.doseAmount) ? toBase(input.doseAmount, input.doseUnit) : 0;
  const vialMl = input.vialMl !== null && isPositive(input.vialMl) ? input.vialMl : null;
  const totalVialBase =
    vialMl !== null && isPositive(input.concentrationMgPerMl)
      ? input.concentrationMgPerMl * vialMl
      : null;

  return assemble({
    concentrationPerMl: input.concentrationMgPerMl,
    doseBase,
    totalVialBase,
    unitsPerMl: unitsPerMlOf(input.syringeType),
    syringeCapacityMl: input.syringeCapacityMl,
    warnings,
    measure: input.measure ?? 'volume',
    clicksPerMl: input.clicksPerMl,
    unitMismatch,
    inverseVolumeMl: input.inverseVolumeMl,
    inverseDoseUnit: input.inverseDoseUnit,
  });
}
