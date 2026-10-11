import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { DangerZone } from './DangerZone';

function render(hasData: boolean): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <DangerZone hasData={hasData} onClearAll={() => {}} />
    </I18nProvider>,
  );
}

describe('DangerZone (server render smoke test)', () => {
  it('explains where the data lives and offers to clear it', () => {
    const html = render(true);
    expect(html).toContain('danger-title');
    expect(html).toContain(DICTIONARIES.en.danger.clear);
    expect(html).not.toContain('disabled');
  });

  it('disables the clear button when there is nothing to clear', () => {
    expect(render(false)).toContain('disabled');
  });
});
