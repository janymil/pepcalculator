import { describe, expect, it } from 'vitest';
import {
  MEASURE_FIELDS,
  changeSinceStart,
  fieldUnit,
  hasAnyValue,
  mergeMeasurements,
  normalizeMeasurements,
  pointsFor,
  type Measurement,
} from './measure';

function entry(over: Partial<Measurement> = {}): Measurement {
  return { id: 'm1', date: '2026-01-01', updatedAt: '2026-01-01T09:00:00.000Z', ...over };
}

describe('measure fields', () => {
  it('reads circumferences in cm and weight in kg', () => {
    expect(fieldUnit('waistCm')).toBe('cm');
    expect(fieldUnit('thighCm')).toBe('cm');
    expect(fieldUnit('weightKg')).toBe('kg');
  });

  it('leads with the waist — the one that tracks this class, and measurably repeatable', () => {
    expect(MEASURE_FIELDS[0]).toBe('waistCm');
  });
});

describe('changeSinceStart', () => {
  it('needs two entries: one number is a measurement, not a change', () => {
    expect(changeSinceStart([entry({ waistCm: 100 })], 'waistCm')).toBeNull();
  });

  it('compares against the first entry that recorded that field', () => {
    const list = [
      entry({ id: 'a', date: '2026-01-01', waistCm: 104 }),
      // No waist here: for the waist comparison this entry does not exist.
      entry({ id: 'b', date: '2026-02-01', weightKg: 95 }),
      entry({ id: 'c', date: '2026-03-01', waistCm: 96 }),
    ];

    const change = changeSinceStart(list, 'waistCm');
    expect(change).toMatchObject({ from: 104, to: 96, delta: -8, points: 2 });
    expect(change?.fromDate).toBe('2026-01-01');
    expect(change?.toDate).toBe('2026-03-01');
  });

  it('reports a gain as a gain — the number, with no verdict attached', () => {
    const list = [
      entry({ id: 'a', date: '2026-01-01', weightKg: 90 }),
      entry({ id: 'b', date: '2026-02-01', weightKg: 93 }),
    ];
    expect(changeSinceStart(list, 'weightKg')).toMatchObject({ delta: 3 });
  });

  it('ignores an entry the user removed', () => {
    const list = [
      entry({ id: 'a', date: '2026-01-01', waistCm: 104 }),
      entry({ id: 'b', date: '2026-02-01', waistCm: 96, deletedAt: '2026-02-02T00:00:00.000Z' }),
      entry({ id: 'c', date: '2026-03-01', waistCm: 99 }),
    ];
    expect(changeSinceStart(list, 'waistCm')).toMatchObject({ from: 104, to: 99, points: 2 });
  });
});

describe('pointsFor', () => {
  it('returns one field oldest first, whatever order it was saved in', () => {
    const list = [
      entry({ id: 'c', date: '2026-03-01', weightKg: 88 }),
      entry({ id: 'a', date: '2026-01-01', weightKg: 92 }),
    ];
    expect(pointsFor(list, 'weightKg')).toEqual([
      { date: '2026-01-01', value: 92 },
      { date: '2026-03-01', value: 88 },
    ]);
  });

  it('has nothing for a field that was never measured', () => {
    expect(pointsFor([entry({ waistCm: 100 })], 'thighCm')).toEqual([]);
  });
});

describe('hasAnyValue', () => {
  it('is true only when at least one figure is usable', () => {
    expect(hasAnyValue(entry({ waistCm: 100 }))).toBe(true);
    expect(hasAnyValue(entry())).toBe(false);
  });
});

describe('normalizeMeasurements', () => {
  it('keeps the usable records and drops the noise', () => {
    const list = normalizeMeasurements([
      { id: 'm1', date: '2026-01-01', waistCm: 104 },
      { id: 'm2', date: 'not-a-date', waistCm: 100 },
      { id: 'm3', date: '2026-01-02' },
      { nope: true },
    ]);

    expect(list.map((item) => item.id)).toEqual(['m1']);
    expect(list[0]?.updatedAt).toBe('2026-01-01');
  });

  it('rejects junk numbers rather than storing them', () => {
    const list = normalizeMeasurements([
      { id: 'm1', date: '2026-01-01', waistCm: -5, weightKg: 0, thighCm: 60 },
    ]);

    expect(list[0]?.waistCm).toBeUndefined();
    expect(list[0]?.weightKg).toBeUndefined();
    expect(list[0]?.thighCm).toBe(60);
  });

  it('keeps a tombstone even though it holds no figures', () => {
    const list = normalizeMeasurements([
      { id: 'm1', date: '2026-01-01', deletedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(list[0]?.deletedAt).toBe('2026-01-02T00:00:00.000Z');
  });

  it('de-duplicates by id', () => {
    const list = normalizeMeasurements([
      { id: 'm1', date: '2026-01-01', waistCm: 1 },
      { id: 'm1', date: '2026-01-02', waistCm: 2 },
    ]);
    expect(list).toHaveLength(1);
  });

  it('is not fooled by something that is not a list', () => {
    expect(normalizeMeasurements('nope')).toEqual([]);
    expect(normalizeMeasurements(null)).toEqual([]);
    expect(normalizeMeasurements({ id: 'm1' })).toEqual([]);
  });
});

describe('mergeMeasurements', () => {
  it('unions by id and lets the newest copy win', () => {
    const current = [
      entry({ id: 'a', waistCm: 100, updatedAt: '2026-01-02T00:00:00.000Z' }),
    ];
    const incoming = [
      // An older copy of the same record must not overwrite a newer one.
      entry({ id: 'a', waistCm: 90, updatedAt: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'b', date: '2026-02-01', waistCm: 95, updatedAt: '2026-02-01T00:00:00.000Z' }),
    ];

    const merged = mergeMeasurements(current, incoming);
    expect(merged.map((item) => item.id).sort()).toEqual(['a', 'b']);
    expect(merged.find((item) => item.id === 'a')?.waistCm).toBe(100);
  });

  it('takes a newer copy of the same record', () => {
    const merged = mergeMeasurements(
      [entry({ id: 'a', waistCm: 100, updatedAt: '2026-01-02T00:00:00.000Z' })],
      [entry({ id: 'a', waistCm: 97, updatedAt: '2026-01-09T00:00:00.000Z' })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.waistCm).toBe(97);
  });
});
