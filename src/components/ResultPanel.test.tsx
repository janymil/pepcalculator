import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import {
  calculateAnabolic,
  calculatePeptide,
  type CalcResult,
  type MeasureSystem,
} from '../lib/calc';
import { ResultPanel } from './ResultPanel';

/** Renders the panel in a fixed language so assertions are deterministic. */
function renderPanel(
  result: CalcResult,
  measure: MeasureSystem,
  capacityMl: number,
  baseUnitLabel = 'mg',
): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <ResultPanel
        result={result}
        capacityMl={capacityMl}
        measure={measure}
        doseUnit="mcg"
        baseUnitLabel={baseUnitLabel}
      />
    </I18nProvider>,
  );
}

describe('ResultPanel readout', () => {
  it('leads with insulin units for peptides', () => {
    // 5 mg / 2 mL = 2.5 mg/mL; 250 mcg -> 0.1 mL -> 10 units on U-100.
    const result = calculatePeptide({
      vialAmount: 5,
      vialUnit: 'mg',
      waterMl: 2,
      doseAmount: 250,
      doseUnit: 'mcg',
      syringeType: 'U100',
      syringeCapacityMl: 1,
    });

    const html = renderPanel(result, 'insulin', 1);

    expect(html).toMatch(/hero__eyebrow"[^>]*>Draw to</);
    expect(html).toMatch(/hero__number"[^>]*>10</);
    expect(html).toMatch(/hero__unit"[^>]*>units</);
  });

  it('leads with millilitres (never units) for anabolic oils', () => {
    // 250 mg/mL, 500 mg dose -> 2 mL = "200 units" on an insulin syringe, which
    // is exactly what an oil user must NOT be told.
    const result = calculateAnabolic({
      concentrationMgPerMl: 250,
      doseAmount: 500,
      doseUnit: 'mg',
      vialMl: 10,
      syringeType: 'U100',
      syringeCapacityMl: 3,
    });

    const html = renderPanel(result, 'volume', 3);

    expect(html).toMatch(/hero__eyebrow"[^>]*>Draw up to</);
    expect(html).toMatch(/hero__number"[^>]*>2</);
    expect(html).toMatch(/hero__unit"[^>]*>mL</);
    expect(html).not.toMatch(/hero__number"[^>]*>200</);
    expect(html).not.toContain('units');
  });
});
