import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { SavedVial } from '../lib/vials';
import { ProtocolPlot } from './ProtocolPlot';

/** A daily plan for a named compound, which is what the plot needs. */
function plannedVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'bpc',
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
    schedule: {
      times: ['09:00'],
      repeat: 'daily',
      weekdays: [],
      startsOn: '2026-01-05',
      durationValue: 4,
      durationUnit: 'weeks',
    },
    ...overrides,
  } as SavedVial;
}

function render(vials: SavedVial[]): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <ProtocolPlot vials={vials} todayIso="2026-01-06" />
    </I18nProvider>,
  );
}

describe('ProtocolPlot', () => {
  it('explains what is missing rather than drawing a guess', () => {
    const html = render([]);

    expect(html).toContain('Your protocol');
    expect(html).toContain('name it after a compound');
    expect(html).not.toContain('ref__chart');
  });

  it('draws the plan of a vial named after a compound', () => {
    const html = render([plannedVial()]);

    expect(html).toContain('ref__chart');
    // 250 mcg is 0.25 mg, taken daily.
    expect(html).toContain('0.25');
    expect(html).toContain('per week');
  });

  it('refuses to plot an IU-dosed hormone, because the model is in mg', () => {
    const hormone = plannedVial({
      name: 'HGH',
      vialUnit: 'IU',
      vialAmount: 10,
      doseAmount: 2,
      doseUnit: 'IU',
    });

    const html = render([hormone]);

    expect(html).not.toContain('ref__chart');
    expect(html).toContain('IU');
  });

  it('refuses to plot a vial with no plan at all', () => {
    const html = render([plannedVial({ schedule: undefined })]);

    expect(html).not.toContain('ref__chart');
  });
});
