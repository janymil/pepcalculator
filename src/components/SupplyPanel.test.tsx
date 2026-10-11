import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { buildSupply } from '../lib/supply';
import type { SavedVial } from '../lib/vials';
import { SupplyPanel } from './SupplyPanel';

const wrap = (node: React.ReactNode) =>
  renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      {node}
    </I18nProvider>,
  );

/** 5 mg in 2 mL: 2.5 mg/mL, so a 250 mcg dose is 0.1 mL and 20 doses a vial. */
function makeVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    reconstitutedOn: '2026-01-05',
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    kind: 'peptide',
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    ...overrides,
  };
}

const build = (vials: SavedVial[]) =>
  wrap(<SupplyPanel summary={buildSupply(vials, '2026-01-05', '08:00')} />);

describe('SupplyPanel (server render)', () => {
  it('invites the user to save a vial when there is nothing to project', () => {
    const html = build([]);

    expect(html).toContain('supply-title');
    expect(html).toContain('Save a vial with a plan');
  });

  it('reports the stock count and the soonest run-out date', () => {
    const html = build([
      makeVial({
        schedule: {
          times: ['09:00'],
          repeat: 'daily',
          weekdays: [],
          startsOn: '2026-01-05',
          durationValue: 0,
          durationUnit: 'ongoing',
        },
      }),
    ]);

    expect(html).toContain('1 vials in stock');
    // 20 doses at one a day from 5 Jan puts the last dose on the 24th.
    expect(html).toContain('24 Jan 2026');
  });

  it('says nothing is running out when the plans are comfortable', () => {
    const html = build([makeVial()]);

    expect(html).toContain('Nothing is running out');
  });

  it('flags a vial that will expire with doses still in it', () => {
    // Mixed on 10 Dec, so the use-by date is 7 Jan — two days after "today".
    const html = build([makeVial({ reconstitutedOn: '2025-12-10' })]);

    expect(html).toContain('7 Jan 2026');
  });
});
