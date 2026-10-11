import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { formatDate } from '../lib/format';
import type { SupplySummary } from '../lib/supply';
import { vialColor, vialDotStyle } from '../lib/vialColors';

interface SupplyPanelProps {
  /** The projection for the currently selected person's stack. */
  summary: SupplySummary;
}

/**
 * The supply outlook for one person's stack: how long it lasts, what is nearly
 * empty and what to reorder. Every number is derived from the saved plans (see
 * `lib/supply.ts`), so there is nothing here the user has to keep up to date.
 */
export function SupplyPanel({ summary }: SupplyPanelProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];
  const copy = strings.supply;

  if (summary.vials.length === 0) {
    return (
      <div className="supply" aria-labelledby="supply-title">
        <p className="supply__title" id="supply-title">
          {copy.title}
        </p>
        <p className="supply__subtitle">{copy.empty}</p>
      </div>
    );
  }

  /** How many separate things are worth the user's attention. */
  const flagged =
    summary.low.length + summary.expiring.length + (summary.vialsToReorder > 0 ? 1 : 0);

  return (
    <div className="supply" aria-labelledby="supply-title">
      <p className="supply__title" id="supply-title">
        {copy.title}
      </p>
      <p className="supply__subtitle">{copy.subtitle}</p>

      <ul className="supply__facts">
        <li>{interpolate(copy.inStock, { count: summary.vials.length })}</li>
        <li>
          {summary.runsOutOn
            ? interpolate(copy.runsOutOn, { date: formatDate(summary.runsOutOn, locale) })
            : copy.ongoing}
        </li>
      </ul>

      {flagged === 0 ? <p className="supply__ok">{copy.allGood}</p> : null}

      {summary.vialsToReorder > 0 ? (
        <p className="supply__flag">
          {interpolate(copy.reorder, { count: summary.vialsToReorder })}
        </p>
      ) : null}

      {summary.low.length > 0 ? (
        <ul className="supply__list">
          {summary.low.map((row) => (
            <li key={row.vial.id}>
              <span
                className="vial__dot"
                style={{ backgroundColor: vialColor(row.vial.id), ...vialDotStyle(row.vial.id) }}
                aria-hidden="true"
              />
              <span className="supply__name">{row.vial.name || strings.vials.untitled}</span>
              <span className="supply__meta">
                {interpolate(copy.lowLine, { count: Math.round(row.dosesLeft) })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {summary.expiring.length > 0 ? (
        <ul className="supply__list">
          {summary.expiring.map((row) => (
            <li key={row.vial.id}>
              <span
                className="vial__dot"
                style={{ backgroundColor: vialColor(row.vial.id), ...vialDotStyle(row.vial.id) }}
                aria-hidden="true"
              />
              <span className="supply__name">{row.vial.name || strings.vials.untitled}</span>
              <span className="supply__meta">
                {row.expiresOn
                  ? row.dosesAtRisk > 0
                    ? interpolate(copy.dosesAtRisk, {
                        date: formatDate(row.expiresOn, locale),
                        doses: Math.round(row.dosesAtRisk),
                      })
                    : interpolate(strings.vials.useBy, {
                        date: formatDate(row.expiresOn, locale),
                      })
                  : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
