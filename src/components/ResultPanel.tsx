import { useState } from 'react';
import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { useCountUp } from '../hooks/useCountUp';
import type { CalcResult, DoseUnit, MeasureSystem } from '../lib/calc';
import { fromBase } from '../lib/calc';
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
  /** Display label for the base unit of the vial's family: `mg` or `IU`. */
  baseUnitLabel: string;
  /**
   * Syringe scale label (`U-100`…). Supplied for IU workflows, where the
   * headline is in mL but the user reads graduations off the barrel.
   */
  scaleLabel?: string;
  /**
   * A water volume that would make a hard-to-read draw easier, when one helps.
   * Shown beside the warnings as the concrete fix for "too small to measure".
   */
  waterHint?: { waterMl: number; units: number } | null;
  /** Applies the suggested water volume back into the form. */
  onApplyWater?: (waterMl: number) => void;
}

interface StatItem {
  label: string;
  value: string;
}

/** The right-hand column: the headline answer, the syringe and the details. */
export function ResultPanel({
  result,
  capacityMl,
  measure,
  doseUnit,
  baseUnitLabel,
  scaleLabel,
  waterHint,
  onApplyWater,
}: ResultPanelProps) {
  const { strings } = useI18n();

  // Peptides are measured with an insulin syringe, so the headline answer is
  // "how many units?". Oils and pens are read off a barrel or a dial instead —
  // the headline variables below pick the right one.

  // Inverse mode: "I drew this much — what dose is that?" is derived live from
  // the concentration and the volume the user types.
  const [inverseOn, setInverseOn] = useState(false);
  const [inverseVolume, setInverseVolume] = useState('');
  const inverseVolumeMl = parseNumber(inverseVolume);
  const inverseDoseBase =
    result.concentrationPerMl > 0 && inverseVolumeMl > 0
      ? result.concentrationPerMl * inverseVolumeMl
      : 0;
  const inverseDose = fromBase(inverseDoseBase, doseUnit);

  // The headline number eases to its new value (first paint is never animated).
  const animatedUnits = useCountUp(result.units);
  const animatedVolume = useCountUp(result.volumeMl);
  const animatedClicks = useCountUp(result.clicks);

  // Three ways to read the same volume: graduations on an insulin syringe, a
  // plain mL barrel, or a pen dial. Each has its own word for it.
  const byVolume = measure === 'volume';
  const byClicks = measure === 'clicks';
  const headline = byClicks
    ? fmt.count(animatedClicks)
    : byVolume
      ? fmt.volume(animatedVolume)
      : fmt.units(animatedUnits);
  const unitLabel = byClicks
    ? strings.results.clicksWord
    : byVolume
      ? strings.units.ml
      : strings.results.unitsWord;
  const eyebrow = byClicks
    ? strings.results.drawClicksLabel
    : byVolume
      ? strings.results.drawVolumeLabel
      : strings.results.drawUnitsLabel;
  // Under a pen or an oil, the mL is the extra information; under an insulin
  // syringe it is the units that are the extra information.
  const sub = byClicks
    ? `${fmt.volume(result.volumeMl)} ${strings.units.ml}`
    : byVolume
      ? strings.results.drawUnitsSub
      : `${fmt.volume(result.volumeMl)} ${strings.units.ml} · ${strings.results.drawUnitsSub}`;

  const stats: StatItem[] = [
    {
      label: strings.results.volume,
      value: `${fmt.volume(result.volumeMl)} ${strings.units.ml}`,
    },
    {
      label: strings.results.concentration,
      value: `${fmt.concentration(result.concentrationPerMl)} ${baseUnitLabel}/${strings.units.ml}`,
    },
    {
      label: strings.results.doseInBase,
      value: `${fmt.mass(result.doseBase)} ${baseUnitLabel}`,
    },
    {
      label: strings.results.totalInVial,
      value:
        result.totalVialBase !== null
          ? `${fmt.mass(result.totalVialBase)} ${baseUnitLabel}`
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

  // For an IU workflow the headline is the volume, but what the user actually
  // reads is the graduation count — so show both, side by side.
  if (scaleLabel) {
    stats.push({
      label: interpolate(strings.results.syringeReading, { scale: scaleLabel }),
      value: fmt.units(result.units),
    });
  }

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
            <p className="hero__eyebrow">{eyebrow}</p>
            <p className="hero__value">
              <span className="hero__number">{headline}</span>
              <span className="hero__unit">{unitLabel}</span>
            </p>
            <p className="hero__sub">{sub}</p>
            {/* Announced once per change, not on every animation frame. */}
            <p className="visually-hidden" role="status">
              {eyebrow}
              {': '}
              {byClicks ? fmt.count(result.clicks) : byVolume ? fmt.volume(result.volumeMl) : fmt.units(result.units)}{' '}
              {unitLabel}
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

      {/* The concrete fix for a draw that is too small to read: a bigger volume. */}
      {waterHint && onApplyWater ? (
        <div className="result__tip">
          <p className="result__tip-text">
            {interpolate(strings.results.waterHint, {
              water: fmt.volume(waterHint.waterMl),
              units: fmt.units(waterHint.units),
            })}
          </p>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => onApplyWater(waterHint.waterMl)}
          >
            {interpolate(strings.actions.useWater, { water: fmt.volume(waterHint.waterMl) })}
          </button>
        </div>
      ) : null}

      <AlertList warnings={result.warnings} />
    </section>
  );
}
