import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LANGUAGES } from '../i18n';
import { WORKED_EXAMPLES, runExample } from './workedExamples';

describe('worked examples', () => {
  it('has unique ids', () => {
    const ids = WORKED_EXAMPLES.map((example) => example.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(WORKED_EXAMPLES)('the engine reproduces $id', (example) => {
    const result = runExample(example);

    expect(result.ok).toBe(true);
    expect(result.volumeMl).toBeCloseTo(example.expected.volumeMl, 9);
    if (example.expected.units !== undefined) {
      expect(result.units).toBeCloseTo(example.expected.units, 9);
    }
    if (example.expected.clicks !== undefined) {
      expect(result.clicks).toBeCloseTo(example.expected.clicks, 9);
    }
  });

  it('gives every example a non-empty label in all three languages', () => {
    for (const lang of LANGUAGES) {
      for (const example of WORKED_EXAMPLES) {
        expect(DICTIONARIES[lang].proof.examples[example.id].trim().length).toBeGreaterThan(0);
      }
    }
  });
});
