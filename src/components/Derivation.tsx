import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { DerivationStep } from '../lib/derive';
import { fmt } from '../lib/format';

interface DerivationProps {
  steps: DerivationStep[];
  /** Display label for the base unit of the vial's family: `mg` or `IU`. */
  baseUnitLabel: string;
}

/** Formats one step's raw numbers into the placeholders its template expects. */
function paramsFor(step: DerivationStep, baseUnitLabel: string): Record<string, number | string> {
  const { params } = step;
  switch (step.kind) {
    case 'concentration':
      return {
        vial: fmt.mass(params.vial as number),
        unit: baseUnitLabel,
        water: fmt.volume(params.water as number),
        conc: fmt.concentration(params.conc as number),
      };
    case 'volume':
      return {
        dose: fmt.mass(params.dose as number),
        unit: baseUnitLabel,
        conc: fmt.concentration(params.conc as number),
        volume: fmt.volume(params.volume as number),
      };
    case 'units':
      return {
        volume: fmt.volume(params.volume as number),
        perMl: String(params.perMl),
        units: fmt.units(params.units as number),
      };
    case 'clicks':
      return {
        volume: fmt.volume(params.volume as number),
        perMl: String(params.perMl),
        count: fmt.count(params.count as number),
      };
  }
}

/**
 * The "working" under the result: the arithmetic that produced the headline
 * answer, with the user's own numbers. It sits inside a `<details>` so it can be
 * folded away, but it is open by default — the whole point is that it is seen,
 * so the app never has to ask the user to take its word for the answer.
 */
export function Derivation({ steps, baseUnitLabel }: DerivationProps) {
  const { strings } = useI18n();
  if (steps.length === 0) return null;

  const copy = strings.derivation;

  return (
    <details className="derivation" open>
      <summary className="derivation__summary">
        <span className="derivation__title">{copy.title}</span>
        <span className="derivation__toggle">{copy.toggle}</span>
      </summary>
      <ol className="derivation__steps">
        {steps.map((step, index) => (
          <li className="derivation__step" key={`${step.kind}-${index}`}>
            <span className="derivation__formula">
              {interpolate(copy[step.kind], paramsFor(step, baseUnitLabel))}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
