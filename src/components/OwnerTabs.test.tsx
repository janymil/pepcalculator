import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { Owner } from '../lib/owners';
import { OwnerTabs } from './OwnerTabs';

const OWNERS: Owner[] = [
  { id: 'me', name: '' },
  { id: 'wife', name: 'Kim' },
];

function render(activeId: string): string {
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <OwnerTabs owners={OWNERS} activeId={activeId} onSelect={() => {}} onAdd={() => {}} />
    </I18nProvider>,
  );
}

describe('OwnerTabs (server render smoke test)', () => {
  it('lists every person and falls back to "Me" for an unnamed one', () => {
    const html = render('wife');
    expect(html).toContain('owners');
    expect(html).toContain('Kim');
    expect(html).toContain(DICTIONARIES.en.people.me);
    expect(html).toContain(DICTIONARIES.en.people.add);
  });

  it('marks exactly one person as selected (never "all")', () => {
    const html = render('wife');
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).not.toContain(DICTIONARIES.en.kinds.all);
  });

  it('marks a different person when the scope changes', () => {
    const activeIndex = render('me').indexOf('aria-pressed="true"');
    const wifeIndex = render('wife').indexOf('aria-pressed="true"');
    expect(activeIndex).toBeGreaterThan(0);
    expect(wifeIndex).toBeGreaterThan(activeIndex);
  });
});
