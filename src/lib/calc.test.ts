import { describe, expect, it } from 'vitest';
import {
  calculateAnabolic,
  calculatePeptide,
  fromMg,
  toMg,
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
    expect(toMg(250, 'mcg')).toBeCloseTo(0.25, 9);
    expect(toMg(1000, 'mcg')).toBeCloseTo(1, 9);
    expect(toMg(5, 'mg')).toBe(5);
  });

  it('converts milligrams back to the display unit', () => {
    expect(fromMg(0.25, 'mcg')).toBeCloseTo(250, 9);
    expect(fromMg(5, 'mg')).toBe(5);
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
    expect(r.concentrationMgPerMl).toBeCloseTo(2.5, 9);
    expect(r.doseMg).toBeCloseTo(0.25, 9);
    expect(r.volumeMl).toBeCloseTo(0.1, 9);
    expect(r.units).toBeCloseTo(10, 9);
    expect(r.totalVialMg).toBeCloseTo(5, 9);
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

    expect(r.concentrationMgPerMl).toBeCloseTo(5, 9);
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
    expect(r.totalVialMg).toBeNull();
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

    expect(r.totalVialMg).toBeCloseTo(2500, 9);
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

    expect(r.doseMg).toBeCloseTo(0.4, 9);
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
