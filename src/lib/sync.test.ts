import { describe, expect, it } from 'vitest';
import {
  SYNC_ALPHABET,
  codeFromBytes,
  generateSyncCode,
  hashSyncCode,
  isValidSyncCode,
  normalizeSyncCode,
  parsePayload,
  pushVials,
  serializePayload,
  syncWithServer,
  type SyncPayload,
} from './sync';
import type { SavedVial } from './vials';

const CODE = 'PC-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA';

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

describe('sync codes', () => {
  it('formats bytes into labelled groups', () => {
    expect(codeFromBytes(new Uint8Array(24).fill(0))).toBe(CODE);
  });

  it('never uses ambiguous characters', () => {
    expect(SYNC_ALPHABET).not.toMatch(/[IO01]/);
  });

  it('generates a valid, unique code', () => {
    const codes = new Set([generateSyncCode(), generateSyncCode(), generateSyncCode()]);
    expect(codes.size).toBe(3);
    for (const code of codes) expect(isValidSyncCode(code)).toBe(true);
  });

  it('tolerates sloppy typing', () => {
    expect(normalizeSyncCode(CODE.toLowerCase())).toBe(normalizeSyncCode(CODE));
    expect(isValidSyncCode(' pc aaaa aaaa aaaa aaaa aaaa aaaa ')).toBe(true);
  });

  it('rejects malformed codes', () => {
    expect(isValidSyncCode('')).toBe(false);
    expect(isValidSyncCode('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).toBe(false); // no prefix
    expect(isValidSyncCode('PC-AAAA-AAAA-AAAA-AAAA-AAAA-AAA')).toBe(false); // too short
    expect(isValidSyncCode('PC-AAAA-AAAA-AAAA-AAAA-AAAA-AAAI')).toBe(false); // contains I
  });

  it('hashes to a 64-char hex key, ignoring formatting', async () => {
    const key = await hashSyncCode(CODE);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashSyncCode(CODE.toLowerCase())).toBe(key);
    expect(await hashSyncCode('PC-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB')).not.toBe(key);
  });
});

describe('sync payload', () => {
  it('round-trips vials', () => {
    const parsed = parsePayload(serializePayload([makeVial()]));
    expect(parsed?.version).toBe(1);
    expect(parsed?.vials).toHaveLength(1);
    expect(parsed?.vials[0].name).toBe('BPC-157');
  });

  it('returns null for junk', () => {
    expect(parsePayload('not json')).toBeNull();
    expect(parsePayload('{"vials":"nope"}')).toBeNull();
    expect(parsePayload('[]')).toBeNull();
  });

  it('drops malformed vials but keeps the good ones', () => {
    const text = JSON.stringify({ version: 1, vials: [makeVial(), { broken: true }] } as SyncPayload);
    expect(parsePayload(text)?.vials).toHaveLength(1);
  });

  it('carries the people alongside the vials', () => {
    const parsed = parsePayload(
      serializePayload([makeVial({ ownerId: 'wife' })], [{ id: 'wife', name: 'Kim' }]),
    );
    expect(parsed?.owners).toEqual([{ id: 'wife', name: 'Kim' }]);
    expect(parsed?.vials[0].ownerId).toBe('wife');
  });

  it('implies a person for a payload written before owners existed', () => {
    const text = JSON.stringify({ version: 1, vials: [makeVial({ ownerId: 'kid' })] });
    expect(parsePayload(text)?.owners).toEqual([{ id: 'kid', name: '' }]);
  });

  it('treats an owner-less vial as the default person', () => {
    expect(parsePayload(serializePayload([makeVial()]))?.owners).toEqual([{ id: 'me', name: '' }]);
  });
});

describe('syncWithServer', () => {
  const baseUrl = 'http://localhost:8787';

  /** Minimal stand-in for a fetch Response. */
  function reply(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it('rejects an invalid code without touching the network', async () => {
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return reply(200, {});
    }) as unknown as typeof fetch;

    expect(await syncWithServer(baseUrl, 'nope', [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'invalidCode',
    });
    expect(called).toBe(false);
  });

  it('needs a server url', async () => {
    const fakeFetch = (async () => reply(200, {})) as unknown as typeof fetch;
    expect(await syncWithServer('   ', CODE, [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('pulls first, then pushes the result', async () => {
    const methods: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      methods.push(method);
      if (method === 'GET') return reply(404, {});
      return reply(200, { updatedAt: '2026-10-10T10:00:00.000Z' });
    }) as unknown as typeof fetch;

    const outcome = await syncWithServer(baseUrl, CODE, [makeVial()], { fetchImpl: fakeFetch });

    expect(methods).toEqual(['GET', 'PUT']);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.remoteFound).toBe(false);
      expect(outcome.updatedAt).toBe('2026-10-10T10:00:00.000Z');
      expect(outcome.vials).toHaveLength(1);
    }
  });

  it('merges whatever the server already holds', async () => {
    const remote = makeVial({ id: 'v2', name: 'From my phone' });
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return reply(200, { payload: serializePayload([remote]) });
      }
      return reply(200, { updatedAt: '2026-10-10T10:00:00.000Z' });
    }) as unknown as typeof fetch;

    const outcome = await syncWithServer(baseUrl, CODE, [makeVial()], { fetchImpl: fakeFetch });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.remoteFound).toBe(true);
      expect(outcome.vials.map((vial) => vial.id).sort()).toEqual(['v1', 'v2']);
    }
  });

  it('brings the other device\'s people across', async () => {
    const remote = makeVial({ id: 'v2', ownerId: 'wife' });
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') {
        return reply(200, { payload: serializePayload([remote], [{ id: 'wife', name: 'Kim' }]) });
      }
      return reply(200, { updatedAt: '2026-10-10T10:00:00.000Z' });
    }) as unknown as typeof fetch;

    const outcome = await syncWithServer(baseUrl, CODE, [makeVial()], {
      owners: [{ id: 'me', name: '' }],
      fetchImpl: fakeFetch,
    });

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(new Set(outcome.owners.map((owner) => owner.id))).toEqual(new Set(['me', 'wife']));
      expect(outcome.owners.find((owner) => owner.id === 'wife')?.name).toBe('Kim');
    }
  });

  it('reports a network failure', async () => {
    const fakeFetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    expect(await syncWithServer(baseUrl, CODE, [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'network',
    });
  });

  it('reports a server failure', async () => {
    const fakeFetch = (async () => reply(500, {})) as unknown as typeof fetch;
    expect(await syncWithServer(baseUrl, CODE, [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'server',
    });
  });

  it('reports a corrupt remote payload', async () => {
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'GET') return reply(200, { payload: 'garbage' });
      return reply(200, {});
    }) as unknown as typeof fetch;

    expect(await syncWithServer(baseUrl, CODE, [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'badPayload',
    });
  });

  it('reports when hashing is unavailable (non-secure context)', async () => {
    const digest = crypto.subtle.digest;
    crypto.subtle.digest = (() => {
      throw new Error('crypto.subtle is unavailable');
    }) as typeof digest;

    try {
      const fakeFetch = (async () => reply(200, {})) as unknown as typeof fetch;
      expect(await syncWithServer(baseUrl, CODE, [], { fetchImpl: fakeFetch })).toEqual({
        ok: false,
        reason: 'unavailable',
      });
    } finally {
      crypto.subtle.digest = digest;
    }
  });
});

describe('pushVials (used by the background auto-push)', () => {
  const baseUrl = 'http://localhost:8787';

  function reply(status: number, body: unknown): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as unknown as Response;
  }

  it('sends without pulling first', async () => {
    const methods: string[] = [];
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      methods.push(init?.method ?? 'GET');
      return reply(200, { updatedAt: '2026-10-10T10:00:00.000Z' });
    }) as unknown as typeof fetch;

    const outcome = await pushVials(baseUrl, CODE, [makeVial()], { fetchImpl: fakeFetch });

    expect(methods).toEqual(['PUT']);
    expect(outcome).toEqual({ ok: true, updatedAt: '2026-10-10T10:00:00.000Z' });
  });

  it('reports a server failure', async () => {
    const fakeFetch = (async () => reply(500, {})) as unknown as typeof fetch;
    expect(await pushVials(baseUrl, CODE, [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'server',
    });
  });

  it('reports a network failure', async () => {
    const fakeFetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;

    expect(await pushVials(baseUrl, CODE, [], { fetchImpl: fakeFetch })).toEqual({
      ok: false,
      reason: 'network',
    });
  });
});
