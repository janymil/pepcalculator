import { describe, expect, it } from 'vitest';
import { VIAL_ANGLES, VIAL_COLORS, vialColor, vialColorIndex, vialDotStyle, vialPatternAngle } from './vialColors';

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

  it('gives every vial one of the four stripe angles', () => {
    for (const id of ['a', 'vial-1', '', 'x'.repeat(40)]) {
      expect(VIAL_ANGLES).toContain(vialPatternAngle(id));
    }
  });

  it('marks the same vial with the same angle every time', () => {
    expect(vialPatternAngle('vial-1')).toBe(vialPatternAngle('vial-1'));
    // …and passes it to the dot as a CSS custom property.
    expect(vialDotStyle('vial-1')['--vial-angle']).toBe(`${vialPatternAngle('vial-1')}deg`);
  });

  it('uses more than one angle across a run of vials', () => {
    const used = new Set(Array.from({ length: 20 }, (_, i) => vialPatternAngle(`id-${i}`)));
    expect(used.size).toBeGreaterThan(1);
  });
});
