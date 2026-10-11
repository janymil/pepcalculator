import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { UnitConverter } from './UnitConverter';

/** Renders in a fixed language so the assertions are deterministic. */
function render(): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <UnitConverter />
    </I18nProvider>,
  );
}

/**
 * The visible text, with the `<!-- -->` markers React inserts between adjacent
 * text nodes stripped out — otherwise nothing that spans two of them matches.
 */
function renderText(): string {
  return render()
    .replace(/<[^>]*>/g, ' ')
    .replace(/<!-- -->/g, '')
    .replace(/\s+/g, ' ');
}

describe('UnitConverter', () => {
  it('shows a mass both ways at once', () => {
    // The default is 2500 mcg, which is 2.5 mg. `formatNumber` groups in en-US,
    // so the thousands separator is part of the expected output.
    expect(renderText()).toContain('= 2.5 mg · 2,500 mcg');
  });

  it('shows one draw in mL, graduations and clicks together', () => {
    // The default is 0.25 mL, which is 25 units on U-100 and 25 clicks at 100/mL.
    expect(renderText()).toContain('= 0.25 mL · 25 units · 25 clicks');
  });

  it('offers the scale and the pen dial, since both change the answer', () => {
    const html = render();

    expect(html).toContain('U-100');
    expect(html).toContain('Pen dial');
  });
});
