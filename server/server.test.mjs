import { describe, expect, it } from 'vitest';
import { createSyncServer } from './server.mjs';

/** A valid sync key: 64 lowercase hex characters. */
const KEY = 'a'.repeat(64);
const APP = 'https://app.example';

/**
 * Boots a real server on an ephemeral port with an in-memory database, runs the
 * test against it over HTTP, and always closes it again. Nothing here touches
 * `server/data/sync.sqlite`.
 */
async function withServer(overrides, run) {
  const server = createSyncServer({
    port: 0,
    dbPath: ':memory:',
    allowed: [APP],
    maxBodyBytes: 2048,
    rateLimit: 0,
    rateWindowMs: 60_000,
    trustProxy: false,
    logRequests: false,
    ...overrides,
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    /*
     * `close()` alone waits for open connections to end, and `fetch` keeps its
     * sockets alive — so teardown would hang for Node's 5 s keep-alive timeout
     * and the test would time out instead of failing. Close them first.
     */
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const put = (base, key, body) =>
  fetch(`${base}/api/sync/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('sync server — the basics still work', () => {
  it('answers a health check without touching the database', () =>
    withServer({}, async (base) => {
      const res = await fetch(`${base}/api/health`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ ok: true });
    }));

  it('stores a payload and gives it back', () =>
    withServer({}, async (base) => {
      expect((await fetch(`${base}/api/sync/${KEY}`)).status).toBe(404);

      const written = await put(base, KEY, { payload: '{"vials":[]}' });
      expect(written.status).toBe(200);
      expect(typeof (await written.json()).updatedAt).toBe('string');

      const read = await fetch(`${base}/api/sync/${KEY}`);
      await expect(read.json()).resolves.toMatchObject({ payload: '{"vials":[]}' });
    }));

  it('rejects a bad key, an unknown route, a wrong method and a bad body', () =>
    withServer({}, async (base) => {
      expect((await fetch(`${base}/api/sync/nope`)).status).toBe(400);
      expect((await fetch(`${base}/api/nothing`)).status).toBe(404);
      expect((await fetch(`${base}/api/sync/${KEY}`, { method: 'DELETE' })).status).toBe(405);

      const notJson = await fetch(`${base}/api/sync/${KEY}`, {
        method: 'PUT',
        body: 'not json at all',
      });
      expect(notJson.status).toBe(400);

      expect((await put(base, KEY, { payload: 12345 })).status).toBe(400);
    }));

  it('refuses an oversized body, and keeps the connection usable afterwards', () =>
    withServer({ maxBodyBytes: 512 }, async (base) => {
      const res = await put(base, KEY, { payload: 'x'.repeat(4000) });
      expect(res.status).toBe(413);
      await expect(res.json()).resolves.toEqual({ error: 'payload_too_large' });

      // The oversized write must not have been stored.
      expect((await fetch(`${base}/api/sync/${KEY}`)).status).toBe(404);
    }));
});

describe('sync server — hardening', () => {
  it('never lets a synced payload be cached', () =>
    withServer({}, async (base) => {
      const res = await fetch(`${base}/api/health`);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    }));

  it('refuses an origin that is not on the list, instead of a bare CORS failure', () =>
    withServer({ allowed: [APP] }, async (base) => {
      const res = await fetch(`${base}/api/sync/${KEY}`, {
        headers: { Origin: 'https://evil.example' },
      });

      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toEqual({ error: 'origin_not_allowed' });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    }));

  it('echoes an allowed origin and tells caches that the answer varies', () =>
    withServer({ allowed: [APP] }, async (base) => {
      const res = await fetch(`${base}/api/health`, { headers: { Origin: APP } });

      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(APP);
      expect(res.headers.get('vary')).toBe('Origin');
    }));

  it('answers a preflight for an allowed origin and blocks one for another', () =>
    withServer({ allowed: [APP] }, async (base) => {
      const ok = await fetch(`${base}/api/sync/${KEY}`, {
        method: 'OPTIONS',
        headers: { Origin: APP },
      });
      expect(ok.status).toBe(204);
      expect(ok.headers.get('access-control-allow-methods')).toContain('PUT');

      const blocked = await fetch(`${base}/api/sync/${KEY}`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://evil.example' },
      });
      expect(blocked.status).toBe(403);
    }));

  it('still allows a caller that sends no Origin at all', () =>
    withServer({ allowed: [APP] }, async (base) => {
      // The app's own same-origin fetch, a health probe or curl. A browser would
      // not block these, so refusing them would only break honest callers.
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
      expect((await put(base, KEY, { payload: '{}' })).status).toBe(200);
    }));

  it('allows any origin when the list is *', () =>
    withServer({ allowed: '*' }, async (base) => {
      const res = await fetch(`${base}/api/health`, { headers: { Origin: 'https://any.example' } });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe('*');
    }));

  it('answers 429 with a Retry-After once an address runs out of budget', () =>
    withServer({ rateLimit: 3, rateWindowMs: 60_000 }, async (base) => {
      expect((await fetch(`${base}/api/sync/${KEY}`)).status).toBe(404);
      expect((await put(base, KEY, { payload: '{}' })).status).toBe(200);

      const third = await fetch(`${base}/api/sync/${KEY}`);
      // Still inside the budget: the write from two calls ago is readable.
      expect(third.status).toBe(200);
      expect(third.headers.get('x-ratelimit-remaining')).toBe('0');

      const fourth = await fetch(`${base}/api/sync/${KEY}`);
      expect(fourth.status).toBe(429);
      expect(Number(fourth.headers.get('retry-after'))).toBeGreaterThan(0);
      await expect(fourth.json()).resolves.toMatchObject({ error: 'rate_limited' });

      // A health check is not a data call, so it keeps working.
      expect((await fetch(`${base}/api/health`)).status).toBe(200);
    }));
});

describe('sync server — configuration', () => {
  it('reads the port, the origin list and the flags from the environment', async () => {
    const { readConfig } = await import('./server.mjs');

    const config = readConfig({
      PORT: '9999',
      ALLOWED_ORIGIN: 'https://a.example,https://b.example',
      MAX_BODY_BYTES: '1024',
      RATE_LIMIT: '5',
      RATE_WINDOW_MS: '2000',
      TRUST_PROXY: '1',
      LOG_REQUESTS: '0',
    });

    expect(config).toMatchObject({
      port: 9999,
      allowed: ['https://a.example', 'https://b.example'],
      maxBodyBytes: 1024,
      rateLimit: 5,
      rateWindowMs: 2000,
      trustProxy: true,
      logRequests: false,
    });
  });

  it('defaults to "any origin", a rate limit and logging when nothing is set', async () => {
    const { readConfig } = await import('./server.mjs');
    const config = readConfig({});

    expect(config.allowed).toBe('*');
    expect(config.rateLimit).toBeGreaterThan(0);
    expect(config.logRequests).toBe(true);
  });
});
