/**
 * The canonical, hand-worked cases — one list, two consumers.
 *
 * It is the **single source of truth** for what the app claims. `calc.test.ts`
 * runs every example through the engine and asserts the drawing an expert would
 * write down, and the Reference page's "Verified examples" tab renders the very
 * same list to the user. The examples a user sees are the examples the build
 * enforces, so the "proof" cannot drift from reality.
 */

import {
  calculateAnabolic,
  calculateHormone,
  calculatePeptide,
  type AnabolicInput,
  type CalcResult,
  type ModeId,
  type PeptideInput,
} from './calc';

export type WorkedExampleId =
  | 'peptideStandard'
  | 'peptideHighDose'
  | 'hormoneIU'
  | 'anabolicOil'
  | 'glp1Pen';

export interface WorkedExampleExpected {
  /** The volume to draw, in mL. */
  volumeMl: number;
  /** Insulin graduations — the figure read off a barrel. */
  units?: number;
  /** Pen dial clicks. */
  clicks?: number;
}

export interface WorkedExample {
  id: WorkedExampleId;
  mode: ModeId;
  /** A reconstituted case (peptide or hormone). */
  reconstituted?: PeptideInput;
  /** A labelled case (oil or pen). */
  labelled?: AnabolicInput;
  /** What an expert would write down for this case. */
  expected: WorkedExampleExpected;
}

export const WORKED_EXAMPLES: readonly WorkedExample[] = [
  {
    id: 'peptideStandard',
    mode: 'peptide',
    reconstituted: {
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 250,
      doseUnit: 'mcg',
      syringeType: 'U100',
      syringeCapacityMl: 1,
    },
    // 5 mg / 2 mL = 2.5 mg/mL; 250 mcg = 0.25 mg -> 0.1 mL -> 10 units.
    expected: { volumeMl: 0.1, units: 10 },
  },
  {
    id: 'peptideHighDose',
    mode: 'peptide',
    reconstituted: {
      vialAmount: 10,
      vialUnit: 'mg',
      waterMl: 3,
      doseAmount: 1,
      doseUnit: 'mg',
      syringeType: 'U100',
      syringeCapacityMl: 1,
    },
    // 10 mg / 3 mL ≈ 3.333 mg/mL; 1 mg -> 0.3 mL -> 30 units.
    expected: { volumeMl: 0.3, units: 30 },
  },
  {
    id: 'hormoneIU',
    mode: 'hormone',
    reconstituted: {
      vialAmount: 10,
      vialUnit: 'IU',
      waterMl: 2,
      doseAmount: 2,
      doseUnit: 'IU',
      syringeType: 'U100',
      syringeCapacityMl: 1,
    },
    // 10 IU / 2 mL = 5 IU/mL; 2 IU -> 0.4 mL -> 40 units.
    expected: { volumeMl: 0.4, units: 40 },
  },
  {
    id: 'anabolicOil',
    mode: 'anabolic',
    labelled: {
      concentrationMgPerMl: 250,
      doseAmount: 500,
      doseUnit: 'mg',
      vialMl: 10,
      syringeType: 'U100',
      syringeCapacityMl: 3,
    },
    // 250 mg/mL and a 500 mg dose -> 2 mL. Read in mL, never in units.
    expected: { volumeMl: 2 },
  },
  {
    id: 'glp1Pen',
    mode: 'glp1',
    labelled: {
      concentrationMgPerMl: 1,
      doseAmount: 0.25,
      doseUnit: 'mg',
      vialMl: 1.5,
      syringeType: 'U100',
      syringeCapacityMl: 1.5,
      measure: 'clicks',
      clicksPerMl: 100,
    },
    // 1 mg/mL and a 0.25 mg dose -> 0.25 mL -> 25 clicks on a 100-click dial.
    expected: { volumeMl: 0.25, clicks: 25 },
  },
];

/** Runs one example through the engine, dispatching on its workflow. */
export function runExample(example: WorkedExample): CalcResult {
  if (example.reconstituted) {
    return example.mode === 'hormone'
      ? calculateHormone(example.reconstituted)
      : calculatePeptide(example.reconstituted);
  }
  if (example.labelled) return calculateAnabolic(example.labelled);
  throw new Error(`Worked example ${example.id} has no input`);
}
