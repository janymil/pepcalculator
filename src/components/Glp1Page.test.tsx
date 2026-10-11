import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { MEASURE_FIELDS, type Measurement } from '../lib/measure';
import { Glp1Page } from './Glp1Page';

const copy = DICTIONARIES.en.glp1;

/** A log with one point that has two entries (waist) and one that has a single. */
const log: Measurement[] = [
  { id: 'a', date: '2026-01-05', waistCm: 104, weightKg: 96, updatedAt: '2026-01-05T08:00:00.000Z' },
  { id: 'b', date: '2026-01-26', waistCm: 98, updatedAt: '2026-01-26T08:00:00.000Z' },
];

const html = renderToString(
  <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
    <Glp1Page measurements={log} todayIso="2026-01-26" onAdd={() => {}} onRemove={() => {}} />
  </I18nProvider>,
);

describe('Glp1Page (server render smoke test)', () => {
  it('opens with its own disclaimer, in its own words', () => {
    expect(html).toContain('glp1-title');
    expect(html).toContain(copy.title);
    expect(html).toContain(copy.note);
  });

  it('renders both device routines, every step of them', () => {
    for (const routine of [copy.routine.pen, copy.routine.vial]) {
      expect(html).toContain(routine.title);
      for (const step of routine.steps) {
        expect(html).toContain(step.title);
        expect(html).toContain(step.body);
      }
    }

    expect(html.match(/glp1__step-num/g)).toHaveLength(
      copy.routine.pen.steps.length + copy.routine.vial.steps.length,
    );
  });

  it('lists every pre-use check', () => {
    expect(html).toContain(copy.checks.title);
    expect(html.match(/glp1__check-icon/g)).toHaveLength(copy.checks.items.length);
    for (const item of copy.checks.items) expect(html).toContain(item.title);
  });

  it('asks the prescriber questions, as questions', () => {
    expect(html).toContain(copy.ask.title);
    expect(html.match(/glp1__question/g)).toHaveLength(copy.ask.items.length);
    for (const question of copy.ask.items) expect(html).toContain(question);
  });

  it('says where on the body each point is measured, and how', () => {
    expect(html).toContain(copy.track.where);
    for (const field of MEASURE_FIELDS) {
      expect(html).toContain(copy.points[field].label);
      expect(html).toContain(copy.points[field].how);
    }
  });

  it('offers one input per measurement point, and refuses an empty entry', () => {
    expect((html.match(/glp1__field"/g) ?? []).length).toBe(MEASURE_FIELDS.length);
    expect(html).toContain(copy.track.add);
    // Nothing typed in yet, so the save button has to be inert.
    expect(html).toContain('disabled');
  });

  it('reports the change since the first entry, and no verdict on it', () => {
    expect(html).toContain(copy.track.since);
    // 104 cm -> 98 cm, in the app's own baseline: the first waist entry.
    expect(html).toContain('104 → 98');
  });

  it('draws a trend only where there is more than one point to draw', () => {
    // Waist has two entries; weight has one, so it gets no line.
    expect(html.match(/glp1__trend"/g)).toHaveLength(1);
  });

  it('lists the log newest first', () => {
    expect(html).toContain('glp1__log');
    expect(html.indexOf('26 Jan 2026')).toBeLessThan(html.indexOf('5 Jan 2026'));
  });

  it('has something honest to show before anything is logged', () => {
    const empty = renderToString(
      <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
        <Glp1Page measurements={[]} todayIso="2026-01-26" onAdd={() => {}} onRemove={() => {}} />
      </I18nProvider>,
    );
    expect(empty).toContain(copy.track.empty);
    expect(empty).not.toContain('glp1__trend');
  });
});
