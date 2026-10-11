import { useI18n } from '../i18n/I18nContext';
import type { CalcResult, MeasureSystem } from '../lib/calc';
import { fmt } from '../lib/format';
import { AlertList } from './AlertList';
import { SyringeVisual } from './SyringeVisual';

interface ResultPanelProps {
  result: CalcResult;
  capacityMl: number;
  /** `insulin` → headline in units; `volume` → headline in mL. */
  measure: MeasureSystem;
}

interface StatItem {
  label: string;
  value: string;
}

/** The right-hand column: the headline answer, the syringe and the details. */
export function ResultPanel({ result, capacityMl, measure }: ResultPanelProps) {
  const { strings } = useI18n();

  // Peptides are measured with an insulin syringe, so the headline answer is
  // "how many units?". Anabolic oils are measured in mL, so the headline is
  // the volume itself — showing "units" there would be meaningless.
  const byVolume = measure === 'volume';

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

      {result.ok ? (
        <>
          <div className="hero">
            <p className="hero__eyebrow">
              {byVolume ? strings.results.drawVolumeLabel : strings.results.drawUnitsLabel}
            </p>
            <p className="hero__value">
              <span className="hero__number">
                {byVolume ? fmt.volume(result.volumeMl) : fmt.units(result.units)}
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
            🧪
          </span>
          <p className="empty__title">{strings.results.empty}</p>
          <p className="empty__hint">{strings.results.emptyHint}</p>
        </div>
      )}

      <AlertList warnings={result.warnings} />
    </section>
  );
}
