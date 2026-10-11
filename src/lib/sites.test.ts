import { describe, expect, it } from 'vitest';
import {
  SITE_ROTATION,
  nextSite,
  rotationLength,
  siteForDose,
  upcomingSites,
  type SiteId,
} from './sites';

describe('siteForDose', () => {
  it('walks the rotation in order', () => {
    expect(siteForDose(0)).toBe('abdomenLeft');
    expect(siteForDose(1)).toBe('abdomenRight');
    expect(siteForDose(5)).toBe('deltoidRight');
  });

  it('wraps around once the rotation is used up', () => {
    expect(siteForDose(6)).toBe('abdomenLeft');
    expect(siteForDose(13)).toBe('abdomenRight');
  });

  it('alternates the side on every single dose', () => {
    for (let dose = 0; dose < 24; dose += 1) {
      const current = siteForDose(dose) as SiteId;
      const following = siteForDose(dose + 1) as SiteId;
      expect(current.endsWith('Left')).not.toBe(following.endsWith('Left'));
    }
  });

  it('has no answer for a negative or non-finite dose number', () => {
    expect(siteForDose(-1)).toBeNull();
    expect(siteForDose(Number.NaN)).toBeNull();
    expect(siteForDose(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('accepts a custom rotation', () => {
    const rotation: SiteId[] = ['thighLeft', 'thighRight'];
    expect(siteForDose(0, rotation)).toBe('thighLeft');
    expect(siteForDose(1, rotation)).toBe('thighRight');
    expect(siteForDose(2, rotation)).toBe('thighLeft');
  });

  it('drops duplicates and unknown ids, and falls back to the default', () => {
    const messy = ['thighLeft', 'thighLeft', 'thighRight'] as SiteId[];
    expect(rotationLength(messy)).toBe(2);
    expect(siteForDose(1, messy)).toBe('thighRight');

    expect(rotationLength([])).toBe(SITE_ROTATION.length);
    expect(siteForDose(0, [])).toBe('abdomenLeft');
  });
});

describe('nextSite (derived, never logged)', () => {
  it('is the first site before any dose', () => {
    expect(nextSite(0)).toBe('abdomenLeft');
  });

  it('moves on with each dose already taken', () => {
    expect(nextSite(2)).toBe('thighLeft');
    expect(nextSite(5)).toBe('deltoidRight');
  });

  it('treats a negative count as none taken', () => {
    expect(nextSite(-4)).toBe('abdomenLeft');
  });
});

describe('upcomingSites', () => {
  it('lists the coming doses in order', () => {
    expect(upcomingSites(4, 3)).toEqual([
      { ordinal: 4, site: 'deltoidLeft' },
      { ordinal: 5, site: 'deltoidRight' },
      { ordinal: 6, site: 'abdomenLeft' },
    ]);
  });

  it('returns nothing for a zero or negative count', () => {
    expect(upcomingSites(0, 0)).toEqual([]);
    expect(upcomingSites(0, -2)).toEqual([]);
  });

  it('caps the list so a huge count cannot flood the UI', () => {
    expect(upcomingSites(0, 500)).toHaveLength(24);
  });
});
