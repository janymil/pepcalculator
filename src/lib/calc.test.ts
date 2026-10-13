import { describe, expect, it } from 'vitest';
import {
  calculateAnabolic,
  calculateHormone,
  calculatePeptide,
  fromBase,
  selfCheckAgrees,
  suggestWaterMl,
  toBase,
  unitFamily,
  unitsCompatible,
  unitsPerMlOf,
  type SyringeTypeId,
} from './calc';

/** Small helper so every test only has to describe the syringe once. */
const syringe = (type: SyringeTypeId = 'U100', capacityMl = 1) => ({
  syringeType: type,
  syringeCapacityMl: capacityMl,
});

describe('unit helpers', () => {
  it('converts micrograms to milligrams', () => {
    expect(toBase(250, 'mcg')).toBeCloseTo(0.25, 9);
    expect(toBase(1000, 'mcg')).toBeCloseTo(1, 9);
    expect(toBase(5, 'mg')).toBe(5);
  });

  it('converts milligrams back to the display unit', () => {
    expect(fromBase(0.25, 'mcg')).toBeCloseTo(250, 9);
    expect(fromBase(5, 'mg')).toBe(5);
  });

  it('knows the units-per-mL of each syringe scale', () => {
    expect(unitsPerMlOf('U100')).toBe(100);
    expect(unitsPerMlOf('U40')).toBe(40);
    expect(unitsPerMlOf('U50')).toBe(50);
  });
});

describe('calculatePeptide', () => {
  it('computes concentration, volume, units and doses per vial', () => {
    // 5 mg in a vial, 2 mL of water -> 2.5 mg/mL (2500 mcg/mL)
    // desired dose 250 mcg = 0.25 mg -> 0.1 mL -> 10 units on a U-100 syringe
    const r = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 250,
      doseUnit: 'mcg',
      ...syringe(),
    });

    expect(r.ok).toBe(true);
    expect(r.concentrationPerMl).toBeCloseTo(2.5, 9);
    expect(r.doseBase).toBeCloseTo(0.25, 9);
    expect(r.volumeMl).toBeCloseTo(0.1, 9);
    expect(r.units).toBeCloseTo(10, 9);
    expect(r.totalVialBase).toBeCloseTo(5, 9);
    expect(r.dosesPerVial).toBeCloseTo(20, 9);
    expect(r.warnings).toHaveLength(0);
  });

  it('accepts the vial amount in micrograms', () => {
    // 5000 mcg (= 5 mg) in 1 mL of water -> 5 mg/mL; 1 mg dose -> 0.2 mL -> 20 units
    const r = calculatePeptide({
      vialAmount: 5000,
      vialUnit: 'mcg',
      waterMl: 1,
      doseAmount: 1,
      doseUnit: 'mg',
      ...syringe(),
    });

    expect(r.concentrationPerMl).toBeCloseTo(5, 9);
    expect(r.volumeMl).toBeCloseTo(0.2, 9);
    expect(r.units).toBeCloseTo(20, 9);
  });

  it('scales the units for a U-40 syringe', () => {
    // 5 mg in 1 mL -> 5 mg/mL; 1 mg dose -> 0.2 mL -> 8 units on U-40
    const r = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 1,
      doseAmount: 1,
      doseUnit: 'mg',
      ...syringe('U40'),
    });

    expect(r.unitsPerMl).toBe(40);
    expect(r.units).toBeCloseTo(8, 9);
  });

  it('reports blocking errors while inputs are missing', () => {
    const r = calculatePeptide({
      vialAmount: 0,
      vialUnit: 'mg',
      waterMl: 0,
      doseAmount: 0,
      doseUnit: 'mg',
      ...syringe(),
    });

    expect(r.ok).toBe(false);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('missingVial');
    expect(codes).toContain('missingWater');
    expect(codes).toContain('missingDose');
    expect(r.volumeMl).toBe(0);
  });

  it('warns when the volume does not fit the syringe', () => {
    // 10 mg in 1 mL -> 10 mg/mL; 5 mg dose -> 0.5 mL > 0.3 mL syringe
    const r = calculatePeptide({
      vialAmount: 10,
      vialUnit: 'mg',
      waterMl: 1,
      doseAmount: 5,
      doseUnit: 'mg',
      ...syringe('U100', 0.3),
    });

    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.code === 'exceedsSyringe')).toBe(true);
  });

  it('warns when the dose is larger than the vial contents', () => {
    const r = calculatePeptide({
      vialAmount: 2,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 5,
      doseUnit: 'mg',
      ...syringe('U100', 3),
    });

    expect(r.warnings.some((w) => w.code === 'doseAboveVial')).toBe(true);
  });

  it('warns when the resulting dose is too small to measure', () => {
    // 5 mg in 10 mL -> 0.5 mg/mL; 10 mcg = 0.01 mg -> 0.02 mL -> 2 units (borderline)
    // lower it further to 5 mcg -> 0.01 mL -> 1 unit
    const r = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 10,
      doseAmount: 5,
      doseUnit: 'mcg',
      ...syringe(),
    });

    expect(r.warnings.some((w) => w.code === 'doseTooSmall')).toBe(true);
  });

  it('reports a too-small dose in units (not millilitres) for insulin syringes', () => {
    const r = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 10,
      doseAmount: 5,
      doseUnit: 'mcg',
      ...syringe(),
    });

    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('doseTooSmall');
    expect(codes).not.toContain('doseTooSmallVolume');
  });
});

