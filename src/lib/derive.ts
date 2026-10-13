/**
 * Turns a finished calculation into the arithmetic that produced it, as ordered,
 * machine-readable steps.
 *
 * The UI renders these as the "working" — the line a nurse writes on a sticky
 * note — with the user's own numbers substituted. Like the engine, this module is
 * pure and text-free: a step carries a `kind` and numeric `params`, and the
 * component supplies the words. It returns `[]` whenever the answer was withheld,
 * so working is never shown for a result the app is not standing behind.
 */

import type { CalcResult, ModeId } from './calc';

export type DerivationKind = 'concentration' | 'volume' | 'units' | 'clicks';

export interface DerivationStep {
  kind: DerivationKind;
  /** Values substituted into the matching i18n template. Numbers, not text. */
  params: Record<string, number | string>;
}

export interface DerivationInput {
  mode: ModeId;
  /** Millilitres the vial was dissolved in (reconstituted workflows only). */
  waterMl: number;
}

/**
 * Ordered steps that reproduce the headline answer. Empty when `!result.ok`.
 *
 *  - reconstituted (`peptide`, `hormone`): concentration → volume → units
 *  - labelled oil (`anabolic`): volume only (there is no reconstitution step)
 *  - pen (`glp1`): volume → clicks
 */
export function buildDerivation(result: CalcResult, input: DerivationInput): DerivationStep[] {
  if (!result.ok) return [];

  const reconstituted = input.mode === 'peptide' || input.mode === 'hormone';
  const steps: DerivationStep[] = [];

  if (reconstituted) {
    steps.push({
      kind: 'concentration',
      params: {
        vial: result.totalVialBase ?? 0,
        water: input.waterMl,
        conc: result.concentrationPerMl,
      },
    });
  }

  steps.push({
    kind: 'volume',
    params: {
      dose: result.doseBase,
      conc: result.concentrationPerMl,
      volume: result.volumeMl,
    },
  });

  if (reconstituted) {
    steps.push({
      kind: 'units',
      params: { volume: result.volumeMl, perMl: result.unitsPerMl, units: result.units },
    });
  } else if (input.mode === 'glp1') {
    steps.push({
      kind: 'clicks',
      params: { volume: result.volumeMl, perMl: result.clicksPerMl, count: result.clicks },
    });
  }

  return steps;
}
