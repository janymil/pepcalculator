import { describe, expect, it } from 'vitest';
import {
  fetchVapidPublicKey,
  isPushSupported,
  removePushRegistration,
  savePushRegistration,
  urlBase64ToUint8Array,
} from './push';
import type { PushScheduleEntry } from './reminders';

const CODE = 'PC-7K2M-9QXA-4BCD-EFGH-JKLM-NPQR';

/** A `PushSubscription` stand-in: only `toJSON` is used by the client. */
const SUBSCRIPTION = {
  toJSON: () => ({ endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } }),
} as unknown as PushSubscription;

const ENTRY: PushScheduleEntry = {
  at: '2024-01-01T09:00:00.000Z',
  title: 'Time for your dose',
  body: 'BPC-157 · 09:00',
  tag: 'dose:v1:2024-01-01:09:00',
};

/** A `fetch` that records what it was asked and always answers the same way. */
function recordingFetch(response: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const jsonResponse = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body });

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64 key', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
  });

  it('pads a group that is not a multiple of four', () => {
    expect(Array.from(urlBase64ToUint8Array('AQ'))).toEqual([1]);
  });
});

describe('isPushSupported', () => {
  it('is false in a plain environment without a window', () => {
    expect(isPushSupported()).toBe(false);
  });
});

describe('fetchVapidPublicKey', () => {
  it('returns the key the server advertises', async () => {
    const { calls, impl } = recordingFetch(jsonResponse({ publicKey: 'BPublicKey' }));
    await expect(fetchVapidPublicKey('https://api.test/', impl)).resolves.toBe('BPublicKey');
    expect(calls[0].url).toBe('https://api.test/api/push/pubkey');
  });

  it('returns null when the server has push switched off', async () => {
    const { impl } = recordingFetch(jsonResponse({ publicKey: null }));
    await expect(fetchVapidPublicKey('https://api.test', impl)).resolves.toBeNull();
  });

  it('returns null when the request fails', async () => {
    const impl = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await expect(fetchVapidPublicKey('https://api.test', impl)).resolves.toBeNull();
  });
});

describe('savePushRegistration', () => {
  it('PUTs the subscription and the queue to the hashed push URL', async () => {
    const { calls, impl } = recordingFetch(jsonResponse({ scheduled: 1 }));
    const outcome = await savePushRegistration('https://api.test', CODE, SUBSCRIPTION, [ENTRY], impl);

    expect(outcome).toEqual({ ok: true });
    expect(calls[0].url).toMatch(/^https:\/\/api\.test\/api\/push\/[a-f0-9]{64}$/);
    expect(calls[0].init?.method).toBe('PUT');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      subscription: { endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } },
      queue: [ENTRY],
    });
  });

  it('reports a server error', async () => {
    const { impl } = recordingFetch(jsonResponse({}, false));
    await expect(
      savePushRegistration('https://api.test', CODE, SUBSCRIPTION, [], impl),
    ).resolves.toEqual({ ok: false, reason: 'server' });
  });
});

describe('removePushRegistration', () => {
  it('DELETEs the record so the server stops pushing', async () => {
    const { calls, impl } = recordingFetch(jsonResponse({ ok: true }));
    await expect(removePushRegistration('https://api.test', CODE, impl)).resolves.toEqual({
      ok: true,
    });
    expect(calls[0].init?.method).toBe('DELETE');
    expect(calls[0].url).toMatch(/\/api\/push\/[a-f0-9]{64}$/);
  });
});
