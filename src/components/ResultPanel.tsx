import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { useCountUp } from '../hooks/useCountUp';
import type { CalcResult, DoseUnit, MeasureSystem } from '../lib/calc';
import { fromMg } from '../lib/calc';
import { fmt, parseNumber } from '../lib/format';
import { AlertList } from './AlertList';
import { Icon } from './Icon';
import { SyringeVisual } from './SyringeVisual';

interface ResultPanelProps {
  result: CalcResult;
  capacityMl: number;
  /** `insulin` → headline in units; `volume` → headline in mL. */
  measure: MeasureSystem;
  /** The dose unit the user picked — the inverse answer uses the same one. */
  doseUnit: DoseUnit;
}

interface StatItem {
  label: string;
  value: string;
}

/** The right-hand column: the headline answer, the syringe and the details. */
export function ResultPanel({ result, capacityMl, measure, doseUnit }: ResultPanelProps) {
  const { strings } = useI18n();

  // Peptides are measured with an insulin syringe, so the headline answer is
  // "how many units?". Anabolic oils are measured in mL, so the headline is
  // the volume itself — showing "units" there would be meaningless.
  const byVolume = measure === 'volume';

  // Inverse mode: "I drew this much — what dose is that?" is derived live from
  // the concentration and the volume the user types.
  const [inverseOn, setInverseOn] = useState(false);
  const [inverseVolume, setInverseVolume] = useState('');
  const inverseVolumeMl = parseNumber(inverseVolume);
  const inverseDoseMg =
    result.concentrationMgPerMl > 0 && inverseVolumeMl > 0
      ? result.concentrationMgPerMl * inverseVolumeMl
      : 0;
  const inverseDose = fromMg(inverseDoseMg, doseUnit);

  // The headline number eases to its new value (first paint is never animated).
  const animatedUnits = useCountUp(result.units);
  const animatedVolume = useCountUp(result.volumeMl);

  const stats: StatItem[] = [
    {
      label: strings.results.volume,
      value: `${fmt.volume(result.volumeMl)} ${strings.units.ml}`,
    },
    {
      label: strings.results.concentration,
      value: `${fmt.concentration(result.concentrationMgPerMl)} mg/${strings.units.ml}`,
    },
    {
      label: strings.results.doseInMg,
      value: `${fmt.mass(result.doseMg)} mg`,
    },
    {
      label: strings.results.totalInVial,
      value:
        result.totalVialMg !== null
          ? `${fmt.mass(result.totalVialMg)} mg`
          : strings.results.notApplicable,
    },
    {
      label: strings.results.dosesPerVial,
      value:
        result.dosesPerVial !== null
          ? fmt.count(result.dosesPerVial)
          : strings.results.notApplicable,
    },
  ];

  return (
    <section className="card card--result" aria-labelledby="result-title">
      <h2 className="card__title" id="result-title">
        {strings.sections.results}
      </h2>

      <button
        type="button"
        className={`result__inverse-toggle${inverseOn ? ' is-on' : ''}`}
        aria-pressed={inverseOn}
        onClick={() => setInverseOn((current) => !current)}
      >
        <Icon name="swap" size={15} /> {strings.inverse.title}
      </button>

      {inverseOn ? (
        <div className="result__inverse">
          <label className="field__label" htmlFor="inverse-volume">
            {strings.results.volume}
          </label>
          <div className="field__control">
            <input
              id="inverse-volume"
              className="field__input"
              type="text"
              inputMode="decimal"
              value={inverseVolume}
              onChange={(event) => setInverseVolume(event.target.value)}
              placeholder={strings.inverse.volumePlaceholder}
            />
            <span className="field__suffix">{strings.units.ml}</span>
          </div>
          <p className="result__inverse-hint">{strings.inverse.hint}</p>
          {inverseDose > 0 ? (
            <p className="result__inverse-out">
              <span className="result__inverse-label">{strings.inverse.dose}</span>
              <span className="result__inverse-value">{fmt.mass(inverseDose)}</span>
              <span className="result__inverse-unit">{doseUnit}</span>
            </p>
          ) : null}
        </div>
      ) : null}

      {result.ok ? (
        <>
          <div className="hero">
            <p className="hero__eyebrow">
              {byVolume ? strings.results.drawVolumeLabel : strings.results.drawUnitsLabel}
            </p>
            <p className="hero__value">
              <span className="hero__number">
                {byVolume ? fmt.volume(animatedVolume) : fmt.units(animatedUnits)}
              </span>
              <span className="hero__unit">
                {byVolume ? strings.units.ml : strings.results.unitsWord}
              </span>
            </p>
            <p className="hero__sub">
              {byVolume
                ? strings.results.drawUnitsSub
                : `${fmt.volume(result.volumeMl)} ${strings.units.ml} · ${strings.results.drawUnitsSub}`}
            </p>
            {/* Announced once per change, not on every animation frame. */}
            <p className="visually-hidden" role="status">
              {byVolume ? strings.results.drawVolumeLabel : strings.results.drawUnitsLabel}
              {': '}
              {byVolume ? fmt.volume(result.volumeMl) : fmt.units(result.units)}{' '}
              {byVolume ? strings.units.ml : strings.results.unitsWord}
            </p>
          </div>

          <SyringeVisual
            volumeMl={result.volumeMl}
            capacityMl={capacityMl}
            ariaLabel={strings.syringeVisual.ariaLabel}
          />

          <dl className="stats">
            {stats.map((stat) => (
              <div className="stat" key={stat.label}>
                <dt className="stat__label">{stat.label}</dt>
                <dd className="stat__value">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">
            <Icon name="flask" size={26} />
          </span>
          <p className="empty__title">{strings.results.empty}</p>
          <p className="empty__hint">{strings.results.emptyHint}</p>
        </div>
      )}

      <AlertList warnings={result.warnings} />
    </section>
  );
}
