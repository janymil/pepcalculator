import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { TodayDose } from '../lib/today';
import type { SavedVial } from '../lib/vials';
import { DrawCheck } from './DrawCheck';

/** A minimal saved vial; only the fields the card reads matter here. */
const vial = {
  id: 'v1',
  name: 'BPC-157',
  reconstitutedOn: '2026-01-05',
  vialAmount: 5,
  vialUnit: 'mg',
  waterMl: 2,
  doseAmount: 250,
  doseUnit: 'mcg',
  syringeType: 'U100',
  syringeCapacityMl: 1,
  dosesTaken: 0,
} as unknown as SavedVial;

const dose: TodayDose = {
  vialId: 'v1',
  name: 'BPC-157',
  kind: 'peptide',
  measure: 'insulin',
  date: '2026-01-05',
  time: '09:00',
  volumeMl: 0.1,
  drawValue: 10,
  taken: false,
  vial,
};

function render(site?: string): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <DrawCheck dose={dose} site={site} onClose={() => {}} />
    </I18nProvider>,
  );
}

describe('DrawCheck', () => {
  it('is a modal dialog with an accessible name', () => {
    const html = render();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Check before you draw');
  });

  it('shows the dose, the vial and the site — the three things to match', () => {
    const html = render('Left abdomen');

    expect(html).toContain('BPC-157');
    expect(html).toContain('10'); // units to draw
    expect(html).toContain('units');
    expect(html).toContain('Left abdomen');
  });

  it('omits the site when the rotation has nothing to say', () => {
    expect(render()).not.toContain('Site');
  });

  it('offers a way out', () => {
    expect(render()).toContain('Done');
  });
});
