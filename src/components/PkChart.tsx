import { buildCurve, concentrationAt, peakOf, type PkPoint, type PkSchedule } from '../lib/pk';

/** How many simulation hours the decay chart shows by default. */
export const PK_CHART_HOURS = 72;
/** Sampling resolution: one point every this many hours. */
export const PK_CHART_STEP = 2;
const CHART_W = 240;
const CHART_H = 56;
/** Hours between the grid lines drawn behind the curve. */
const GRID_HOURS = 24;

interface PkChartProps {
  schedule: PkSchedule;
  ariaLabel: string;
  /** How many hours to simulate from the first dose. */
  totalHours?: number;
  stepHours?: number;
}

/**
 * A small, honest decay curve for one dosing protocol: the modelled amount still
 * present if the same dose is repeated on its cadence. It is an illustration of
 * the arithmetic in `lib/pk.ts`, not a prediction of what happens in a body.
 */
export function PkChart({
  schedule,
  ariaLabel,
  totalHours = PK_CHART_HOURS,
  stepHours = PK_CHART_STEP,
}: PkChartProps) {
  const curve: PkPoint[] = buildCurve(schedule, totalHours, stepHours);
  const peak = peakOf(curve) || 1;

  const x = (hour: number) => (hour / totalHours) * CHART_W;
  const y = (amount: number) => CHART_H - (amount / peak) * (CHART_H - 6) - 3;
  const path = curve.map((point) => `${x(point.hour)},${y(point.amountMg)}`).join(' ');

  // Faint day gridlines, plus a dot at the start of each modelled dose.
  const gridHours: number[] = [];
  for (let hour = 0; hour <= totalHours; hour += GRID_HOURS) gridHours.push(hour);

  const doseHours: number[] = [];
  if (schedule.intervalHours > 0) {
    for (let index = 0; index < schedule.doses; index += 1) {
      const hour = index * schedule.intervalHours;
      if (hour <= totalHours) doseHours.push(hour);
    }
  }

  return (
    <svg
      className="ref__chart"
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
    >
      {gridHours.map((hour) => (
        <line key={hour} className="ref__grid" x1={x(hour)} y1={0} x2={x(hour)} y2={CHART_H} />
      ))}
      <polyline className="ref__chart-area" points={`0,${CHART_H} ${path} ${CHART_W},${CHART_H}`} />
      <polyline className="ref__chart-line" points={path} />
      <line className="ref__axis" x1={0} y1={CHART_H} x2={CHART_W} y2={CHART_H} />
      {doseHours.map((hour) => (
        <circle
          key={hour}
          className="ref__dose"
          cx={x(hour)}
          cy={y(concentrationAt(schedule, hour))}
          r={2.4}
        />
      ))}
    </svg>
  );
}