describe('calculateAnabolic', () => {
  it('converts a dose into volume using the label concentration', () => {
    // 250 mg/mL oil, 500 mg dose -> 2 mL -> 200 units on U-100
    const r = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 500,
      doseUnit: 'mg',
      vialMl: null,
      ...syringe('U100', 3),
    });

    expect(r.ok).toBe(true);
    expect(r.volumeMl).toBeCloseTo(2, 9);
    expect(r.units).toBeCloseTo(200, 9);
    expect(r.totalVialBase).toBeNull();
    expect(r.dosesPerVial).toBeNull();
  });

  it('computes doses per vial when a vial size is given', () => {
    // 250 mg/mL in a 10 mL vial -> 2500 mg; 250 mg dose -> 10 doses
    const r = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 250,
      doseUnit: 'mg',
      vialMl: 10,
      ...syringe('U100', 3),
    });

    expect(r.totalVialBase).toBeCloseTo(2500, 9);
    expect(r.dosesPerVial).toBeCloseTo(10, 9);
    expect(r.volumeMl).toBeCloseTo(1, 9);
  });

  it('supports microgram doses', () => {
    // 200 mg/mL, 400 mcg = 0.4 mg -> 0.002 mL
    const r = calculateAnabolic({
      concentrationMgPerMl: 200,
      doseAmount: 400,
      doseUnit: 'mcg',
      vialMl: null,
      ...syringe('U100', 1),
    });

    expect(r.doseBase).toBeCloseTo(0.4, 9);
    expect(r.volumeMl).toBeCloseTo(0.002, 9);
  });

  it('flags a missing concentration as an error', () => {
    const r = calculateAnabolic({
      concentrationMgPerMl: 0,
      doseAmount: 250,
      doseUnit: 'mg',
      vialMl: null,
      ...syringe(),
    });

    expect(r.ok).toBe(false);
    expect(r.warnings.map((w) => w.code)).toContain('missingConcentration');
  });

  it('warns in millilitres (not units) when an oil dose is too small', () => {
    // 250 mg/mL with a 1 mg dose -> 0.004 mL, below the 0.02 mL oil threshold.
    const r = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 1,
      doseUnit: 'mg',
      vialMl: null,
      ...syringe('U100', 3),
    });

    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('doseTooSmallVolume');
    expect(codes).not.toContain('doseTooSmall');
    expect(
      r.warnings.find((w) => w.code === 'doseTooSmallVolume')?.params?.volume,
    ).toBeCloseTo(0.004, 9);
  });

  it('does not warn about a normal oil dose', () => {
    const r = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 250,
      doseUnit: 'mg',
      vialMl: 10,
      ...syringe('U100', 3),
    });

    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});

describe('inverse mode (draw → dose)', () => {
  it('turns a drawn volume back into a dose for a peptide', () => {
    // 5 mg / 2 mL = 2.5 mg/mL; drawing 0.1 mL -> 0.25 mg -> 250 mcg.
    const r = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 250,
      doseUnit: 'mcg',
      ...syringe(),
      inverseVolumeMl: 0.1,
      inverseDoseUnit: 'mcg',
    });

    expect(r.doseFromVolume).toBeCloseTo(250, 6);
  });

  it('turns a drawn volume back into a dose for an oil', () => {
    const r = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 250,
      doseUnit: 'mg',
      vialMl: 10,
      ...syringe('U100', 3),
      inverseVolumeMl: 0.5,
      inverseDoseUnit: 'mg',
    });

    expect(r.doseFromVolume).toBeCloseTo(125, 6);
  });

  it('has no answer without a volume or concentration', () => {
    const noVolume = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 250,
      doseUnit: 'mg',
      vialMl: 10,
      ...syringe('U100', 3),
    });
    expect(noVolume.doseFromVolume).toBeNull();

    const noConcentration = calculateAnabolic({
      concentrationMgPerMl: 0,
      doseAmount: 250,
      doseUnit: 'mg',
      vialMl: 10,
      ...syringe('U100', 3),
      inverseVolumeMl: 1,
      inverseDoseUnit: 'mg',
    });
    expect(noConcentration.doseFromVolume).toBeNull();
  });
});

