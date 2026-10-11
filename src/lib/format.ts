/** Number + text formatting helpers used across the UI. */

/**
 * Formats a number with a fixed maximum amount of decimals, trimming trailing
 * zeros. Returns an em dash for non-finite values so the UI never shows "NaN".
 */
export function formatNumber(value: number, maxDecimals = 3): string {
  if (!Number.isFinite(value)) return '—';
  const factor = 10 ** maxDecimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  if (Object.is(rounded, -0)) return '0';
  return rounded.toLocaleString('en-US', { maximumFractionDigits: maxDecimals });
}

export const fmt = {
  /** Volumes in mL — e.g. 0.1 */
  volume: (value: number) => formatNumber(value, 3),
  /** Insulin units — e.g. 12.5 */
  units: (value: number) => formatNumber(value, 1),
  /** Concentrations in mg/mL — small values need more precision. */
  concentration: (value: number) => formatNumber(value, 4),
  /** Masses in mg. */
  mass: (value: number) => formatNumber(value, 3),
  /** Counts such as "doses per vial". */
  count: (value: number) => formatNumber(value, 1),
};

/**
 * Turns user input into a number. Accepts both "1.5" and "1,5" (comma is the
 * decimal separator in Slovak), treats blank input as 0 and anything
 * unparsable as 0 so the calculator never shows NaN.
 */
export function parseNumber(input: string): number {
  const normalized = input.trim().replace(',', '.');
  if (normalized === '') return 0;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Formats an ISO date (`yyyy-mm-dd`) for display, e.g. "10 Oct 2026" in `en-GB`
 * or "10. 10. 2026" in `sk-SK`. Falls back to the raw value if unparsable.
 */
export function formatDate(iso: string, locale = 'en-GB'): string {
  const parts = iso.split('-').map(Number);
  const date = new Date(parts[0] || 1970, (parts[1] || 1) - 1, parts[2] || 1);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Short weekday name for `weekday` (0 = Sunday … 6 = Saturday). Derived from
 * `Intl` rather than hard-coded, so it is already localised in every language.
 */
export function weekdayShort(locale: string, weekday: number): string {
  // 2024-01-01 was a Monday, which makes a convenient anchor.
  const offset = (weekday + 6) % 7; // Mon(1) -> 0 … Sun(0) -> 6
  return new Date(2024, 0, 1 + offset).toLocaleDateString(locale, { weekday: 'short' });
}

/** Long month + year, e.g. "October 2026". `month` is 0-based. */
export function monthLabel(locale: string, year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}


