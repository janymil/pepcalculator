import { describe, expect, it } from 'vitest';
import { VIEWS, hashForView, isViewId, viewFromHash } from './views';

describe('views', () => {
  it('lists the four pages', () => {
    expect(VIEWS).toEqual(['calculator', 'vials', 'calendar', 'settings']);
  });

  it('recognises a valid view id', () => {
    expect(isViewId('calculator')).toBe(true);
    expect(isViewId('vials')).toBe(true);
    expect(isViewId('calendar')).toBe(true);
    expect(isViewId('settings')).toBe(true);
    expect(isViewId('nope')).toBe(false);
    expect(isViewId(undefined)).toBe(false);
  });

  it('reads a view from a hash', () => {
    expect(viewFromHash('#calendar')).toBe('calendar');
    expect(viewFromHash('#/calendar')).toBe('calendar');
    expect(viewFromHash('#Calculator')).toBe('calculator');
    expect(viewFromHash('')).toBeNull();
    expect(viewFromHash('#')).toBeNull();
    expect(viewFromHash('#unknown')).toBeNull();
  });

  it('round-trips through a hash', () => {
    for (const view of VIEWS) {
      expect(viewFromHash(hashForView(view))).toBe(view);
    }
  });
});
