import { describe, expect, it } from 'vitest';
import {
  buildCurve,
  concentrationAt,
  hoursToFractionOfPeak,
  peakOf,
  remainingAfter,
} from './pk';

describe('remainingAfter', () => {
  it('halves the amount after one half-life', () => {
    expect(remainingAfter(10, 4, 4)).toBeCloseTo(5, 10);
    expect(remainingAfter(10, 8, 4)).toBeCloseTo(2.5, 10);
  });

  it('returns the full dose at time zero and nothing in the past', () => {
    expect(remainingAfter(10, 0, 4)).toBe(10);
    expect(remainingAfter(10, -1, 4)).toBe(0);
  });

  it('falls back to "no decay" for a non-positive half-life', () => {
    expect(remainingAfter(10, 5, 0)).toBe(10);
  });
});

describe('concentrationAt', () => {
  const schedule = { doseMg: 10, intervalHours: 24, halfLifeHours: 24, doses: 5 };

  it('is zero before the first dose', () => {
    expect(concentrationAt(schedule, -1)).toBe(0);
  });

  it('returns just the first dose right after it is taken', () => {
    expect(concentrationAt(schedule, 0)).toBeCloseTo(10, 10);
  });

  it('accumulates across doses without decaying away', () => {
    // At hour 24 the first dose has halved (5) and the second (10) is added.
    expect(concentrationAt(schedule, 24)).toBeCloseTo(15, 10);
  });
});

describe('buildCurve / peakOf', () => {
  it('samples the whole window, inclusively', () => {
    const curve = buildCurve({ doseMg: 5, intervalHours: 24, halfLifeHours: 12, doses: 3 }, 48, 12);
    expect(curve.map((point) => point.hour)).toEqual([0, 12, 24, 36, 48]);
  });

  it('reports the highest point', () => {
    const curve = buildCurve({ doseMg: 5, intervalHours: 24, halfLifeHours: 12, doses: 3 }, 48, 6);
    expect(peakOf(curve)).toBeGreaterThanOrEqual(5);
  });

  it('handles an empty window', () => {
    expect(buildCurve({ doseMg: 5, intervalHours: 24, halfLifeHours: 12, doses: 1 }, 0)).toEqual([]);
  });
});

describe('hoursToFractionOfPeak', () => {
  it('matches the half-life for the 50% point', () => {
    expect(hoursToFractionOfPeak(24, 0.5)).toBeCloseTo(24, 6);
  });
});
