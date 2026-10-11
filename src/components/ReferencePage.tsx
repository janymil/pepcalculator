import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { buildCurve, concentrationAt, peakOf } from '../lib/pk';
import { COMPOUNDS, formatRange, type CompoundClass, type CompoundReference } from '../lib/reference';
import { UnitConverter } from './UnitConverter';

/** How many simulation hours the tiny decay chart shows. */
const CHART_HOURS = 72;
const CHART_STEP = 2;
const CHART_W = 240;
const CHART_H = 56;

interface DecayChartProps {
  compound: CompoundReference;
  ariaLabel: string;
}

/**
 * A small, honest decay curve for one compound: the modelled amount still
 * present if a single typical dose is repeated on the compound's cadence. It is
 * labelled as an illustration, not a prediction.
 */
function DecayChart({ compound, ariaLabel }: DecayChartProps) {
  // A representative dose: the midpoint of the cited range, converted to mg.
  const midMg = (compound.typicalLowMg + compound.typicalHighMg) / 2;
  const doseMg = compound.unit === 'mcg' ? midMg / 1000 : midMg;
  const intervalHours = compound.halfLifeHours * 4;
  const schedule = { doseMg, intervalHours, halfLifeHours: compound.halfLifeHours, doses: 4 };

  const curve = buildCurve(schedule, CHART_HOURS, CHART_STEP);
  const peak = peakOf(curve) || 1;

  const x = (hour: number) => (hour / CHART_HOURS) * CHART_W;
  const y = (amount: number) => CHART_H - (amount / peak) * (CHART_H - 6) - 3;
  const path = curve.map((point) => `${x(point.hour)},${y(point.amountMg)}`).join(' ');

  // Faint day gridlines, plus a dot at the start of each modelled dose.
  const gridHours = [0, 24, 48, 72].filter((hour) => hour <= CHART_HOURS);
  const doseHours = [0, 1, 2, 3]
    .map((index) => index * intervalHours)
    .filter((hour) => hour <= CHART_HOURS);

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

/**
 * The Reference sheet: a static, clearly-labelled list of typical starting
 * ranges, half-lives and reconstitution volumes. It never feeds the calculator
 * automatically — it is context, and it always carries the disclaimer.
 */
export function ReferencePage() {
  const { strings } = useI18n();
  const copy = strings.reference;
  const [klass, setKlass] = useState<CompoundClass>('peptide');

  const rows = COMPOUNDS.filter((compound) => compound.klass === klass);

  const halfLifeLabel = (hours: number): string =>
    hours < 24
      ? `${hours} ${copy.halfLifeUnit}`
      : `${Math.round(hours / 24)} ${copy.halfLifeDaysUnit}`;

  return (
    <section className="settings" aria-labelledby="reference-title">
      <div className="page-head">
        <h2 className="page-title" id="reference-title">
          {copy.title}
        </h2>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>

      <p className="ref__disclaimer">{strings.disclaimer.pointOfUse}</p>

      <div className="ref__tabs">
        <button
          type="button"
          className={`btn btn--sm${klass === 'peptide' ? ' btn--accent' : ''}`}
          aria-pressed={klass === 'peptide'}
          onClick={() => setKlass('peptide')}
        >
          {strings.kinds.peptide}
        </button>
        <button
          type="button"
          className={`btn btn--sm${klass === 'anabolic' ? ' btn--accent' : ''}`}
          aria-pressed={klass === 'anabolic'}
          onClick={() => setKlass('anabolic')}
        >
          {strings.kinds.anabolic}
        </button>
      </div>

      <ul className="ref__list">
        {rows.map((compound) => (
          <li className="ref__row" key={compound.id}>
            <div className="ref__head">
              <h3 className="ref__name">{compound.name}</h3>
              <span className="ref__range">
                {copy.typical}: <strong>{formatRange(compound)}</strong>
              </span>
            </div>

            <dl className="ref__facts">
              <div>
                <dt>{copy.cadence}</dt>
                <dd>{compound.cadence}</dd>
              </div>
              <div>
                <dt>{copy.halfLife}</dt>
                <dd>{halfLifeLabel(compound.halfLifeHours)}</dd>
              </div>
              {compound.commonWaterMl.length > 0 ? (
                <div>
                  <dt>{copy.water}</dt>
                  <dd>{compound.commonWaterMl.join(' / ')} {strings.units.ml}</dd>
                </div>
              ) : null}
            </dl>

            <DecayChart
              compound={compound}
              ariaLabel={`${copy.halfLife}: ${compound.name}`}
            />
          </li>
        ))}
      </ul>

      <p className="ref__note">{copy.note}</p>

      <UnitConverter />
    </section>
  );
}
