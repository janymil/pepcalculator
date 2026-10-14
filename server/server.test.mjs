import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { createSyncServer } from './server.mjs';

/** A valid sync key: 64 lowercase hex characters. */
const KEY = 'a'.repeat(64);
const APP = 'https://app.example';

/** A plan with no end, so there is always a next dose to talk about. */
const ONGOING_RULE = {
  times: ['08:00'],
  repeat: 'daily',
  weekdays: [],
  intervalDays: 0,
  startsOn: '2020-01-01',
  durationValue: 0,
  durationUnit: 'ongoing',
};

const WA_SECRET = 'a-long-random-webhook-path';

/**
 * A stand-in for Evolution API: answers 200 to everything and remembers what it
 * was asked to send. Real HTTP rather than an injected stub, so the request the
 * server actually builds is the thing under test.
 */
async function withFakeEvolution(run, { status = 200 } = {}) {
  const sent = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      sent.push({ url: req.url, apikey: req.headers.apikey, body: JSON.parse(body || '{}') });
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(status === 200 ? '{"ok":true}' : '{"message":"gateway down"}');
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`, sent);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}


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
    // The server is handed over as well: the WhatsApp tests need the store and
    // the worker to arm a row and drive a tick, and there is no other seam.
    return await run(`http://127.0.0.1:${port}`, server);
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

/** The app's three routes, and the webhook's one. */
const putWa = (base, key, body) =>
  fetch(`${base}/api/wa/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const getWa = (base, key) => fetch(`${base}/api/wa/${key}`);
const deleteWa = (base, key) => fetch(`${base}/api/wa/${key}`, { method: 'DELETE' });

const put = (base, key, body) =>
  fetch(`${base}/api/sync/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

/** A webhook body from a phone, in the shape Evolution posts. */
function inbound(phone, text, id = 'MSG1') {
  return {
    event: 'messages.upsert',
    instance: 'pepstool',
    data: {
      key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id },
      pushName: 'Test',
      message: { conversation: text },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

/** Posts a webhook, with the path secret and the header secret set separately. */
function postWebhook(base, payload, { path = WA_SECRET, header = WA_SECRET } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (header !== null) headers.apikey = header;
  return fetch(`${base}/api/wa/webhook/${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

/** A booted server plus a fake Evolution, with everything WhatsApp switched on. */
async function withWhatsApp(run, evolutionOptions) {
  return withFakeEvolution(
    (evolutionUrl, sent) =>
      withServer(
        {
          rateLimit: 0,
          whatsappWebhookRateLimit: 0,
          whatsappUrl: evolutionUrl,
          whatsappApiKey: 'test-key',
          whatsappInstance: 'pepstool',
          whatsappSecret: WA_SECRET,
          whatsappNumber: '421900000000',
          manageUrl: 'https://pepstool.com',
        },
        (base, server) => run(base, sent, server),
      ),
    evolutionOptions,
  );
}

describe('sync server — the basics still work', () => {
  it('answers a health check without touching the database', () =>
    withServer({}, async (base) => {
      const res = await fetch(`${base}/api/health`);
      expect(res.status).toBe(200);
      // `whatsapp: null` is the honest answer when no gateway is configured —
      // there is no link to report on.
      await expect(res.json()).resolves.toEqual({ ok: true, whatsapp: null });
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

describe('sync server — push registration', () => {
  const SUB = { endpoint: 'https://push.example/abc', keys: { p256dh: 'p', auth: 'a' } };
  const putPush = (base, key, body) =>
    fetch(`${base}/api/push/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('publishes the VAPID key only when the server is configured for push', () =>
    withServer({}, async (base) => {
      const off = await fetch(`${base}/api/push/pubkey`);
      await expect(off.json()).resolves.toEqual({ publicKey: null });
    }));

  it('hands out the VAPID public key when one is set', () =>
    withServer({ vapidPublicKey: 'BExample', vapidPrivateKey: 'secret' }, async (base) => {
      const res = await fetch(`${base}/api/push/pubkey`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ publicKey: 'BExample' });
    }));

  it('stores a subscription and its queue, and reports how many it kept', () =>
    withServer({}, async (base) => {
      const at = new Date(Date.now() + 60_000).toISOString();
      const res = await putPush(base, KEY, {
        subscription: SUB,
        queue: [{ at, title: 'Time for your dose', body: 'Vial · 08:00', tag: 'dose:1' }],
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.scheduled).toBe(1);
      expect(typeof body.updatedAt).toBe('string');
    }));

  it('refuses a malformed subscription or key', () =>
    withServer({}, async (base) => {
      expect((await putPush(base, KEY, { subscription: { endpoint: 'nope' } })).status).toBe(400);
      expect((await putPush(base, 'not-a-key', { subscription: SUB })).status).toBe(400);
    }));

  it('forgets a subscription on DELETE and rejects other methods', () =>
    withServer({}, async (base) => {
      await putPush(base, KEY, { subscription: SUB, queue: [] });

      expect((await fetch(`${base}/api/push/${KEY}`)).status).toBe(405);

      const removed = await fetch(`${base}/api/push/${KEY}`, { method: 'DELETE' });
      expect(removed.status).toBe(200);
      await expect(removed.json()).resolves.toEqual({ ok: true });
    }));

  it('answers a preflight that now lists DELETE', () =>
    withServer({ allowed: [APP] }, async (base) => {
      const res = await fetch(`${base}/api/push/${KEY}`, {
        method: 'OPTIONS',
        headers: { Origin: APP },
      });
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-methods')).toContain('DELETE');
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

describe('whatsapp — the app\'s side', () => {
  it('creates a pairing code and a link the user taps', () =>
    withWhatsApp(async (base) => {
      const res = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.code).toMatch(/^[A-Z2-9]{6}$/);
      expect(body.code).not.toMatch(/[IO01]/);
      expect(body.status).toBe('pending');
      expect(body.linked).toBe(false);
      expect(typeof body.expiresAt).toBe('string');
      // The user writes first: the link carries the code, so one tap is enough.
      expect(body.link).toBe(`https://wa.me/421900000000?text=START%20${body.code}`);
    }));

  it('keeps the code it was handed, so tapping twice changes nothing', () =>
    withWhatsApp(async (base) => {
      const first = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await first.json();

      const again = await putWa(base, KEY, {
        code: code.toLowerCase(),
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const body = await again.json();

      expect(body.code).toBe(code);
      expect(body.link).toContain(code);
    }));

  it('refuses a rule, a zone or a key it cannot work with', () =>
    withWhatsApp(async (base) => {
      const noTimes = await putWa(base, KEY, {
        rule: { ...ONGOING_RULE, times: [] },
        timeZone: 'Europe/Bratislava',
      });
      expect(noTimes.status).toBe(400);
      await expect(noTimes.json()).resolves.toEqual({ error: 'invalid_rule' });

      const badZone = await putWa(base, KEY, { rule: ONGOING_RULE, timeZone: 'Mars/Olympus' });
      expect(badZone.status).toBe(400);
      await expect(badZone.json()).resolves.toEqual({ error: 'invalid_time_zone' });

      expect((await putWa(base, 'not-a-key', { rule: ONGOING_RULE })).status).toBe(400);
    }));

  it('says so plainly when WhatsApp is switched off, rather than storing a plan that never fires', () =>
    withServer({}, async (base) => {
      const res = await putWa(base, KEY, {
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ error: 'whatsapp_not_configured' });
    }));

  it('reports what is on, and never echoes the number back', () =>
    withWhatsApp(async (base) => {
      const created = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();
      await postWebhook(base, inbound('421911111111', `START ${code}`));

      const res = await getWa(base, KEY);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.whatsappNumber).toBe('421900000000');
      expect(body.reminders).toHaveLength(1);
      expect(body.reminders[0]).toMatchObject({
        code,
        label: 'Morning protocol',
        status: 'active',
        linked: true,
      });
      expect(typeof body.reminders[0].nextRunAt).toBe('string');
      // The number belongs to the subscriber, not to the sync key.
      expect(JSON.stringify(body)).not.toContain('421911111111');
    }));

  it('removes one vial without touching the others', () =>
    withWhatsApp(async (base) => {
      const one = await (
        await putWa(base, KEY, {
          slot: 'a',
          label: 'Nad+',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      await putWa(base, KEY, {
        slot: 'b',
        label: 'Testosterone',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      await postWebhook(base, inbound('421911111111', `START ${one.code}`));

      const removed = await fetch(`${base}/api/wa/${KEY}?slot=a`, { method: 'DELETE' });
      expect(removed.status).toBe(200);

      const list = await (await getWa(base, KEY)).json();
      /*
       * The deleted vial stops; the other keeps its reminder and stays linked.
       * Before this, deleting a vial left it being reminded about for ever, and
       * the only way to stop it was to switch every reminder off.
       */
      expect(list.reminders.map((row) => row.slot)).toEqual(['b']);
      expect(list.reminders[0].linked).toBe(true);
    }));

  it('keeps a number opted in when a vial is added later', () =>
    withWhatsApp(async (base) => {
      const first = await (
        await putWa(base, KEY, {
          slot: 'a',
          label: 'Nad+',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      await postWebhook(base, inbound('421911111111', `START ${first.code}`));

      // Months later, a second vial from the same device.
      const second = await (
        await putWa(base, KEY, {
          slot: 'b',
          label: 'Testosterone',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();

      /*
       * It arrives already on. Otherwise the new vial would never be mentioned,
       * and nothing would say so — the reminders they already get keep coming,
       * and the one they just added silently never appears.
       */
      expect(second.linked).toBe(true);

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders.every((row) => row.linked)).toBe(true);
    }));

  it("keeps a vial's code when the app pushes the same vial again", () =>
    withWhatsApp(async (base) => {
      const first = await (
        await putWa(base, KEY, {
          slot: 'vial-1',
          label: 'Nad+',
          dose: '50 mg',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();

      const second = await (
        await putWa(base, KEY, {
          slot: 'vial-1',
          label: 'Nad+ Fortex Clinics',
          dose: '50 mg',
          draw: 'draw to 20 units',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();

      // Same vial, same code — the link the user is holding keeps working.
      expect(second.code).toBe(first.code);

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders).toHaveLength(1);
      expect(list.reminders[0]).toMatchObject({
        label: 'Nad+ Fortex Clinics',
        draw: 'draw to 20 units',
      });
    }));

  it('links every unclaimed vial when the device sends one code', () =>
    withWhatsApp(async (base) => {
      const one = await (
        await putWa(base, KEY, {
          slot: 'a',
          label: 'Nad+',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      const two = await (
        await putWa(base, KEY, {
          slot: 'b',
          label: 'Testosterone',
          person: 'Ana',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      expect(two.code).not.toBe(one.code);

      // One code, sent once — the opt-in the user agreed to.
      await postWebhook(base, inbound('421911111111', `START ${one.code}`));

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders).toHaveLength(2);
      expect(list.reminders.every((row) => row.linked)).toBe(true);
      // And the second person's name came through, so a digest can divide by it.
      expect(list.reminders.map((row) => row.person).sort()).toEqual(['', 'Ana']);
    }));

  it('forgets the plan on DELETE and rejects other methods', () =>
    withWhatsApp(async (base) => {
      const created = await putWa(base, KEY, {
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();

      expect((await fetch(`${base}/api/wa/${KEY}`, { method: 'POST' })).status).toBe(405);

      const removed = await deleteWa(base, KEY);
      expect(removed.status).toBe(200);
      await expect(removed.json()).resolves.toEqual({ ok: true });

      const after = await getWa(base, KEY);
      await expect(after.json()).resolves.toMatchObject({ reminders: [] });
      // Nothing is left to arm, so the code can no longer be claimed either.
      const late = await postWebhook(base, inbound('421911111111', `START ${code}`));
      expect((await late.json()).linked).toBe(false);
    }));
});

describe('whatsapp — the webhook', () => {
  it('refuses a caller without the secret', () =>
    withWhatsApp(async (base) => {
      // The CORS guard waves through a request with no `Origin`, which is what
      // Evolution sends — so this secret is the only thing standing here.
      expect((await postWebhook(base, inbound('421911111111', 'STOP'), { path: 'wrong' })).status).toBe(403);
      expect(
        (await postWebhook(base, inbound('421911111111', 'STOP'), { header: 'wrong' })).status,
      ).toBe(403);
      expect((await fetch(`${base}/api/wa/webhook/${WA_SECRET}`)).status).toBe(405);
    }));

  it('accepts a webhook with no apikey header, which is what Evolution really sends', () =>
    withWhatsApp(async (base) => {
      /*
       * Found by running it, and by logging what arrived: Evolution's webhook is
       * a plain axios POST with a `content-type` and a `user-agent` and **no
       * `apikey` header at all**. A rule that demanded one rejected every real
       * webhook — with a 403 that nothing outside the log could see.
       */
      const res = await postWebhook(base, inbound('421911111111', 'STATUS'), { header: null });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ ok: true, handled: true });
    }));

  it('accepts Evolution\'s own API key when a deployment does configure a header', () =>
    withWhatsApp(async (base) => {
      // `headers` can be set on the instance webhook, and then it is sent — so
      // both values are honoured rather than only ours.
      const res = await postWebhook(base, inbound('421911111111', 'STATUS'), { header: 'test-key' });
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({ ok: true, handled: true });
    }));

  it('still refuses a wrong path, whatever the header says', () =>
    withWhatsApp(async (base) => {
      // The path is the part nobody can probe for, and it stays required.
      for (const header of [null, 'test-key', WA_SECRET]) {
        const res = await postWebhook(base, inbound('421911111111', 'STATUS'), {
          path: 'not-the-secret',
          header,
        });
        expect(res.status, `header ${header}`).toBe(403);
      }
    }));

  it('says why it refused, so a 403 is never silent', async () => {
    // The whole reason this bug survived: a refused webhook looked exactly like
    // a working one. Now it names the reason in the log.
    const warnings = [];
    const original = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      await withFakeEvolution((evolutionUrl) =>
        withServer(
          {
            logRequests: true,
            rateLimit: 0,
            whatsappWebhookRateLimit: 0,
            whatsappUrl: evolutionUrl,
            whatsappApiKey: 'test-key',
            whatsappInstance: 'pepstool',
            whatsappSecret: WA_SECRET,
            whatsappNumber: '421900000000',
          },
          async (base) => {
            await postWebhook(base, inbound('421911111111', 'STATUS'), { path: 'not-the-secret' });
            await postWebhook(base, inbound('421911111111', 'STATUS'), { header: 'wrong' });
          },
        ),
      );
    } finally {
      console.warn = original;
    }

    const logged = warnings.join('\n');
    expect(logged).toContain('the path secret does not match');
    expect(logged).toContain('the apikey header is present but wrong');
  });

  it('links the number that sent the code, and answers it', () =>
    withWhatsApp(async (base, sent) => {
      const created = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();

      const res = await postWebhook(base, inbound('421911111111', `START ${code}`));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        handled: true,
        intent: 'start',
        linked: true,
      });

      // The reply went out over real HTTP to the Evolution stand-in.
      expect(sent).toHaveLength(1);
      expect(sent[0].url).toBe('/message/sendText/pepstool');
      expect(sent[0].apikey).toBe('test-key');
      expect(sent[0].body.number).toBe('421911111111');
      expect(sent[0].body.text).toContain('Reminders are on.');
      expect(sent[0].body.text).toContain('08:00');
    }));

  it('says it is already on when the same code arrives twice', () =>
    withWhatsApp(async (base, sent) => {
      const created = await putWa(base, KEY, { rule: ONGOING_RULE, timeZone: 'Europe/Bratislava' });
      const { code } = await created.json();

      await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));
      await postWebhook(base, inbound('421911111111', `START ${code}`, 'B'));

      expect(sent[1].body.text).toContain('already on');
    }));

  it('answers the same way to an unknown code, an expired one and somebody else\'s', () =>
    withWhatsApp(async (base, sent) => {
      // A code nobody issued.
      await postWebhook(base, inbound('421911111111', 'START K7M2QP'));
      expect(sent[0].body.text).toContain('not valid any more');

      // A code issued to, and claimed by, another number.
      const created = await putWa(base, KEY, { rule: ONGOING_RULE, timeZone: 'Europe/Bratislava' });
      const { code } = await created.json();
      await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));
      const intruder = await postWebhook(base, inbound('421922222222', `START ${code}`, 'B'));

      expect((await intruder.json()).linked).toBe(false);
      expect(sent[sent.length - 1].body.text).toContain('not valid any more');

      // And the original owner is untouched.
      const own = await getWa(base, KEY);
      const body = await own.json();
      expect(body.reminders[0]).toMatchObject({ status: 'active', linked: true });
    }));

  it('tells a number with nothing linked how to set one up', () =>
    withWhatsApp(async (base, sent) => {
      const res = await postWebhook(base, inbound('421911111111', 'STATUS'));
      await expect(res.json()).resolves.toMatchObject({ handled: true, linked: false });
      expect(sent[0].body.text).toContain('not set up for reminders yet');
      expect(sent[0].body.text).toContain('https://pepstool.com');
    }));

  it('ignores our own messages, groups, the status feed and anything unreadable', () =>
    withWhatsApp(async (base, sent) => {
      const own = inbound('421911111111', 'STOP');
      own.data.key.fromMe = true;
      const group = inbound('421911111111', 'STOP');
      group.data.key.remoteJid = '120363@g.us';
      const status = inbound('421911111111', 'STOP');
      status.data.key.remoteJid = 'status@broadcast';

      for (const payload of [own, group, status, { event: 'messages.upsert', data: {} }]) {
        const res = await postWebhook(base, payload);
        expect(res.status).toBe(200);
        expect((await res.json()).handled).toBe(false);
      }
      // Nothing was answered, which is the point: a reply here would be a reply
      // to ourselves, forever.
      expect(sent).toHaveLength(0);
    }));
});

describe('whatsapp — the conversation', () => {
  it('walks through pause, status, resume and a time change', () =>
    withWhatsApp(async (base, sent) => {
      const created = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();
      const say = (text, id) => postWebhook(base, inbound('421911111111', text, id));

      await say(`START ${code}`, 'A');
      expect(sent[0].body.text).toContain('Reminders are on.');

      await say('PAUSE', 'B');
      expect(sent[1].body.text).toContain('Paused.');

      await say('STATUS', 'C');
      expect(sent[2].body.text).toContain('Status: paused');

      await say('RESUME', 'D');
      expect(sent[3].body.text).toContain('on again');

      await say('20:00', 'E');
      expect(sent[4].body.text).toContain('20:00');

      await say('STATUS', 'F');
      expect(sent[5].body.text).toContain('Status: on');
      expect(sent[5].body.text).toContain('Time: 20:00');

      const after = await getWa(base, KEY);
      expect((await after.json()).reminders[0]).toMatchObject({ status: 'active', linked: true });
    }));

  it('stops absolutely on STOP, and the opt-out outranks the stored row', () =>
    withWhatsApp(async (base, sent, server) => {
      const created = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();
      await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));

      // "STOP." — a full stop at the end of a sentence must still mean STOP.
      const stop = await postWebhook(base, inbound('421911111111', 'STOP.', 'B'));
      await expect(stop.json()).resolves.toMatchObject({
        handled: true,
        intent: 'stop',
        linked: true,
      });
      expect(sent[sent.length - 1].body.text).toContain('Stopped.');

      const stopped = await getWa(base, KEY);
      expect((await stopped.json()).reminders[0].status).toBe('stopped');

      /*
       * Now the real guarantee. Arm the row again by hand — as a bug, a stale
       * write or a race would — and tick the worker. The subscriber's opt-out is
       * joined into the worker's own query, so nothing may go out.
       */
      const before = sent.length;
      server.whatsappStore.save(code, { status: 'active', nextRunAtMs: Date.now() - 60_000 });
      await server.whatsappWorker.tick();
      expect(sent).toHaveLength(before);
    }));

  it('delivers a due reminder through the real store and the real sender', () =>
    withWhatsApp(async (base, sent, server) => {
      const created = await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units (250 mcg)',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();
      await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));
      const before = sent.length;

      // A plan always arms itself in the future, so the test arms it by hand —
      // through the store's own API, which is exactly what the query reads.
      server.whatsappStore.save(code, { nextRunAtMs: Date.now() - 60_000 });
      await server.whatsappWorker.tick();

      expect(sent).toHaveLength(before + 1);
      const reminder = sent[sent.length - 1];
      expect(reminder.url).toBe('/message/sendText/pepstool');
      expect(reminder.body.number).toBe('421911111111');
      expect(reminder.body.text).toContain('Morning protocol');
      expect(reminder.body.text).toContain('10 units (250 mcg)');
      expect(reminder.body.text).toContain('STOP');

      // And it armed the next dose, so an ongoing plan really does go on.
      const after = await getWa(base, KEY);
      const row = (await after.json()).reminders[0];
      expect(row.status).toBe('active');
      expect(Date.parse(row.nextRunAt)).toBeGreaterThan(Date.now());
    }));

  it('stops the reminder once the plan it was given runs out', () =>
    withWhatsApp(async (base, sent, server) => {
      // A one-week plan that started in 2020 ended long ago, so the first tick
      // is the last dose there will ever be.
      const created = await putWa(base, KEY, {
        label: 'Winter plan',
        rule: { ...ONGOING_RULE, durationValue: 1, durationUnit: 'weeks' },
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();

      // It cannot even be claimed: there is no dose left to promise.
      await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));
      expect(sent[sent.length - 1].body.text).toContain('Winter plan has reached the end');

      const after = await getWa(base, KEY);
      expect((await after.json()).reminders[0].status).toBe('stopped');
    }));
});

describe('whatsapp — the link itself', () => {
  /** A `connection.update` in the shape Evolution posts. */
  const connectionEvent = (state, reason) => ({
    event: 'connection.update',
    instance: 'pepstool',
    data: { instance: 'pepstool', state, ...(reason ? { statusReason: reason } : {}) },
  });

  it('reports the link in the health check, because nothing else can', () =>
    withWhatsApp(async (base) => {
      // Before any event arrives: configured, but nothing heard yet.
      let health = await (await fetch(`${base}/api/health`)).json();
      expect(health.whatsapp).toMatchObject({ state: 'unknown', sending: true });

      await postWebhook(base, connectionEvent('open'));
      health = await (await fetch(`${base}/api/health`)).json();
      expect(health.whatsapp).toMatchObject({ state: 'open', sending: true });

      await postWebhook(base, connectionEvent('close', 401));
      health = await (await fetch(`${base}/api/health`)).json();
      // The reason comes back as text, because that is what the column holds.
      expect(health.whatsapp).toMatchObject({ state: 'close', sending: false, reason: '401' });
    }));

  it('answers a connection event without treating it as a subscriber message', () =>
    withWhatsApp(async (base, sent) => {
      const res = await postWebhook(base, connectionEvent('open'));
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        handled: true,
        event: 'connection.update',
        state: 'open',
      });
      // Nothing was replied to anybody — this event is not from a person.
      expect(sent).toHaveLength(0);
    }));

  it('keeps the moment the state changed, not the last time it was repeated', () =>
    withWhatsApp(async (base) => {
      await postWebhook(base, connectionEvent('close'));
      const first = await (await fetch(`${base}/api/health`)).json();

      await postWebhook(base, connectionEvent('close'));
      const second = await (await fetch(`${base}/api/health`)).json();

      // "Down since 09:14" must survive the same event arriving again.
      expect(second.whatsapp.since).toBe(first.whatsapp.since);
    }));

  it('sends nothing while the link is down, and picks up again when it returns', () =>
    withWhatsApp(async (base, sent, server) => {
      const created = await putWa(base, KEY, {
        label: 'Morning protocol',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });
      const { code } = await created.json();
      await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));
      const before = sent.length;

      await postWebhook(base, connectionEvent('close'));

      // A due dose and a dead link: nothing goes out.
      server.whatsappStore.save(code, { nextRunAtMs: Date.now() - 60_000 });
      await server.whatsappWorker.tick();
      expect(sent).toHaveLength(before);

      await postWebhook(base, connectionEvent('open'));

      // The dose was never lost — it is still armed, and now it goes.
      await server.whatsappWorker.tick();
      expect(sent).toHaveLength(before + 1);
      expect(sent[sent.length - 1].body.text).toContain('Morning protocol');
    }));

  it('does not switch a reminder off just because the gateway was unreachable', () =>
    // The gateway answers 500 to everything: a temporary outage, not a bad
    // number. Reminders must survive it rather than be parked by it.
    withWhatsApp(
      async (base, sent, server) => {
        const created = await putWa(base, KEY, {
          label: 'Morning protocol',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        });
        const { code } = await created.json();

        // Link the number. The reply cannot be delivered (the gateway is down),
        // but the link itself is saved before the reply is attempted — which is
        // the order that matters when the gateway is having a bad day.
        await postWebhook(base, inbound('421911111111', `START ${code}`, 'A'));

        // Arm it, and fail it more times than the parking threshold allows.
        for (let attempt = 0; attempt < 7; attempt += 1) {
          server.whatsappStore.save(code, {
            status: 'active',
            nextRunAtMs: Date.now() - 60_000,
          });
          await server.whatsappWorker.tick();
        }

        const after = await (await fetch(`${base}/api/health`)).json();
        expect(after.ok).toBe(true);

        const rows = server.whatsappStore.due(new Date(Date.now() + 10 * 60_000).toISOString());
        // Still there, still active, still armed — an outage cost it time, not
        // its existence.
        expect(rows).toHaveLength(1);
        expect(rows[0].status).toBe('active');
        expect(rows[0].nextRunAtMs).toBeGreaterThan(Date.now());
      },
      { status: 500 },
    ));
});

describe('whatsapp — several plans on one number', () => {
  /** Two plans on one sync key, both still unclaimed. */
  async function twoPlans(base) {
    const first = await (
      await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      })
    ).json();
    const second = await (
      await putWa(base, KEY, {
        label: 'Evening peptide',
        dose: '5 units',
        rule: { ...ONGOING_RULE, times: ['20:00'] },
        timeZone: 'Europe/Bratislava',
      })
    ).json();
    return { first, second };
  }

  it('links both, and keeps both', () =>
    withWhatsApp(async (base) => {
      const { first, second } = await twoPlans(base);
      await postWebhook(base, inbound('421911111111', `START ${first.code}`, 'A'));
      await postWebhook(base, inbound('421911111111', `START ${second.code}`, 'B'));

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders).toHaveLength(2);
      expect(list.reminders.map((row) => row.label)).toEqual([
        'Morning protocol',
        'Evening peptide',
      ]);
      expect(list.reminders.every((row) => row.status === 'active')).toBe(true);
    }));

  it('numbers them in STATUS, and asks which one a bare time means', () =>
    withWhatsApp(async (base, sent) => {
      const { first, second } = await twoPlans(base);
      await postWebhook(base, inbound('421911111111', `START ${first.code}`, 'A'));
      await postWebhook(base, inbound('421911111111', `START ${second.code}`, 'B'));

      await postWebhook(base, inbound('421911111111', 'STATUS', 'C'));
      const status = sent[sent.length - 1].body.text;
      expect(status).toContain('1. Morning protocol');
      expect(status).toContain('2. Evening peptide');
      expect(status).toContain('Dose: 10 units');
      expect(status).toContain('Time: 20:00');

      await postWebhook(base, inbound('421911111111', '09:00', 'D'));
      expect(sent[sent.length - 1].body.text).toContain('Which one');
    }));

  it('retimes the plan the user numbered', () =>
    withWhatsApp(async (base, sent) => {
      const { first, second } = await twoPlans(base);
      await postWebhook(base, inbound('421911111111', `START ${first.code}`, 'A'));
      await postWebhook(base, inbound('421911111111', `START ${second.code}`, 'B'));

      await postWebhook(base, inbound('421911111111', '2 09:30', 'C'));
      expect(sent[sent.length - 1].body.text).toContain('09:30');
      expect(sent[sent.length - 1].body.text).toContain('Evening peptide');

      // The first plan kept its own time, and only the second moved.
      await postWebhook(base, inbound('421911111111', 'STATUS', 'D'));
      const status = sent[sent.length - 1].body.text;
      expect(status).toContain('1. Morning protocol');
      expect(status).toContain('Time: 08:00');
      expect(status.indexOf('Time: 08:00')).toBeLessThan(status.indexOf('Time: 09:30'));
    }));

  it('stops all of them on STOP', () =>
    withWhatsApp(async (base) => {
      const { first, second } = await twoPlans(base);
      await postWebhook(base, inbound('421911111111', `START ${first.code}`, 'A'));
      await postWebhook(base, inbound('421911111111', `START ${second.code}`, 'B'));

      await postWebhook(base, inbound('421911111111', 'STOP', 'C'));

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders).toHaveLength(2);
      expect(list.reminders.every((row) => row.status === 'stopped')).toBe(true);
    }));

  it('holds twenty vials on one number, because a digest is still one message', () =>
    withWhatsApp(async (base) => {
      /*
       * There used to be a ceiling of five here, from when every plan was
       * another message to the same person. The digest ended that: one number
       * gets one message a day whether it holds one vial or twenty, so a limit
       * would only ever mean silently leaving somebody's dose out.
       */
      for (let index = 0; index < 20; index += 1) {
        const created = await putWa(base, KEY, {
          slot: `v${index}`,
          label: `Plan ${index + 1}`,
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        });
        expect(created.status).toBe(200);
      }

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders).toHaveLength(20);
    }));

  it('answers in the language the app sent', () =>
    withWhatsApp(async (base, sent) => {
      const created = await (
        await putWa(base, KEY, {
          label: 'Ranný protokol',
          dose: '10 jednotiek',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
          lang: 'sk',
        })
      ).json();

      await postWebhook(base, inbound('421911111111', `START ${created.code}`, 'A'));
      expect(sent[sent.length - 1].body.text).toContain('Pripomienky sú zapnuté');

      await postWebhook(base, inbound('421911111111', 'STATUS', 'B'));
      expect(sent[sent.length - 1].body.text).toContain('Stav:');

      await postWebhook(base, inbound('421911111111', 'STOP', 'C'));
      expect(sent[sent.length - 1].body.text).toContain('Zastavené');
    }));

  it('falls back to English when the app sent a language we do not have', () =>
    withWhatsApp(async (base, sent) => {
      const created = await (
        await putWa(base, KEY, {
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
          lang: 'fr-CA',
        })
      ).json();
      await postWebhook(base, inbound('421911111111', `START ${created.code}`, 'A'));
      expect(sent[sent.length - 1].body.text).toContain('Reminders are on');
    }));
});

describe('whatsapp — keeping up with the plan', () => {
  it('follows a change to the times and the dose, on the same code', () =>
    withWhatsApp(async (base, sent) => {
      const created = await (
        await putWa(base, KEY, {
          label: 'Morning protocol',
          dose: '10 units',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      await postWebhook(base, inbound('421911111111', `START ${created.code}`, 'A'));

      let list = await (await getWa(base, KEY)).json();
      expect(list.reminders[0].rule.times).toEqual(['08:00']);
      expect(list.reminders[0].dose).toBe('10 units');
      const before = list.reminders[0].nextRunAt;

      // The app pushes the edited plan. Same code, so the wa.me link the user
      // already has keeps working.
      const edited = await (
        await putWa(base, KEY, {
          code: created.code,
          label: 'Morning protocol',
          dose: '5 units',
          rule: { ...ONGOING_RULE, times: ['20:00'] },
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      expect(edited.code).toBe(created.code);
      expect(edited.linked).toBe(true);

      list = await (await getWa(base, KEY)).json();
      expect(list.reminders[0].rule.times).toEqual(['20:00']);
      expect(list.reminders[0].dose).toBe('5 units');
      // And it was re-armed, not left pointing at the old time.
      expect(list.reminders[0].nextRunAt).not.toBe(before);

      // The next reminder the user gets says the new time.
      await postWebhook(base, inbound('421911111111', 'STATUS', 'B'));
      expect(sent[sent.length - 1].body.text).toContain('Time: 20:00');
      expect(sent[sent.length - 1].body.text).toContain('Dose: 5 units');
    }));

  it('reports the rule and dose back, which is what lets the app notice a stale one', () =>
    withWhatsApp(async (base) => {
      await putWa(base, KEY, {
        label: 'Morning protocol',
        dose: '10 units',
        rule: ONGOING_RULE,
        timeZone: 'Europe/Bratislava',
      });

      const list = await (await getWa(base, KEY)).json();
      expect(list.reminders[0]).toMatchObject({
        code: expect.any(String),
        label: 'Morning protocol',
        dose: '10 units',
        timeZone: 'Europe/Bratislava',
        rule: {
          times: ['08:00'],
          repeat: 'daily',
          intervalDays: 0,
          startsOn: '2020-01-01',
          durationValue: 0,
          durationUnit: 'ongoing',
        },
      });
    }));

  it('leaves a paused plan paused when the app pushes an edit', () =>
    withWhatsApp(async (base) => {
      const created = await (
        await putWa(base, KEY, {
          label: 'Morning protocol',
          rule: ONGOING_RULE,
          timeZone: 'Europe/Bratislava',
        })
      ).json();
      await postWebhook(base, inbound('421911111111', `START ${created.code}`, 'A'));
      await postWebhook(base, inbound('421911111111', 'PAUSE', 'B'));

      await putWa(base, KEY, {
        code: created.code,
        label: 'Morning protocol',
        dose: '10 units',
        rule: { ...ONGOING_RULE, times: ['20:00'] },
        timeZone: 'Europe/Bratislava',
      });

      const list = await (await getWa(base, KEY)).json();
      // The user asked for quiet. An edit is not a RESUME.
      expect(list.reminders[0].status).toBe('paused');
      expect(list.reminders[0].rule.times).toEqual(['20:00']);
    }));
});

describe('the server as a program, not a test fixture', () => {
  /**
   * Starts `node server/server.mjs` for real and waits for it to say it is up.
   *
   * Every other test here calls `createSyncServer()` directly, which means the
   * `if (isMain)` block at the bottom of the file — the startup banner — is
   * **never executed**. It called a function that only exists inside the factory
   * closure and crashed the process on `listen`; the whole suite stayed green.
   * This is the test that notices.
   */
  async function boot(env) {
    const dir = mkdtempSync(join(tmpdir(), 'pep-boot-'));
    const port = 8900 + Math.floor(Math.random() * 400);

    const child = spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', 'server/server.mjs'],
      {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          PORT: String(port),
          DB_PATH: join(dir, 'boot.sqlite'),
          ALLOWED_ORIGIN: 'https://pepstool.com',
          LOG_REQUESTS: '0',
          // The banner branch that crashed only runs when WhatsApp is on.
          WHATSAPP_URL: 'http://127.0.0.1:9',
          WHATSAPP_API_KEY: 'boot-test-key',
          WHATSAPP_INSTANCE: 'pepstool',
          WHATSAPP_WEBHOOK_SECRET: 'boot-test-secret',
          WHATSAPP_NUMBER: '421900000000',
          ...env,
        },
      },
    );

    let output = '';
    let exited = null;
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => {
      exited = code;
    });

    const deadline = Date.now() + 15_000;
    while (!output.includes('listening on') && Date.now() < deadline) {
      if (exited !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return {
      child,
      port,
      output: () => output,
      exited: () => exited,
      stop() {
        if (exited === null) child.kill('SIGKILL');
      },
    };
  }

  it('comes up, prints its banner, and is still running afterwards', async () => {
    const server = await boot({});
    try {
      expect(server.output()).toContain('listening on');
      // A crash during `listen` leaves this set — which is exactly what the
      // closure bug did, after having already printed "listening".
      expect(server.exited()).toBeNull();
      expect(server.output()).toContain('whatsapp:       on');
      expect(server.output()).not.toContain('ReferenceError');

      const res = await fetch(`http://127.0.0.1:${server.port}/api/health`);
      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toMatchObject({
        ok: true,
        whatsapp: { state: 'unknown', sending: true },
      });
    } finally {
      server.stop();
    }
  });

  it('serves the WhatsApp routes it advertises', async () => {
    const server = await boot({});
    try {
      // The image once shipped without these modules at all: the container died
      // with ERR_MODULE_NOT_FOUND, or answered 404 on a route the app calls.
      const health = await fetch(`http://127.0.0.1:${server.port}/api/health`);
      expect(health.status).toBe(200);

      const list = await fetch(`http://127.0.0.1:${server.port}/api/wa/${'a'.repeat(64)}`);
      expect(list.status).toBe(200);
      await expect(list.json()).resolves.toMatchObject({ reminders: [] });
    } finally {
      server.stop();
    }
  });

  it('stays up with every optional channel switched off', async () => {
    const server = await boot({
      WHATSAPP_URL: '',
      WHATSAPP_API_KEY: '',
      WHATSAPP_INSTANCE: '',
    });
    try {
      expect(server.output()).toContain('whatsapp:       off');
      expect(server.exited()).toBeNull();
      const res = await fetch(`http://127.0.0.1:${server.port}/api/health`);
      // No gateway configured means nothing to report on — and no crash.
      await expect(res.json()).resolves.toEqual({ ok: true, whatsapp: null });
    } finally {
      server.stop();
    }
  });
});

describe('whatsapp — a database written by an older build', () => {
  it('drops the old one-plan-per-number rule and adds the language column', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pep-wa-'));
    const file = join(dir, 'old.sqlite');

    /*
     * The old shape, built by hand: `reminder_phone` is UNIQUE — so a second
     * plan on one number would be refused — and there is no `lang` column.
     * Booting against it has to migrate both, or every existing install breaks
     * the moment a user tries a second plan.
     */
    const old = new DatabaseSync(file);
    old.exec(`
      CREATE TABLE reminder (
        key         TEXT PRIMARY KEY,
        phone       TEXT,
        owner       TEXT NOT NULL,
        label       TEXT NOT NULL,
        dose        TEXT NOT NULL,
        rule        TEXT NOT NULL,
        time_zone   TEXT NOT NULL,
        status      TEXT NOT NULL,
        next_run_at TEXT,
        expires_at  TEXT,
        failures    INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE UNIQUE INDEX reminder_phone ON reminder (phone);
    `);
    old.close();

    await withFakeEvolution(async (evolutionUrl) => {
      await withServer(
        {
          dbPath: file,
          rateLimit: 0,
          whatsappWebhookRateLimit: 0,
          whatsappUrl: evolutionUrl,
          whatsappApiKey: 'test-key',
          whatsappInstance: 'pepstool',
          whatsappSecret: WA_SECRET,
          whatsappNumber: '421900000000',
        },
        async (base) => {
          const first = await (
            await putWa(base, KEY, { label: 'A', rule: ONGOING_RULE, timeZone: 'Europe/Bratislava' })
          ).json();
          const second = await (
            await putWa(base, KEY, { label: 'B', rule: ONGOING_RULE, timeZone: 'Europe/Bratislava' })
          ).json();

          await postWebhook(base, inbound('421911111111', `START ${first.code}`, 'A'));
          await postWebhook(base, inbound('421911111111', `START ${second.code}`, 'B'));

          const list = await (await getWa(base, KEY)).json();
          expect(list.reminders).toHaveLength(2);
          expect(list.reminders.every((row) => row.status === 'active')).toBe(true);
        },
      );
    });
  });
});






