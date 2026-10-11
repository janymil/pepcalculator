import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { CalcWarning, WarningSeverity } from '../lib/calc';
import { fmt } from '../lib/format';

const ICONS: Record<WarningSeverity, string> = {
  error: '⛔',
  warning: '⚠️',
  info: 'ℹ️',
};

/** Formats the numeric placeholders inside a warning so they read nicely. */
function formatParams(warning: CalcWarning): Record<string, number | string> | undefined {
  if (!warning.params) return undefined;
  const out: Record<string, number | string> = {};
  for (const [key, value] of Object.entries(warning.params)) {
    if (typeof value !== 'number') {
      out[key] = value;
      continue;
    }
    if (key === 'vials') out[key] = fmt.count(value);
    else if (key === 'units') out[key] = fmt.units(value);
    else out[key] = fmt.volume(value);
  }
  return out;
}

/** Renders the validation / guidance messages produced by the engine. */
export function AlertList({ warnings }: { warnings: CalcWarning[] }) {
  const { strings } = useI18n();

  if (warnings.length === 0) return null;

  return (
    <ul className="alerts">
      {warnings.map((warning, index) => (
        <li
          key={`${warning.code}-${index}`}
          className={`alert alert--${warning.severity}`}
          role={warning.severity === 'error' ? 'alert' : undefined}
        >
          <span className="alert__icon" aria-hidden="true">
            {ICONS[warning.severity]}
          </span>
          <span>{interpolate(strings.warnings[warning.code], formatParams(warning))}</span>
        </li>
      ))}
    </ul>
  );
}
