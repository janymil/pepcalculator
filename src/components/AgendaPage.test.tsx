import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { VialSchedule } from '../lib/schedule';
import { tombstoneVial, type SavedVial } from '../lib/vials';
import { AgendaPage } from './AgendaPage';

// 2024-01-01 is a Monday.
const MONDAY = '2024-01-01';

function makeSchedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['08:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: MONDAY,
    durationValue: 4,
    durationUnit: 'weeks',
    ...overrides,
  };
}

function makeVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    reconstitutedOn: MONDAY,
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    schedule: makeSchedule(),
    ...overrides,
  };
}

/** Renders with fixed English strings so assertions never depend on the OS. */
function render(vials: SavedVial[]): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <AgendaPage vials={vials} todayIso={MONDAY} nowTime="07:00" viewerId="me" />
    </I18nProvider>,
  );
}

describe('AgendaPage (server render smoke test)', () => {
  it('lists every scheduled vial with its days and hours', () => {
    const html = render([
      makeVial({ id: 'a', name: 'BPC-157', schedule: makeSchedule({ times: ['08:00', '20:00'] }) }),
      makeVial({ id: 'b', name: 'TB-500', schedule: makeSchedule({ times: ['09:00'] }) }),
    ]);
    expect(html).toContain('Calendar');
    expect(html).toContain('BPC-157');
    expect(html).toContain('TB-500');
    expect(html).toContain('08:00');
    expect(html).toContain('20:00');
    expect(html).toContain('09:00');
    expect(html).toContain('agenda__cell');
  });

  it('shows the amount to draw for the selected day', () => {
    // 5 mg / 2 mL, 250 mcg, U-100 → 0.1 mL → 10 units.
    expect(render([makeVial()])).toContain(DICTIONARIES.en.results.unitsWord);
  });

  it('shows the empty state when nothing is saved', () => {
    expect(render([])).toContain(DICTIONARIES.en.agenda.empty);
  });

  it('ignores vials without a plan and tombstoned vials', () => {
    const dead = tombstoneVial(makeVial({ id: 'x', name: 'Deleted one' }), '2024-01-01T10:00:00Z');
    const html = render([makeVial({ id: 'y', schedule: undefined }), dead]);
    expect(html).toContain(DICTIONARIES.en.agenda.empty);
    expect(html).not.toContain('Deleted one');
  });
});
