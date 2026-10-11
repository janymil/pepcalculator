/**
 * A deliberately simple one-compartment decay model for the half-life chart.
 *
 * This is a **visual aid**, not pharmacology software: it assumes instant
 * absorption, a single exponential elimination and no accumulation rules
 * beyond plain superposition. It exists to show *shape* ("this compound clears
 * fast, that one builds up"), and the UI says so. Pure maths, no React.
 */

/** One repeated-dose schedule for the chart. */
export interface PkSchedule {
  /** Dose in mg. */
  doseMg: number;
  /** Interval between doses, in hours (e.g. 24 for daily). */
  intervalHours: number;
  /** Elimination half-life in hours. */
  halfLifeHours: number;
  /** How many doses to simulate. */
  doses: number;
}

export interface PkPoint {
  /** Hours from the first dose. */
  hour: number;
  /** Modelled amount still present, in mg. */
  amountMg: number;
}

/** Modelled amount remaining after `hours`, for a single dose of `doseMg`. */
export function remainingAfter(
  doseMg: number,
  hours: number,
  halfLifeHours: number,
): number {
  if (halfLifeHours <= 0 || hours < 0) return hours < 0 ? 0 : doseMg;
  return doseMg * 0.5 ** (hours / halfLifeHours);
}

/** Amount still present at `hour` once a series of doses has been stacked. */
export function concentrationAt(schedule: PkSchedule, hour: number): number {
  const { doseMg, intervalHours, halfLifeHours, doses } = schedule;
  if (intervalHours <= 0 || halfLifeHours <= 0) return 0;

  let total = 0;
  for (let index = 0; index < doses; index += 1) {
    const since = hour - index * intervalHours;
    if (since >= 0) total += remainingAfter(doseMg, since, halfLifeHours);
  }
  return total;
}

/**
 * Samples `concentrationAt` every `stepHours` up to `totalHours`, which is what
 * the SVG chart draws. `totalHours` is inclusive of the final sample.
 */
export function buildCurve(schedule: PkSchedule, totalHours: number, stepHours = 1): PkPoint[] {
  if (stepHours <= 0 || totalHours <= 0) return [];
  const points: PkPoint[] = [];
  for (let hour = 0; hour <= totalHours + 1e-9; hour += stepHours) {
    points.push({ hour, amountMg: concentrationAt(schedule, hour) });
  }
  return points;
}

/** The peak value along a sampled curve (used to scale the chart's Y axis). */
export function peakOf(points: PkPoint[]): number {
  return points.reduce((max, point) => Math.max(max, point.amountMg), 0);
}

/**
 * Time in hours to fall below `fraction` of the peak after the last dose —
 * a convenience for the "when does it clear?" note under the chart.
 */
export function hoursToFractionOfPeak(halfLifeHours: number, fraction = 0.5): number {
  if (halfLifeHours <= 0) return 0;
  return (halfLifeHours * Math.log(1 / fraction)) / Math.LN2;
}
