import type { IconName } from '../components/Icon';
import type { MeasureSystem, ModeId } from '../lib/calc';

/**
 * Mode registry — the single place that decides which workflows exist.
 *
 * To add a new workflow (e.g. HGH, HCG, insulin, blends):
 *   1. add its id to `ModeId` in `src/lib/calc.ts` and write a `calculate*` fn,
 *   2. add a `ModeMeta` entry here (including its syringe setup),
 *   3. add the matching copy in `src/i18n/en.ts`, `sk.ts` and `es.ts`,
 *   4. render its form fields in `src/components/CalculatorForm.tsx`.
 *
 * The tabs, headings, syringe options and layout all render from this list, so
 * nothing else needs to change.
 *
 * Note: the syringe setup is per-mode. Peptides are drawn with an **insulin
 * syringe** (counted in units, tiny 0.3–3 mL barrels); anabolic oils are drawn
 * with a **plain mL syringe** (1–10 mL), where "units" mean nothing.
 */
export interface ModeMeta {
  id: ModeId;
  icon: IconName;
  /** How the drawn amount is read off the device for this workflow. */
  measure: MeasureSystem;
  /**
   * True when the workflow is drawn with an *insulin* syringe, so the scale
   * (U-100 / U-40 / U-50) is meaningful. Oils are read in mL on a plain barrel.
   */
  showSyringeScale: boolean;
  /** Syringe sizes (in mL) offered for this workflow. */
  capacities: readonly number[];
  /** Fallback used when a remembered capacity doesn't fit this workflow. */
  defaultCapacityMl: number;
}

export const MODES: readonly ModeMeta[] = [
  {
    id: 'peptide',
    icon: 'dna',
    measure: 'insulin',
    showSyringeScale: true,
    capacities: [0.3, 0.5, 1, 2, 3],
    defaultCapacityMl: 1,
  },
  {
    id: 'anabolic',
    icon: 'syringe',
    measure: 'volume',
    showSyringeScale: false,
    capacities: [1, 2, 3, 5, 10],
    defaultCapacityMl: 3,
  },
  {
    id: 'hormone',
    icon: 'sparkles',
    measure: 'volume',
    showSyringeScale: true,
    capacities: [0.3, 0.5, 1, 2, 3],
    defaultCapacityMl: 1,
  },
  {
    // GLP-1 is ready to use and dialled from a pen, so the answer is in clicks.
    // The capacity still matters: it is how much the pen holds.
    id: 'glp1',
    icon: 'pill',
    measure: 'clicks',
    showSyringeScale: false,
    capacities: [1, 1.5, 2, 3],
    defaultCapacityMl: 1.5,
  },
];

export const DEFAULT_MODE: ModeId = 'peptide';

/** Metadata for a workflow (falls back to the first mode if the id is unknown). */
export function modeMeta(id: ModeId): ModeMeta {
  return MODES.find((entry) => entry.id === id) ?? MODES[0];
}

/**
 * Returns the syringe capacity to use: the remembered one if it is valid for
 * this workflow, otherwise the mode's default. This keeps a 0.3 mL insulin
 * syringe from leaking into anabolic mode (and vice versa).
 */
export function resolveCapacity(id: ModeId, capacityMl: number): number {
  const meta = modeMeta(id);
  return meta.capacities.includes(capacityMl) ? capacityMl : meta.defaultCapacityMl;
}
