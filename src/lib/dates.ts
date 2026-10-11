/**
 * Small, dependency-free date helpers shared by the saved-vial and dose-schedule
 * logic. Everything works on plain `yyyy-mm-dd` strings in local time, so ISO
 * string comparison doubles as chronological comparison.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** A Date's local date as `yyyy-mm-dd`. */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses `yyyy-mm-dd` into a local noon Date, avoiding DST/UTC edge cases. */
export function parseIsoDate(iso: string): Date {
  const parts = iso.split('-').map(Number);
  const year = parts[0] || 1970;
  const month = parts[1] || 1;
  const day = parts[2] || 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Returns `iso` shifted by `days`. */
export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Returns `iso` shifted by whole months, clamping to the last day of the month. */
export function addMonths(iso: string, months: number): string {
  const date = parseIsoDate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, daysInMonth));
  return toIsoDate(date);
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

/** Day of week for `iso`: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return parseIsoDate(iso).getDay();
}

/** The Monday of the week containing `iso`. */
export function startOfWeek(iso: string): string {
  const offset = (weekdayOf(iso) + 6) % 7; // Monday -> 0, Sunday -> 6
  return addDays(iso, -offset);
}
