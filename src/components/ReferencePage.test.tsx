import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { COMPOUNDS } from '../lib/reference';
import { ReferencePage } from './ReferencePage';

const html = renderToString(
  <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
    <ReferencePage />
  </I18nProvider>,
);

describe('ReferencePage (server render smoke test)', () => {
  it('shows the sheet title and the disclaimer reminder', () => {
    expect(html).toContain('reference-title');
    expect(html).toContain(DICTIONARIES.en.reference.title);
    expect(html).toContain(DICTIONARIES.en.disclaimer.pointOfUse);
  });

  it('lists the peptide reference rows (and their half-life charts)', () => {
    expect(html).toContain('BPC-157');
    expect(html).toContain('Semaglutide');
    expect(html).toContain('ref__chart');
    // Only peptides are shown before the user switches tabs.
    expect(html).not.toContain('Testosterone enanthate');
  });

  it('carries the "not advice" note', () => {
    expect(html).toContain(DICTIONARIES.en.reference.note);
  });

  it('is backed by real data for every listed compound', () => {
    for (const compound of COMPOUNDS) {
      expect(compound.name.length).toBeGreaterThan(0);
      expect(compound.halfLifeHours).toBeGreaterThan(0);
    }
  });
});
