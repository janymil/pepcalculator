import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { VialSchedule } from '../lib/schedule';
import type { SavedVial } from '../lib/vials';
import { SavedVials } from './SavedVials';

const MONDAY = '2024-01-01';

function makeSchedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: MONDAY,
    durationValue: 4,
    durationUnit: 'weeks',
    ...overrides,
  };
}

function peptideVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'p1',
    name: 'BPC-157',
    kind: 'peptide',
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

function anabolicVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'a1',
    name: 'Testosterone E',
    kind: 'anabolic',
    reconstitutedOn: MONDAY,
    vialAmount: 0,
    vialUnit: 'mg',
    waterMl: 0,
    concentrationMgPerMl: 250,
    vialMl: 10,
    doseAmount: 250,
    doseUnit: 'mg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 3,
    schedule: makeSchedule(),
    ...overrides,
  };
}

function render(vials: SavedVial[], onOpenGlp1?: () => void): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <SavedVials
        vials={vials}
        owners={[{ id: 'me', name: '' }]}
        todayIso={MONDAY}
        nowTime="07:00"
        onUpdate={() => {}}
        onRestore={() => {}}
        onLoad={() => {}}
        onAddDose={() => {}}
        onRemoveDose={() => {}}
        onDelete={() => {}}
        onOpenGlp1={onOpenGlp1}
      />
    </I18nProvider>,
  );
}

describe('SavedVials page (server render smoke test)', () => {
  it('lists peptides and anabolics with a kind filter and the backup actions', () => {
    const html = render([peptideVial(), anabolicVial()]);
    expect(html).toContain('vials-title');
    expect(html).toContain('vials__toolbar');
    expect(html).toContain('BPC-157');
    expect(html).toContain('Testosterone E');
    expect(html).toContain('Peptides');
    expect(html).toContain('Anabolics');
    expect(html).toContain('backup__title');
  });

  it('shows the empty state when nothing is saved', () => {
    expect(render([])).toContain(DICTIONARIES.en.vials.empty);
  });

  it('shows no expiry date for anabolic oils', () => {
    const html = render([anabolicVial()]);
    expect(html).toContain(DICTIONARIES.en.vials.noExpiry);
  });

  it('shows the 28-day use-by for peptides', () => {
    const html = render([peptideVial()]);
    expect(html).not.toContain(DICTIONARIES.en.vials.noExpiry);
  });

  it('says what a backup contains, so nobody assumes it is one person', () => {
    expect(render([peptideVial()])).toContain(DICTIONARIES.en.backup.scope);
  });

  it('offers the GLP-1 care page from a GLP-1 vial', () => {
    const label = DICTIONARIES.en.glp1.openPage;
    const glp1 = peptideVial({ id: 'g1', name: 'Tirzepatide', kind: 'glp1' });

    const html = render([glp1], () => {});
    // Shown without expanding the card, and shown exactly once.
    expect(html.split(`>${label}</button>`).length - 1).toBe(1);

    // Not on a peptide card: the link is only useful where the class is used.
    expect(render([peptideVial()], () => {})).not.toContain(label);
  });
});