describe('suggestWaterMl', () => {
  it('works backwards from the units you would like to see', () => {
    // 5 mg in 10 mL puts a 50 mcg dose at 10 units on a U-100 syringe.
    const suggestion = suggestWaterMl({
      vialAmount: 5,
      vialUnit: 'mg',
      doseAmount: 50,
      doseUnit: 'mcg',
      unitsPerMl: 100,
      currentWaterMl: 2,
    });

    expect(suggestion?.waterMl).toBe(10);
    expect(suggestion?.volumeMl).toBeCloseTo(0.1, 6);
    expect(suggestion?.units).toBeCloseTo(10, 6);
  });

  it('stays quiet when what the user already used is just as good', () => {
    const suggestion = suggestWaterMl({
      vialAmount: 5,
      vialUnit: 'mg',
      doseAmount: 50,
      doseUnit: 'mcg',
      unitsPerMl: 100,
      currentWaterMl: 10,
    });

    expect(suggestion).toBeNull();
  });

  it('never suggests more water than the cap', () => {
    const suggestion = suggestWaterMl({
      vialAmount: 5,
      vialUnit: 'mg',
      doseAmount: 10,
      doseUnit: 'mcg',
      unitsPerMl: 100,
    });

    expect(suggestion?.waterMl).toBe(10);
  });

  it('has nothing to suggest without usable numbers', () => {
    const base = { vialUnit: 'mg', doseAmount: 250, doseUnit: 'mcg', unitsPerMl: 100 } as const;

    expect(suggestWaterMl({ ...base, vialAmount: 0 })).toBeNull();
    expect(suggestWaterMl({ ...base, vialAmount: 5, doseAmount: 0 })).toBeNull();
    expect(suggestWaterMl({ ...base, vialAmount: 5, unitsPerMl: 0 })).toBeNull();
  });
});

describe('unit families (IU is not a mass)', () => {
  it('knows which units belong together', () => {
    expect(unitFamily('mg')).toBe('mass');
    expect(unitFamily('mcg')).toBe('mass');
    expect(unitFamily('IU')).toBe('activity');

    expect(unitsCompatible('mg', 'mcg')).toBe(true);
    expect(unitsCompatible('IU', 'IU')).toBe(true);
    expect(unitsCompatible('IU', 'mcg')).toBe(false);
    expect(unitsCompatible('mg', 'IU')).toBe(false);
  });

  it('treats IU as its own base unit, never converting it to mg', () => {
    // 2 IU is 2 IU. Inventing a mass here is exactly what must not happen.
    expect(toBase(2, 'IU')).toBe(2);
    expect(fromBase(2, 'IU')).toBe(2);
    expect(toBase(2500, 'mcg')).toBeCloseTo(2.5, 9);
  });
});

