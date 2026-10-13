import { describe, expect, it } from 'vitest';
import { calculateAnabolic, calculatePeptide, type SyringeTypeId } from './calc';
import { buildDerivation, type DerivationStep } from './derive';

const syringe = (type: SyringeTypeId = 'U100', capacityMl = 1) => ({
  syringeType: type,
  syringeCapacityMl: capacityMl,
});

/** `params` are number-or-string in the type; these cases only ever use numbers. */
function numbers(step: DerivationStep): Record<string, number> {
  return step.params as Record<string, number>;
}

describe('buildDerivation', () => {
  it('shows concentration → volume → units for a reconstituted peptide', () => {
    const result = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 250,
      doseUnit: 'mcg',
      ...syringe(),
    });

    const steps = buildDerivation(result, { mode: 'peptide', waterMl: 2 });

    expect(steps.map((step) => step.kind)).toEqual(['concentration', 'volume', 'units']);
    expect(numbers(steps[0]).vial).toBeCloseTo(5, 9);
    expect(numbers(steps[0]).water).toBeCloseTo(2, 9);
    expect(numbers(steps[0]).conc).toBeCloseTo(2.5, 9);
    expect(numbers(steps[1]).dose).toBeCloseTo(0.25, 9);
    expect(numbers(steps[1]).volume).toBeCloseTo(0.1, 9);
    expect(numbers(steps[2]).perMl).toBe(100);
    expect(numbers(steps[2]).units).toBeCloseTo(10, 9);
  });

  it('shows only the volume for a labelled oil — there is no reconstitution step', () => {
    const result = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 500,
      doseUnit: 'mg',
      vialMl: 10,
      ...syringe('U100', 3),
    });

    const steps = buildDerivation(result, { mode: 'anabolic', waterMl: 0 });

    expect(steps.map((step) => step.kind)).toEqual(['volume']);
    expect(numbers(steps[0]).dose).toBeCloseTo(500, 9);
    expect(numbers(steps[0]).conc).toBeCloseTo(250, 9);
    expect(numbers(steps[0]).volume).toBeCloseTo(2, 9);
  });

  it('shows volume → clicks for a pen', () => {
    const result = calculateAnabolic({
      concentrationMgPerMl: 1,
      doseAmount: 0.25,
      doseUnit: 'mg',
      vialMl: 1.5,
      syringeType: 'U100',
      syringeCapacityMl: 1.5,
      measure: 'clicks',
      clicksPerMl: 100,
    });

    const steps = buildDerivation(result, { mode: 'glp1', waterMl: 0 });

    expect(steps.map((step) => step.kind)).toEqual(['volume', 'clicks']);
    expect(numbers(steps[1]).perMl).toBe(100);
    expect(numbers(steps[1]).count).toBeCloseTo(25, 9);
  });

  it('shows working that equals the answer it explains', () => {
    // The whole point: the figure in the last step is the figure the app shows.
    const result = calculatePeptide({
      vialAmount: 10,
      vialUnit: 'mg',
      waterMl: 3,
      doseAmount: 1,
      doseUnit: 'mg',
      ...syringe(),
    });
    const steps = buildDerivation(result, { mode: 'peptide', waterMl: 3 });
    const unitsStep = steps[steps.length - 1];

    expect(numbers(unitsStep).units).toBeCloseTo(result.units, 9);
    expect(numbers(steps[1]).volume).toBeCloseTo(result.volumeMl, 9);
  });

  it('shows nothing when the answer was withheld', () => {
    const result = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 0,
      doseAmount: 250,
      doseUnit: 'mcg',
      ...syringe(),
    });

    expect(result.ok).toBe(false);
    expect(buildDerivation(result, { mode: 'peptide', waterMl: 0 })).toEqual([]);
  });
});
