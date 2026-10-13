import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { Owner } from '../lib/owners';
import type { VialSchedule } from '../lib/schedule';
import type { VialShare } from '../lib/shares';
import {
  ShareForm,
  emptySharesDraft,
  sharesDraftFrom,
  sharesFromDrafts,
  type ShareDefaults,
} from './ShareForm';

const ME: Owner = { id: 'me', name: '' };
const ANA: Owner = { id: 'ana', name: 'Ana' };
const TOM: Owner = { id: 'tom', name: 'Tom' };

function daily(startsOn: string): VialSchedule {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn,
    durationValue: 4,
    durationUnit: 'weeks',
  };
}

function defaults(overrides: Partial<ShareDefaults> = {}): ShareDefaults {
  return {
    reconstitutedOn: '2026-05-01',
    from: '2026-05-03',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: daily('2026-05-01'),
    ...overrides,
  };
}

const render = (owners: Owner[], value: Parameters<typeof ShareForm>[0]['value']) =>
  renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <ShareForm
        owners={owners}
        ownerId="me"
        value={value}
        onChange={() => {}}
        defaults={defaults()}
      />
    </I18nProvider>,
  );

describe('emptySharesDraft', () => {
  it('makes a row for everyone except the vial’s owner', () => {
    const draft = emptySharesDraft([ME, ANA, TOM], 'me', defaults());
    expect(Object.keys(draft)).toEqual(['ana', 'tom']);
  });

  it('starts every row unticked, following the owner’s plan', () => {
    const row = emptySharesDraft([ME, ANA], 'me', defaults()).ana;
    expect(row.on).toBe(false);
    expect(row.samePlan).toBe(true);
    expect(row.from).toBe('2026-05-03');
    expect(row.doseAmount).toBe('250');
    expect(row.doseUnit).toBe('mcg');
  });

  it('seeds their plan from the owner’s cadence, so it starts familiar', () => {
    const row = emptySharesDraft([ME, ANA], 'me', defaults({ schedule: daily('2026-05-01') })).ana;
    expect(row.schedule.times).toEqual(['09:00']);
    expect(row.schedule.startsOn).toBe('2026-05-03');
  });
});

describe('sharesFromDrafts', () => {
  it('stores only the ticked people, in the order the rows were given', () => {
    const draft = emptySharesDraft([ME, ANA, TOM], 'me', defaults());
    draft.ana.on = true;
    draft.tom.on = true;

    expect(sharesFromDrafts(draft, '2026-05-01')).toEqual([
      { ownerId: 'ana', from: '2026-05-03' },
      { ownerId: 'tom', from: '2026-05-03' },
    ]);
  });

  it('stores nothing when nobody is ticked', () => {
    expect(
      sharesFromDrafts(emptySharesDraft([ME, ANA], 'me', defaults()), '2026-05-01'),
    ).toEqual([]);
  });

  it('records their own dose and cadence once “same plan” is off', () => {
    const draft = emptySharesDraft([ME, ANA], 'me', defaults());
    draft.ana.on = true;
    draft.ana.samePlan = false;
    draft.ana.doseAmount = '500';

    const [entry] = sharesFromDrafts(draft, '2026-05-01');
    expect(entry.doseAmount).toBe(500);
    expect(entry.doseUnit).toBe('mcg');
    expect(entry.schedule?.startsOn).toBe('2026-05-03');
  });

  it('keeps the start date on or after the day the vial was mixed', () => {
    const draft = emptySharesDraft([ME, ANA], 'me', defaults({ from: '2026-04-01' }));
    draft.ana.on = true;
    draft.ana.from = '2026-04-01';

    expect(sharesFromDrafts(draft, '2026-05-01')[0].from).toBe('2026-05-01');
  });
});

describe('sharesDraftFrom', () => {
  const stored: VialShare[] = [
    { ownerId: 'ana', from: '2026-05-03' },
    {
      ownerId: 'tom',
      from: '2026-05-05',
      doseAmount: 500,
      doseUnit: 'mcg',
      schedule: daily('2026-05-05'),
    },
  ];

  it('brings an existing share back ticked, with the day it started', () => {
    const draft = sharesDraftFrom(stored, [ME, ANA, TOM], 'me', defaults());
    expect(draft.ana.on).toBe(true);
    expect(draft.ana.from).toBe('2026-05-03');
    expect(draft.tom.on).toBe(true);
  });

  it('reads “same plan” straight off the record, so the box cannot lie', () => {
    const draft = sharesDraftFrom(stored, [ME, ANA, TOM], 'me', defaults());
    // Ana has no dose or cadence of her own — she follows the owner.
    expect(draft.ana.samePlan).toBe(true);
    // Tom carries a plan of his own.
    expect(draft.tom.samePlan).toBe(false);
    expect(draft.tom.doseAmount).toBe('500');
  });

  it('round-trips a stored share without drifting', () => {
    const draft = sharesDraftFrom(stored, [ME, ANA, TOM], 'me', defaults());
    expect(sharesFromDrafts(draft, '2026-05-01')).toEqual(stored);
  });

  it('gives a dose-only share the owner’s cadence rather than leaving it half-set', () => {
    // Reachable only by hand-editing the stored data: somebody with a dose of
    // their own but no cadence. Choosing "their own plan" means both, so the form
    // completes it — and the cadence it fills in is the one the fallback would
    // have used anyway, so nothing about the bottle changes.
    const draft = sharesDraftFrom(
      [{ ownerId: 'tom', from: '2026-05-05', doseAmount: 500, doseUnit: 'mcg' }],
      [ME, TOM],
      'me',
      defaults(),
    );

    const [entry] = sharesFromDrafts(draft, '2026-05-01');
    expect(entry.doseAmount).toBe(500);
    expect(entry.schedule?.startsOn).toBe('2026-05-05');
    expect(entry.schedule?.times).toEqual(['09:00']);
  });
});

describe('ShareForm (server render smoke test)', () => {
  it('asks about sharing and lists the people it could be shared with', () => {
    const html = render([ME, ANA], emptySharesDraft([ME, ANA], 'me', defaults()));

    expect(html).toContain(DICTIONARIES.en.shares.title);
    expect(html).toContain(DICTIONARIES.en.shares.hint);
    expect(html).toContain('Ana');
  });

  it('hides a person’s own plan until they stop following the owner’s', () => {
    const draft = emptySharesDraft([ME, ANA], 'me', defaults());
    draft.ana.on = true;

    const html = render([ME, ANA], draft);
    expect(html).toContain(DICTIONARIES.en.shares.from);
    expect(html).toContain(DICTIONARIES.en.shares.samePlan);
    expect(html).not.toContain(DICTIONARIES.en.shares.theirPlan);
  });

  it('shows their own dose and cadence once “same plan” is off', () => {
    const draft = emptySharesDraft([ME, ANA], 'me', defaults());
    draft.ana.on = true;
    draft.ana.samePlan = false;

    const html = render([ME, ANA], draft);
    expect(html).toContain(DICTIONARIES.en.shares.theirPlan);
    expect(html).toContain(DICTIONARIES.en.schedule.duration);
  });

  it('says to add a person first when there is nobody to share with', () => {
    const html = render([ME], emptySharesDraft([ME], 'me', defaults()));
    expect(html).toContain(DICTIONARIES.en.shares.addPeople);
  });
});
