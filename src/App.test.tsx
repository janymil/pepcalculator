import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

/**
 * Full-tree smoke test.
 *
 * Rendering the whole app to a string exercises every component, the i18n
 * provider, the storage hook and the calculation wiring in one go. It runs in
 * plain Node (no jsdom / testing-library needed), because `renderToString` is
 * part of react-dom.
 *
 * Assertions stay language-agnostic (the default language follows the OS), so
 * they never break when English or Slovak is picked.
 */
describe('App (server render smoke test)', () => {
  const html = renderToString(<App />);

  it('renders the app shell and brand', () => {
    expect(html).toContain('PepCalculator');
    expect(html).toContain('disclaimer');
  });

  it('renders both mode options', () => {
    expect(html.match(/mode__title/g)).toHaveLength(2);
  });

  it('renders the save-vial form with a dose schedule', () => {
    expect(html).toContain('save-vial');
    expect(html).toContain('vials__form');
    expect(html).toContain('schedule__title');
    expect(html).toContain('schedule__time');
  });

  it('opens on the calculator page — other pages are not rendered yet', () => {
    // Sync, reminders and the saved-vials list now live on their own pages.
    expect(html).not.toContain('sync-title');
    expect(html).not.toContain('vials-title');
    expect(html).not.toContain('reminders-title');
    expect(html).not.toContain('reference-title');
  });

  it('renders the five-page switcher', () => {
    expect(html.match(/views__tab/g)).toHaveLength(5);
    expect(html).toContain('Calculator');
    expect(html).toContain('My vials');
    expect(html).toContain('Calendar');
    expect(html).toContain('Reference');
    expect(html).toContain('Settings');
  });

  it('shows the default peptide result right away', () => {
    // Defaults: 5 mg vial / 2 mL water -> 2.5 mg/mL.
    // Dose 250 mcg = 0.25 mg -> 0.1 mL -> 10 units on a U-100 syringe.
    // 5 mg / 0.25 mg = 20 doses per vial.
    expect(html).toContain('hero__number">10</span>');
    expect(html).toContain('2.5 mg/mL');
    expect(html).toContain('stat__value">20</dd>');
  });

  it('defaults the syringe scale to U-100', () => {
    expect(html).toContain('U-100');
  });
});
