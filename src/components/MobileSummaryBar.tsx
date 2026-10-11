import { useI18n } from '../i18n/I18nContext';
import { useCountUp } from '../hooks/useCountUp';
import type { CalcResult, MeasureSystem } from '../lib/calc';
import { fmt } from '../lib/format';
import { Icon } from './Icon';

interface MobileSummaryBarProps {
  result: CalcResult;
  /** `insulin` → headline in units; `volume` → headline in mL. */
  measure: MeasureSystem;
}

/**
 * A compact "live answer" bar, pinned to the bottom of the viewport on phones
 * (hidden from `880px` up, where the sticky result card already keeps the answer
 * in view). Without it the result scrolls off-screen as soon as the user types.
 */
export function MobileSummaryBar({ result, measure }: MobileSummaryBarProps) {
  const { strings } = useI18n();
  const byVolume = measure === 'volume';
  const animated = useCountUp(byVolume ? result.volumeMl : result.units);

  return (
    <div className="summary-bar" aria-hidden="true">
      <span className="summary-bar__icon">
        <Icon name="syringe" size={18} />
      </span>
      {result.ok ? (
        <span className="summary-bar__body">
          <span className="summary-bar__label">{strings.summary.draw}</span>
          <span className="summary-bar__value">
            {byVolume ? fmt.volume(animated) : fmt.units(animated)}
          </span>
          <span className="summary-bar__unit">
            {byVolume ? strings.units.ml : strings.results.unitsWord}
          </span>
        </span>
      ) : (
        <span className="summary-bar__hint">{strings.summary.nothing}</span>
      )}
    </div>
  );
}
