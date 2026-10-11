import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, startOfWeek, toIsoDate, weekdayOf } from './dates';

describe('date helpers', () => {
  it('formats a Date as a local yyyy-mm-dd string', () => {
    expect(toIsoDate(new Date(2026, 9, 10))).toBe('2026-10-10');
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('reports the weekday with Monday = 1', () => {
    expect(weekdayOf('2024-01-01')).toBe(1);
    expect(weekdayOf('2024-01-07')).toBe(0); // Sunday
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-10', 28)).toBe('2026-11-07');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('adds months, clamping to the last day of the month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-10', 3)).toBe('2027-01-10');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-10', '2026-11-07')).toBe(28);
    expect(daysBetween('2026-11-07', '2026-10-10')).toBe(-28);
  });

  it('finds the Monday of the week', () => {
    expect(startOfWeek('2024-01-01')).toBe('2024-01-01'); // already Monday
    expect(startOfWeek('2024-01-03')).toBe('2024-01-01'); // Wednesday
    expect(startOfWeek('2024-01-07')).toBe('2024-01-01'); // Sunday -> previous Monday
    expect(startOfWeek('2026-10-10')).toBe('2026-10-05'); // Saturday -> Monday
  });
});
