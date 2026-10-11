import { describe, expect, it } from 'vitest';
import {
  BACKUP_APP_ID,
  backupFileName,
  decryptBackup,
  encryptBackup,
  isEncryptedBackup,
  parseBackup,
  serializeBackup,
} from './backup';
import type { SavedVial } from './vials';

/**
 * These tests run a tiny PBKDF2 work factor. The real one is deliberately slow
 * (200k iterations) and would make the suite crawl for no extra confidence.
 */
const FAST_ITERATIONS = 1_000;

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

  it('carries the people list so stacks survive a restore', () => {
    const json = serializeBackup([makeVial({ ownerId: 'wife' })], '2026-10-10T08:00:00.000Z', [
      { id: 'me', name: '' },
      { id: 'wife', name: 'Kim' },
    ]);
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.owners).toEqual([
        { id: 'me', name: '' },
        { id: 'wife', name: 'Kim' },
      ]);
      expect(result.vials[0].ownerId).toBe('wife');
    }
  });

  it('carries the measurement log, so a restore does not lose it', () => {
    const json = serializeBackup([makeVial()], '2026-10-10T08:00:00.000Z', [], [
      { id: 'm1', date: '2026-01-05', waistCm: 104, updatedAt: '2026-01-05T08:00:00.000Z' },
    ]);

    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.measurements).toHaveLength(1);
      expect(result.measurements[0].waistCm).toBe(104);
    }
  });

  it('leaves removed measurements out of the file, exactly like removed vials', () => {
    const json = serializeBackup([makeVial()], '2026-10-10T08:00:00.000Z', [], [
      { id: 'm1', date: '2026-01-05', waistCm: 104, updatedAt: '2026-01-05T08:00:00.000Z' },
      {
        id: 'm2',
        date: '2026-01-06',
        waistCm: 100,
        updatedAt: '2026-01-06T08:00:00.000Z',
        deletedAt: '2026-01-07T00:00:00.000Z',
      },
    ]);

    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.measurements.map((entry) => entry.id)).toEqual(['m1']);
  });

  it('reads a backup written before the log existed, without inventing one', () => {
    const result = parseBackup(JSON.stringify({ app: BACKUP_APP_ID, vials: [makeVial()] }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.measurements).toEqual([]);
  });

  it('derives a person for every vial in a backup that predates owners', () => {
    const json = JSON.stringify({
      app: BACKUP_APP_ID,
      vials: [makeVial({ ownerId: 'kid' }), makeVial({ id: 'v2' })],
    });
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(new Set(result.owners.map((owner) => owner.id))).toEqual(new Set(['kid', 'me']));
    }
  });
});

describe('backupFileName', () => {
  it('includes the date', () => {
    expect(backupFileName('2026-10-10')).toBe('pepcalculator-backup-2026-10-10.json');
  });
});

describe('encrypted backups', () => {
  it('round-trips a backup through the passphrase', async () => {
    const plain = serializeBackup([makeVial()], '2026-01-05T08:00:00.000Z');
    const sealed = await encryptBackup(plain, 'correct horse', FAST_ITERATIONS);

    expect(isEncryptedBackup(JSON.parse(sealed))).toBe(true);
    // The point of the exercise: the file itself gives nothing away.
    expect(sealed).not.toContain('BPC-157');

    const opened = await decryptBackup(sealed, 'correct horse');
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.text).toBe(plain);
      expect(parseBackup(opened.text).ok).toBe(true);
    }
  });

  it('refuses the wrong passphrase instead of returning nonsense', async () => {
    const sealed = await encryptBackup('{"app":"pepcalculator"}', 'right', FAST_ITERATIONS);

    expect(await decryptBackup(sealed, 'wrong')).toEqual({ ok: false, reason: 'badPassphrase' });
  });

  it('never reuses a salt and initialisation vector', async () => {
    const first = await encryptBackup('same text', 'pw', FAST_ITERATIONS);
    const second = await encryptBackup('same text', 'pw', FAST_ITERATIONS);

    expect(first).not.toBe(second);
  });

  it('reports text that is not an envelope at all', async () => {
    expect(await decryptBackup('not json', 'pw')).toEqual({ ok: false, reason: 'badEnvelope' });
    expect(await decryptBackup(JSON.stringify({ app: BACKUP_APP_ID }), 'pw')).toEqual({
      ok: false,
      reason: 'badEnvelope',
    });
  });

  it('recognises only real envelopes', () => {
    expect(isEncryptedBackup(null)).toBe(false);
    expect(isEncryptedBackup({ app: BACKUP_APP_ID, encrypted: false })).toBe(false);
    expect(
      isEncryptedBackup({ app: BACKUP_APP_ID, encrypted: true, salt: 'a', iv: 'b', data: 'c' }),
    ).toBe(true);
  });
});
