import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { VialSchedule } from '../lib/schedule';
import type { SavedVial } from '../lib/vials';
import { PrintSheet } from './PrintSheet';

const render = (vials: SavedVial[]) =>
  renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <PrintSheet vials={vials} ownerName="Kim" todayIso="2026-01-05" />
    </I18nProvider>,
  );

function schedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: '2026-01-05',
    durationValue: 4,
    durationUnit: 'weeks',
    ...overrides,
  };
}

/** 5 mg in 2 mL: 2.5 mg/mL, so a 250 mcg dose is 10 units on a U-100 syringe. */
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
    schedule: schedule(),
    ...overrides,
  };
}

describe('PrintSheet (server render)', () => {
  it('renders nothing when no vial has a plan', () => {
    expect(render([makeVial({ schedule: undefined })])).toBe('');
    expect(render([])).toBe('');
  });

  it('names the person and dates the sheet', () => {
    const html = render([makeVial()]);

    expect(html).toContain('Protocol');
    expect(html).toContain('Prepared for Kim');
    expect(html).toContain('5 Jan 2026');
  });

  it('prints the draw amount instead of the ratio the user has to work out', () => {
    const html = render([makeVial()]);

    expect(html).toContain('10');
    expect(html).toContain('units');
  });

  it('writes the repeat pattern in words', () => {
    expect(render([makeVial({ schedule: schedule({ repeat: 'interval', intervalDays: 2 }) })])).toContain(
      'Every other day',
    );
    expect(
      render([makeVial({ schedule: schedule({ repeat: 'weekdays', weekdays: [1, 3, 5] }) })]),
    ).toContain('Mon');
  });

  it('makes a sticker with the ratio and the use-by date', () => {
    const html = render([makeVial()]);

    expect(html).toContain('Vial labels');
    expect(html).toContain('5 mg in 2 mL');
    // Mixed on 5 Jan, so the 28-day beyond-use date is 2 Feb.
    expect(html).toContain('2 Feb 2026');
  });

  it('carries the disclaimer onto the paper', () => {
    expect(render([makeVial()])).toContain('not medical advice');
  });
});
