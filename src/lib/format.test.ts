import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, isInvalidNumberInput, parseNumber } from './format';

describe('formatNumber', () => {
  it('trims trailing zeros and rounds', () => {
    expect(formatNumber(2.5)).toBe('2.5');
    expect(formatNumber(0.10000001, 3)).toBe('0.1');
    expect(formatNumber(1234.5678, 2)).toBe('1,234.57');
  });

  it('never shows NaN', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

describe('parseNumber', () => {
  it('accepts a comma decimal separator (sk/sk-SK)', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber(' 2 ')).toBe(2);
  });

  it('treats blank and unparsable input as 0', () => {
    expect(parseNumber('')).toBe(0);
    expect(parseNumber('abc')).toBe(0);
  });
});

describe('isInvalidNumberInput', () => {
  it('is false for empty (not filled in yet) and for valid positives', () => {
    expect(isInvalidNumberInput('')).toBe(false);
    expect(isInvalidNumberInput('  ')).toBe(false);
    expect(isInvalidNumberInput('5')).toBe(false);
    expect(isInvalidNumberInput('0,25')).toBe(false);
  });

  it('is true for text and for zero/negative entries', () => {
    expect(isInvalidNumberInput('abc')).toBe(true);
    expect(isInvalidNumberInput('0')).toBe(true);
    expect(isInvalidNumberInput('-3')).toBe(true);
  });
});

describe('formatMoney', () => {
  it('formats with a currency when one is given', () => {
    expect(formatMoney(2.5, 'en-GB', 'EUR')).toContain('2.50');
  });

  it('falls back to a plain number without a currency', () => {
    expect(formatMoney(2.5)).toBe('2.5');
  });
});