describe('calculateHormone (HGH / HCG dosed in IU)', () => {
  const input = {
    vialAmount: 10,
    vialUnit: 'IU' as const,
    waterMl: 1,
    doseAmount: 2,
    doseUnit: 'IU' as const,
    syringeType: 'U100' as const,
    syringeCapacityMl: 1,
  };

  it('converts an IU dose into a volume, and that volume into graduations', () => {
    const result = calculateHormone(input);

    expect(result.ok).toBe(true);
    expect(result.concentrationPerMl).toBeCloseTo(10, 9);
    expect(result.doseBase).toBeCloseTo(2, 9);
    expect(result.volumeMl).toBeCloseTo(0.2, 9);
    // 0.2 mL on a U-100 barrel is the 20 mark — what the user actually reads.
    expect(result.units).toBeCloseTo(20, 9);
    expect(result.totalVialBase).toBeCloseTo(10, 9);
    expect(result.dosesPerVial).toBeCloseTo(5, 9);
    expect(result.warnings).toHaveLength(0);
  });

  it('still reads a hormone in mL if the vial is labelled in mass', () => {
    const result = calculateHormone({ ...input, vialUnit: 'mg', doseUnit: 'mcg', doseAmount: 500 });

    expect(result.ok).toBe(true);
    expect(result.concentrationPerMl).toBeCloseTo(10, 9);
  });

  it('refuses to mix IU with mg rather than inventing a conversion', () => {
    const result = calculateHormone({ ...input, doseAmount: 2, doseUnit: 'mg' });

    expect(result.ok).toBe(false);
    expect(result.volumeMl).toBe(0);
    expect(result.warnings.map((warning) => warning.code)).toContain('mixedUnits');
    // The message has to name both units, or it cannot be acted on.
    expect(result.warnings[result.warnings.length - 1].params).toEqual({
      vialUnit: 'IU',
      doseUnit: 'mg',
    });
  });

  it('keeps an oil from being dosed in IU at all', () => {
    const result = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 2,
      doseUnit: 'IU',
      vialMl: 10,
      syringeType: 'U100',
      syringeCapacityMl: 3,
    });

    expect(result.ok).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toContain('mixedUnits');
  });

  it('has nothing to suggest when the vial and the dose disagree on family', () => {
    expect(
      suggestWaterMl({
        vialAmount: 10,
        vialUnit: 'IU',
        doseAmount: 250,
        doseUnit: 'mcg',
        unitsPerMl: 100,
      }),
    ).toBeNull();
  });
});

describe('calculateAnabolic as a pen (dialled in clicks)', () => {
  const pen = {
    concentrationMgPerMl: 1,
    doseAmount: 0.25,
    doseUnit: 'mg' as const,
    vialMl: 1.5,
    syringeType: 'U100' as const,
    syringeCapacityMl: 1.5,
    measure: 'clicks' as const,
    clicksPerMl: 100,
  };

  it('turns a dose into a volume, and that volume into dial clicks', () => {
    const result = calculateAnabolic(pen);

    expect(result.ok).toBe(true);
    expect(result.volumeMl).toBeCloseTo(0.25, 9);
    // 0.25 mg at 1 mg/mL is 0.25 mL, which is 25 clicks on a 100-click dial.
    expect(result.clicks).toBeCloseTo(25, 9);
    expect(result.clicksPerMl).toBe(100);
  });

  it('reports clicks at whatever the pen’s own resolution is', () => {
    // A 72-click pen needs 18 clicks for the same 0.25 mL.
    expect(calculateAnabolic({ ...pen, clicksPerMl: 72 }).clicks).toBeCloseTo(18, 9);
  });

  it('warns when the dose is less than one click', () => {
    // 0.005 mg = 0.005 mL = 0.5 clicks — not diallable.
    const result = calculateAnabolic({ ...pen, doseAmount: 0.005 });

    expect(result.ok).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toContain('doseTooSmallClicks');
  });

  it('reports no clicks at all when it is not a pen setup', () => {
    const result = calculateAnabolic({ ...pen, measure: 'volume', clicksPerMl: undefined });

    expect(result.clicks).toBe(0);
    expect(result.clicksPerMl).toBe(0);
  });
});

describe('self-check', () => {
  it('agrees with itself on a normal reconstituted case', () => {
    const result = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 250,
      doseUnit: 'mcg',
      ...syringe(),
    });

    expect(result.selfCheck).toBe('ok');
    expect(result.warnings.map((warning) => warning.code)).not.toContain('internalMismatch');
  });

  it('uses a relative tolerance, so a tiny draw is not flagged', () => {
    // 2 units on a U-100 barrel is 0.02 mL — an absolute epsilon meant for mL
    // draws would wrongly call that a mismatch.
    expect(selfCheckAgrees(0.02, 0.0200000001)).toBe(true);
    expect(selfCheckAgrees(10, 10.000001)).toBe(false);
  });

  it('marks a labelled workflow as skipped — there is only one honest route', () => {
    const result = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 500,
      doseUnit: 'mg',
      vialMl: 10,
      syringeType: 'U100',
      syringeCapacityMl: 3,
    });

    expect(result.selfCheck).toBe('skipped');
  });

  it('is skipped while the inputs are still incomplete', () => {
    const result = calculatePeptide({
      vialAmount: 0,
      vialUnit: 'mg',
      waterMl: 0,
      doseAmount: 0,
      doseUnit: 'mg',
      ...syringe(),
    });

    expect(result.selfCheck).toBe('skipped');
  });
});

