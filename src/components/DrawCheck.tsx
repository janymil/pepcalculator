import { useEffect, useRef } from 'react';
import { LOCALES } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { fmt, formatDate } from '../lib/format';
import type { TodayDose } from '../lib/today';
import { Icon } from './Icon';

interface DrawCheckProps {
  /** The dose about to be taken — everything shown comes from this. */
  dose: TodayDose;
  /** Where to inject, when the rotation knows. */
  site?: string;
  onClose: () => void;
}

/**
 * A full-screen "check before you draw" card.
 *
 * It exists because the moment of drawing is where the app's normal layout stops
 * helping: the numbers are small, the page can be scrolled, and the vial in the
 * hand is the one thing the screen cannot see. So this shows *only* the three
 * things that have to match — which vial, how much, and where — in type big
 * enough to read at arm's length, with Escape and a Done button to dismiss.
 */
export function DrawCheck({ dose, site, onClose }: DrawCheckProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];
  const copy = strings.check;
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus the dismiss button, so a keyboard or screen-reader user lands inside
  // the dialog rather than behind it.
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const byClicks = dose.measure === 'clicks';
  const byVolume = dose.measure === 'volume';
  const value = byClicks
    ? fmt.count(dose.drawValue)
    : byVolume
      ? fmt.volume(dose.drawValue)
      : fmt.units(dose.drawValue);
  const unitLabel = byClicks
    ? strings.results.clicksWord
    : byVolume
      ? strings.units.ml
      : strings.results.unitsWord;

  return (
    <div className="check" role="dialog" aria-modal="true" aria-label={copy.title}>
      <div className="check__card">
        <p className="check__title">{copy.title}</p>
        <p className="check__hint">{copy.hint}</p>

        <dl className="check__facts">
          <div className="check__fact">
            <dt>{copy.vial}</dt>
            <dd className="check__vial">{dose.name || strings.vials.untitled}</dd>
          </div>
          {site ? (
            <div className="check__fact">
              <dt>{copy.site}</dt>
              <dd>{site}</dd>
            </div>
          ) : null}
          <div className="check__fact">
            <dt>{copy.when}</dt>
            <dd>
              {formatDate(dose.date, locale)} · {dose.time}
            </dd>
          </div>
        </dl>

        <p className="check__draw-label">{copy.dose}</p>
        <p className="check__draw">
          <span className="check__draw-value">{value}</span>
          <span className="check__draw-unit">{unitLabel}</span>
        </p>
        {byClicks || byVolume ? null : (
          <p className="check__sub">
            {fmt.volume(dose.volumeMl)} {strings.units.ml}
          </p>
        )}

        <button ref={closeRef} type="button" className="btn btn--accent check__done" onClick={onClose}>
          <Icon name="check" size={16} />
          {copy.close}
        </button>
      </div>
    </div>
  );
}
