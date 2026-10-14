import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  MESSAGES,
  digestEntries,
  localDay,
  planBlock,
  planChoices,
  planList,
  resolveLanguage,
  tableFor,
} from './messages.mjs';

const SAMPLE = { label: 'Morning protocol', dose: '10 units (250 mcg)', time: '08:00' };

/** One dose as the digest takes it, and the digest that holds it. */
const ENTRY = { time: '08:00', label: 'Morning protocol', dose: '10 units', draw: 'draw to 20 units' };

/** The digest for a language, built the way the worker builds it. */
const digestFor = (lang, entry = ENTRY) => MESSAGES[lang].digest({ entries: digestEntries(lang, [entry]) });

const PLANS = [
  { label: 'Morning protocol', dose: '10 units', time: '08:00', status: 'active' },
  { label: 'Evening peptide', dose: '', time: '20:00', status: 'paused' },
];

describe('resolveLanguage', () => {
  it('understands the tags a browser actually sends', () => {
    expect(resolveLanguage('sk')).toBe('sk');
    expect(resolveLanguage('SK')).toBe('sk');
    expect(resolveLanguage('sk-SK')).toBe('sk');
    expect(resolveLanguage('es-419')).toBe('es');
    expect(resolveLanguage('en-US')).toBe('en');
    expect(resolveLanguage('  en  ')).toBe('en');
  });

  it('falls back rather than throwing on a language it does not have', () => {
    // An unrecognised tag is a display problem, not a reason to drop a reply.
    expect(resolveLanguage('fr')).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('de-DE')).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage('')).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage(null)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    expect(resolveLanguage(42)).toBe(DEFAULT_LANGUAGE);
  });

  it('has exactly the three languages the app speaks', () => {
    expect(LANGUAGES).toEqual(['en', 'sk', 'es']);
    expect(Object.keys(MESSAGES).sort()).toEqual(['en', 'es', 'sk']);
  });
});

