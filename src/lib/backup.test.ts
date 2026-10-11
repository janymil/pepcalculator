import { describe, expect, it } from 'vitest';
import { BACKUP_APP_ID, backupFileName, parseBackup, serializeBackup } from './backup';
import type { SavedVial } from './vials';

function makeVial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    reconstitutedOn: '2026-10-10',
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    ...overrides,
  };
}

describe('serializeBackup', () => {
  it('wraps the vials in a tagged, versioned envelope', () => {
    const json = serializeBackup([makeVial()], '2026-10-10T08:00:00.000Z');
    const parsed = JSON.parse(json);

    expect(parsed.app).toBe(BACKUP_APP_ID);
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe('2026-10-10T08:00:00.000Z');
    expect(parsed.vials).toHaveLength(1);
  });

  it('leaves out soft-deleted vials', () => {
    const json = serializeBackup(
      [makeVial(), makeVial({ id: 'gone', deletedAt: '2026-03-01T00:00:00.000Z' })],
      '2026-10-10T08:00:00.000Z',
    );
    expect(JSON.parse(json).vials).toHaveLength(1);
  });
});

describe('parseBackup', () => {
  it('round-trips an exported backup', () => {
    const json = serializeBackup([makeVial(), makeVial({ id: 'v2' })], '2026-10-10T08:00:00.000Z');
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vials.map((vial) => vial.id)).toEqual(['v1', 'v2']);
      expect(result.vials[0].vialAmount).toBe(5);
    }
  });

  it('reports invalid JSON', () => {
    expect(parseBackup('{not json')).toEqual({ ok: false, reason: 'invalidJson' });
  });

  it('rejects JSON that is not a PepCalculator backup', () => {
    expect(parseBackup('{"hello":"world"}')).toEqual({ ok: false, reason: 'notABackup' });
    expect(parseBackup('null')).toEqual({ ok: false, reason: 'notABackup' });
  });

  it('rejects a backup with no usable vials', () => {
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, vials: [] }))).toEqual({
      ok: false,
      reason: 'noVials',
    });
    expect(parseBackup(JSON.stringify({ app: BACKUP_APP_ID, vials: [{ broken: true }] }))).toEqual({
      ok: false,
      reason: 'noVials',
    });
  });

  it('skips damaged entries but keeps the good ones', () => {
    const json = JSON.stringify({ app: BACKUP_APP_ID, vials: [makeVial(), { nope: 1 }] });
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.vials).toHaveLength(1);
  });

  it('fills in fields an older backup might not have', () => {
    const json = JSON.stringify({
      app: BACKUP_APP_ID,
      vials: [
        {
          id: 'old',
          name: 'Old',
          reconstitutedOn: '2026-01-01',
          vialAmount: 10,
          vialUnit: 'mg',
          waterMl: 1,
          doseAmount: 1,
          doseUnit: 'mg',
        },
      ],
    });
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vials[0].dosesTaken).toBe(0);
      expect(result.vials[0].syringeType).toBe('U100');
      expect(result.vials[0].syringeCapacityMl).toBe(1);
    }
  });
});

describe('backupFileName', () => {
  it('includes the date', () => {
    expect(backupFileName('2026-10-10')).toBe('pepcalculator-backup-2026-10-10.json');
  });
});
