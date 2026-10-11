import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGUAGES, detectLang, interpolate } from './index';
import type { Strings } from './types';

/**
 * Flattens a nested dictionary into `"path.to.key" -> string` pairs, so two
 * dictionaries can be compared structurally regardless of nesting.
 */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof value === 'string') {
    out[prefix] = value;
    return out;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

const englishKeys = Object.keys(flatten(DICTIONARIES.en)).sort();

describe('i18n dictionaries', () => {
  it('ships English, Slovak and Spanish', () => {
    expect(LANGUAGES).toEqual(['en', 'sk', 'es']);
  });

  it.each(LANGUAGES)('%s has exactly the same keys as English', (lang) => {
    expect(Object.keys(flatten(DICTIONARIES[lang])).sort()).toEqual(englishKeys);
  });

  it.each(LANGUAGES)('%s has no blank strings', (lang) => {
    const blank = Object.entries(flatten(DICTIONARIES[lang])).filter(
      ([, value]) => value.trim() === '',
    );
    expect(blank).toEqual([]);
  });

  it('uses the same {placeholders} in every language', () => {
    const placeholders = (strings: Strings) =>
      Object.entries(flatten(strings))
        .map(([key, value]) => `${key}:${(value.match(/\{(\w+)\}/g) ?? []).join(',')}`)
        .sort();
    for (const lang of LANGUAGES) {
      expect(placeholders(DICTIONARIES[lang])).toEqual(placeholders(DICTIONARIES.en));
    }
  });
});

describe('interpolate', () => {
  it('replaces known placeholders', () => {
    expect(interpolate('{a} mL of {b}', { a: 2, b: 'x' })).toBe('2 mL of x');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('{a} {b}', { a: 1 })).toBe('1 {b}');
  });

  it('returns the template when there are no params', () => {
    expect(interpolate('plain text')).toBe('plain text');
  });
});

describe('detectLang', () => {
  it('always returns a supported language', () => {
    expect(LANGUAGES).toContain(detectLang());
  });
});