describe('the language tables', () => {
  it('every language says everything the English one does', () => {
    // A missing key would otherwise surface as a blank WhatsApp message, in
    // production, in a language the developer probably does not read.
    const keys = Object.keys(MESSAGES.en).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(MESSAGES[lang]).sort(), `language: ${lang}`).toEqual(keys);
    }
  });

  it('every message builds a non-empty string in every language', () => {
    const vars = {
      label: 'Morning protocol',
      dose: '10 units',
      time: '08:00',
      plans: '1. A — 08:00',
      count: 1,
      max: 5,
      manageUrl: 'https://pepstool.com',
      entries: '08:00 · Morning protocol\nDose: 10 units',
    };

    for (const lang of LANGUAGES) {
      for (const key of Object.keys(MESSAGES[lang])) {
        // Tables and plain words hold data, not builders.
        if (key === 'fields' || key === 'statusWords' || key === 'days' || key === 'you') continue;
        const built = MESSAGES[lang][key](vars);
        expect(typeof built, `${lang}.${key}`).toBe('string');
        expect(built.trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('names every status in every language', () => {
    const statuses = ['active', 'paused', 'stopped', 'pending', 'error'];
    for (const lang of LANGUAGES) {
      for (const status of statuses) {
        expect(typeof MESSAGES[lang].statusWords[status], `${lang}.${status}`).toBe('string');
        expect(MESSAGES[lang].statusWords[status]).not.toBe('');
      }
    }
  });

  it('answers with a usable table for any language', () => {
    expect(typeof tableFor('en')).toBe('object');
    expect(typeof tableFor('fr')).toBe('object');
    expect(tableFor('fr')).toBe(tableFor('en'));
  });
});

describe('the wording rules, in every language', () => {
  it('never carries a link in a digest', () => {
    for (const lang of LANGUAGES) {
      expect(digestFor(lang), lang).not.toContain('http');
    }
  });

  it('always tells the user how to stop', () => {
    for (const lang of LANGUAGES) {
      expect(digestFor(lang), lang).toContain('STOP');
      expect(MESSAGES[lang].linked(SAMPLE), lang).toContain('STOP');
      expect(MESSAGES[lang].alreadyLinked(SAMPLE), lang).toContain('STOP');
    }
  });

  it('makes no medical claim of its own', () => {
    // The line this project does not cross: it is a planner, not advice.
    //
    // Checked with the dose **empty** on purpose. "250 mcg" is the user's own
    // word about their own plan, and repeating it back is not a claim — but the
    // server's own sentences must never mention a unit at all.
    const forbidden = ['mg', 'mcg', 'iu', 'medication', 'treatment', 'cure', 'disease'];
    for (const lang of LANGUAGES) {
      const own = digestFor(lang, { time: '08:00', label: 'x', dose: '', draw: '' }).toLowerCase();
      for (const word of forbidden) expect(own, `${lang}: ${word}`).not.toContain(word);
    }
  });

  it('drops the dose line when there is no dose, without a stray blank', () => {
    for (const lang of LANGUAGES) {
      const withDose = digestFor(lang);
      const without = digestFor(lang, { ...ENTRY, dose: '', draw: '' });
      expect(without.length, lang).toBeLessThan(withDose.length);
      expect(without, lang).not.toContain('\n\n\n');
    }
  });

  it('leaves the plans link out when no URL is configured', () => {
    for (const lang of LANGUAGES) {
      expect(MESSAGES[lang].help({}), lang).not.toContain('http');
      expect(MESSAGES[lang].notLinked({}), lang).not.toContain('http');
    }
  });
});

describe('the plan lists', () => {
  it('numbers the blocks from one', () => {
    const text = planList('en', PLANS);
    expect(text).toContain('1. Morning protocol');
    expect(text).toContain('2. Evening peptide');
    expect(text).not.toContain('0. ');
  });

  it('uses the language table for the field names', () => {
    expect(planList('en', PLANS)).toContain('Time: 08:00');
    expect(planList('sk', PLANS)).toContain('Čas: 08:00');
    expect(planList('es', PLANS)).toContain('Hora: 08:00');
  });

  it('translates the status word', () => {
    expect(planList('sk', PLANS.slice(0, 1))).toContain('zapnuté');
    expect(planList('es', PLANS.slice(1, 2))).toContain('en pausa');
  });

  it('leaves the dose line out when a plan has no dose', () => {
    const block = planBlock('en', PLANS[1], 1);
    expect(block).toContain('2. Evening peptide');
    expect(block).not.toContain('Dose');
  });

  it('names one line per plan, for "which one?"', () => {
    expect(planChoices('en', PLANS)).toBe('1. Morning protocol — 08:00\n2. Evening peptide — 20:00');
  });

  it('copes with a plan that has no label at all', () => {
    expect(planChoices('en', [{ label: '', time: '09:00' }])).toBe('1. ? — 09:00');
  });
});

describe('the daily digest', () => {
  it('puts every dose of the day in one message, earliest first', () => {
    const entries = digestEntries('en', [
      { time: '10:00', label: 'Nad+', dose: '50 mg', draw: 'draw to 20 units' },
      { time: '13:00', label: 'Testosterone', dose: '25 mg', draw: 'draw to 10 units' },
    ]);
    expect(entries).toContain('10:00 · Nad+');
    expect(entries).toContain('Dose: 50 mg · draw to 20 units');
    expect(entries.indexOf('10:00')).toBeLessThan(entries.indexOf('13:00'));
  });

  it('leaves the draw out rather than inventing one', () => {
    // The app cannot always work out units — a vial with no concentration has
    // nothing to draw from. A missing number is fine; a wrong one is not.
    expect(digestEntries('en', [{ time: '08:00', label: 'X', dose: '50 mg', draw: '' }])).toBe(
      '08:00 · X\nDose: 50 mg',
    );
  });

  it('uses the language for the field name, not just the sentences', () => {
    const entry = { time: '08:00', label: 'X', dose: '50 mg', draw: '' };
    expect(digestEntries('sk', [entry])).toContain('Dávka: 50 mg');
    expect(digestEntries('es', [entry])).toContain('Dosis: 50 mg');
  });

  it('leaves the person heading out when only one person is involved', () => {
    // The common case: one person on the device. A heading answering "whose?"
    // when there is only one person would be noise on every message.
    const entries = digestEntries('en', [{ time: '08:00', label: 'X', dose: '', person: '' }]);
    expect(entries).not.toContain('For ');
  });

  it('divides the digest by person once the device holds two', () => {
    const entries = digestEntries('en', [
      { time: '08:00', label: 'Mine', dose: '', person: '' },
      { time: '09:00', label: 'Hers', dose: '', person: 'Ana' },
    ]);
    expect(entries).toContain('For you');
    expect(entries).toContain('For Ana');
    // Each person's doses stay under their own heading, in time order.
    expect(entries.indexOf('For you')).toBeLessThan(entries.indexOf('Mine'));
    expect(entries.indexOf('Mine')).toBeLessThan(entries.indexOf('For Ana'));
    expect(entries.indexOf('For Ana')).toBeLessThan(entries.indexOf('Hers'));
  });

  it('translates the person heading rather than hard-coding it', () => {
    const rows = [
      { time: '08:00', label: 'X', dose: '', person: '' },
      { time: '09:00', label: 'Y', dose: '', person: 'Ana' },
    ];
    expect(digestEntries('sk', rows)).toContain('Pre Ana');
    expect(digestEntries('es', rows)).toContain('Para Ana');
  });
});

describe('naming the day', () => {
  // 2026-10-14 is a Wednesday, and this is the real bug: a message sent at
  // 12:34 Lima said "next one at 10:00" with no day at all, and read as
  // tomorrow morning. The dose was Friday.
  const now = Date.UTC(2026, 9, 14, 17, 34);
  const zone = 'America/Lima';

  it('says "today" for a dose later the same day', () => {
    const atMs = Date.UTC(2026, 9, 14, 15, 0);
    expect(localDay({ atMs, nowMs: now, timeZone: zone, lang: 'en' })).toBe('today');
  });

  it('says "tomorrow" for the next day', () => {
    const atMs = Date.UTC(2026, 9, 15, 15, 0);
    expect(localDay({ atMs, nowMs: now, timeZone: zone, lang: 'en' })).toBe('tomorrow');
  });

  it('names the weekday and the date once it is further out', () => {
    const label = localDay({ atMs: Date.UTC(2026, 9, 16, 15, 0), nowMs: now, timeZone: zone, lang: 'en' });
    expect(label).toContain('Friday');
    expect(label).toContain('16');
  });

  it('translates the words rather than hard-coding them', () => {
    const atMs = Date.UTC(2026, 9, 14, 15, 0);
    expect(localDay({ atMs, nowMs: now, timeZone: zone, lang: 'sk' })).toBe('dnes');
    expect(localDay({ atMs, nowMs: now, timeZone: zone, lang: 'es' })).toBe('hoy');
  });

  it('decides the day in the local zone, not the server one', () => {
    // 02:00Z on the 15th is still 21:00 on the 14th in Lima, so a dose then is
    // "today" — and a server thinking in UTC would call it tomorrow.
    const atMs = Date.UTC(2026, 9, 15, 2, 0);
    expect(localDay({ atMs, nowMs: now, timeZone: zone, lang: 'en' })).toBe('today');
  });
});

