import { describe, expect, it } from 'vitest';
import { costForDoses, costPerDose, costPerMonth, isLowStock, planCost } from './cost';

describe('costPerDose', () => {
  it('divides the vial price by how many doses it holds', () => {
    expect(costPerDose(50, 20)).toBe(2.5);
  });

  it('returns null without a price or without doses', () => {
    expect(costPerDose(undefined, 20)).toBeNull();
    expect(costPerDose(0, 20)).toBeNull();
    expect(costPerDose(50, 0)).toBeNull();
  });
});

describe('costForDoses / planCost', () => {
  it('multiplies a per-dose cost across the doses left', () => {
    expect(costForDoses(2.5, 8)).toBe(20);
  });

  it('projects the cost of finishing a plan from the vial capacity', () => {
    // €50 vial holding 20 doses, a 30-dose plan -> 30 x 2.5 = 75.
    expect(planCost(50, 30, 20)).toBe(75);
  });

  it('has no answer for an ongoing plan or missing price', () => {
    expect(planCost(50, null, 20)).toBeNull();
    expect(planCost(undefined, 30, 20)).toBeNull();
  });
});

describe('isLowStock', () => {
  it('flags a nearly-empty vial but not an ongoing one', () => {
    expect(isLowStock(2)).toBe(true);
    expect(isLowStock(10)).toBe(false);
    expect(isLowStock(null)).toBe(false);
  });
});

describe('costPerMonth', () => {
  it('turns a per-dose cost and a weekly cadence into a monthly figure', () => {
    // Seven doses a week at €1 each -> 7 x 52 / 12.
    expect(costPerMonth(1, 7)).toBe(30.33);
  });

  it('handles a twice-daily protocol', () => {
    expect(costPerMonth(2.5, 14)).toBe(151.67);
  });

  it('has no answer without a price or a cadence', () => {
    expect(costPerMonth(null, 7)).toBeNull();
    expect(costPerMonth(0, 7)).toBeNull();
    expect(costPerMonth(1, 0)).toBeNull();
  });
});
