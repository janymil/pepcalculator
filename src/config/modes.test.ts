import { describe, expect, it } from 'vitest';
import { MODES, modeMeta, resolveCapacity } from './modes';

describe('mode registry', () => {
  it('uses an insulin syringe for peptides and a volume syringe for anabolics', () => {
    expect(modeMeta('peptide').measure).toBe('insulin');
    expect(modeMeta('anabolic').measure).toBe('volume');
  });

  it('offers bigger syringes for oils than for peptides', () => {
    expect(Math.max(...modeMeta('anabolic').capacities)).toBeGreaterThan(
      Math.max(...modeMeta('peptide').capacities),
    );
  });

  it('keeps a remembered capacity that is valid for the mode', () => {
    expect(resolveCapacity('peptide', 0.5)).toBe(0.5);
    expect(resolveCapacity('anabolic', 5)).toBe(5);
  });

  it('falls back to the mode default when the remembered capacity does not fit', () => {
    // 0.3 mL is a peptide insulin syringe — anabolic mode must not use it.
    expect(resolveCapacity('anabolic', 0.3)).toBe(modeMeta('anabolic').defaultCapacityMl);
    // 10 mL is an oil syringe — peptide mode must not use it.
    expect(resolveCapacity('peptide', 10)).toBe(modeMeta('peptide').defaultCapacityMl);
  });

  it('registers each mode once', () => {
    const ids = MODES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
