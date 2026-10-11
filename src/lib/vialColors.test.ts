import { describe, expect, it } from 'vitest';
import { VIAL_COLORS, vialColor, vialColorIndex } from './vialColors';

describe('vialColors', () => {
  it('always returns a colour from the palette', () => {
    for (const id of ['a', 'vial-1', '8f14e45f-ceea-467f-b0b4-9e0d2c1a1234', '']) {
      expect(VIAL_COLORS).toContain(vialColor(id));
    }
  });

  it('is stable for the same id', () => {
    expect(vialColor('vial-1')).toBe(vialColor('vial-1'));
    expect(vialColorIndex('vial-1')).toBe(vialColorIndex('vial-1'));
  });

  it('keeps the index in range', () => {
    for (let i = 0; i < 200; i += 1) {
      const index = vialColorIndex(`vial-${i}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(VIAL_COLORS.length);
    }
  });

  it('spreads a run of ids across several colours', () => {
    const used = new Set(Array.from({ length: 20 }, (_, i) => vialColorIndex(`id-${i}`)));
    expect(used.size).toBeGreaterThan(2);
  });
});
