import { describe, expect, it } from 'vitest';
import {
  concentrationOf,
  convertMass,
  drawForDose,
  fromClicks,
  fromMl,
  fromUnits,
} from './convert';

describe('convertMass', () => {
  it('converts both ways between mg and mcg', () => {
    expect(convertMass(2500, 'mcg')).toEqual({ mg: 2.5, mcg: 2500 });
    expect(convertMass(2.5, 'mg')).toEqual({ mg: 2.5, mcg: 2500 });
  });

  it('leaves a zero alone', () => {
    expect(convertMass(0, 'mg').mcg).toBe(0);
  });
});

describe('draw conversions', () => {
  it('reads millilitres three ways at once', () => {
    // 0.25 mL is 25 graduations on a U-100 barrel and 25 clicks at 100 clicks/mL.
    expect(fromMl(0.25, 100, 100)).toEqual({ ml: 0.25, units: 25, clicks: 25 });
  });

  it('scales the graduations to the syringe in hand', () => {
    // The same 0.25 mL is 10 units on a U-40 syringe.
    expect(fromMl(0.25, 40).units).toBe(10);
  });

  it('goes back the other way from graduations', () => {
    expect(fromUnits(25, 100).ml).toBeCloseTo(0.25, 9);
    expect(fromUnits(10, 40).ml).toBeCloseTo(0.25, 9);
  });

  it('goes back from dial clicks', () => {
    expect(fromClicks(25, 100).ml).toBeCloseTo(0.25, 9);
    // A 72-click pen needs 18 clicks for the same volume.
    expect(fromClicks(18, 72).ml).toBeCloseTo(0.25, 9);
  });

  it('reports no clicks when the resolution is unknown', () => {
    expect(fromMl(0.25, 100).clicks).toBeNull();
    expect(fromMl(0.25, 100, 0).clicks).toBeNull();
  });

  it('never divides by zero', () => {
    expect(fromUnits(25, 0).ml).toBe(0);
    expect(fromClicks(25, 0).ml).toBe(0);
  });
});

describe('reconstitution arithmetic', () => {
  it('gives the strength of a mixed vial', () => {
    // 5 mg in 2 mL is 2.5 mg/mL.
    expect(concentrationOf(5, 2)).toBeCloseTo(2.5, 9);
    expect(concentrationOf(10, 1)).toBeCloseTo(10, 9);
  });

  it('gives the volume for a dose', () => {
    // 0.25 mg at 2.5 mg/mL is 0.1 mL.
    expect(drawForDose(0.25, 2.5)).toBeCloseTo(0.1, 9);
  });

  it('has nothing to say about an empty vial', () => {
    expect(concentrationOf(5, 0)).toBe(0);
    expect(drawForDose(0.25, 0)).toBe(0);
  });
});
