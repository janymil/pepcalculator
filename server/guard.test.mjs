import { describe, expect, it } from 'vitest';
import {
  clientKey,
  createRateLimiter,
  isOriginAllowed,
  logPath,
  parseAllowedOrigins,
  redactKey,
} from './guard.mjs';

describe('parseAllowedOrigins', () => {
  it('treats an empty value and * as "any origin"', () => {
    expect(parseAllowedOrigins('')).toBe('*');
    expect(parseAllowedOrigins('  ')).toBe('*');
    expect(parseAllowedOrigins('*')).toBe('*');
    expect(parseAllowedOrigins(undefined)).toBe('*');
  });

  it('splits a list and ignores trailing slashes', () => {
    expect(parseAllowedOrigins('https://a.example/, https://b.example')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });
});

describe('isOriginAllowed', () => {
  it('lets anything through when the list is *', () => {
    expect(isOriginAllowed('https://evil.example', '*')).toBe(true);
  });

  it('allows a listed origin, with or without its trailing slash', () => {
    const allowed = ['https://app.example'];
    expect(isOriginAllowed('https://app.example', allowed)).toBe(true);
    expect(isOriginAllowed('https://app.example/', allowed)).toBe(true);
  });

  it('refuses an origin that is not listed', () => {
    expect(isOriginAllowed('https://evil.example', ['https://app.example'])).toBe(false);
  });

  it('allows a missing Origin — a same-origin call, curl or health check', () => {
    // A browser would not block these anyway, so refusing them only breaks
    // honest callers (and would make `curl` look broken).
    expect(isOriginAllowed(undefined, ['https://app.example'])).toBe(true);
  });
});

describe('createRateLimiter', () => {
  it('allows up to the limit inside the window, then reports a retry', () => {
    let now = 1_000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').remaining).toBe(1);
    const third = limiter.check('a');
    expect([third.allowed, third.remaining]).toEqual([true, 0]);

    const fourth = limiter.check('a');
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBe(60);

    // A rejected call must not extend its own lockout.
    now += 40_000;
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('a').retryAfterSeconds).toBe(20);
  });

  it('slides: a call leaves the window and makes room again', () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => now });

    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);

    now = 10_000;
    expect(limiter.check('a').allowed).toBe(true);
  });

  it('charges each caller separately, and sweeps a window that has passed', () => {
    let now = 0;
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1_000,
      // Sweep on every call, so the test does not depend on timing.
      sweepEvery: 1,
      now: () => now,
    });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true); // a second address is not punished
    expect(limiter.size()).toBe(2);

    now = 5_000;
    limiter.check('a');
    // 'b' was swept, so the map cannot grow with the number of addresses seen.
    expect(limiter.size()).toBe(1);
  });
});

describe('clientKey', () => {
  const req = (headers = {}, address = '10.0.0.1') => ({
    headers,
    socket: { remoteAddress: address },
  });

  it('uses the socket address by default', () => {
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4' }))).toBe('10.0.0.1');
  });

  it('honours the first X-Forwarded-For hop only behind a trusted proxy', () => {
    expect(clientKey(req({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }), { trustProxy: true })).toBe(
      '1.2.3.4',
    );
  });

  it('survives a request with no socket information', () => {
    expect(clientKey({ headers: {} })).toBe('unknown');
  });
});

describe('log redaction', () => {
  const key = 'abcdef0123456789'.repeat(4);

  it('shortens a sync key to eight characters', () => {
    expect(redactKey(key)).toBe('abcdef01…');
    expect(redactKey('short')).toBe('short');
  });

  it('leaves the rest of the path alone', () => {
    expect(logPath(`/api/sync/${key}`)).toBe('/api/sync/abcdef01…');
    expect(logPath(`/api/push/${key}`)).toBe('/api/push/abcdef01…');
    expect(logPath('/api/health')).toBe('/api/health');
    expect(logPath('/api/sync/not-a-key')).toBe('/api/sync/not-a-key');
  });
});
