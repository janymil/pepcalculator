/**
 * Pure guards for the sync server: **who may call it**, and **how often**.
 *
 * No dependencies, no I/O, and the clock is always passed in — so the two rules
 * that protect the server can be tested without opening a socket. `server.mjs`
 * does the wiring; everything decidable lives here.
 */

/**
 * `ALLOWED_ORIGIN` as a list. `*` (or empty) means "any origin".
 *
 * Trailing slashes are stripped: `https://app.example/` and `https://app.example`
 * are the same origin, and a mismatch here would look like a broken CORS setup.
 */
export function parseAllowedOrigins(raw) {
  const value = String(raw ?? '').trim();
  if (value === '' || value === '*') return '*';
  return value
    .split(',')
    .map((part) => part.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * Whether a request's `Origin` may call the API.
 *
 * A **missing** `Origin` is allowed: that is the app's own same-origin fetch, a
 * curl, or a health check — none of which a browser would block, so refusing them
 * would only break honest callers. This is a browser-side control and is
 * documented as one; the sync code remains the actual credential.
 */
export function isOriginAllowed(origin, allowed) {
  if (allowed === '*') return true;
  if (!origin) return true;
  return allowed.includes(String(origin).replace(/\/+$/, ''));
}

/**
 * A sliding-window rate limiter.
 *
 * `check(key)` returns `{ allowed, remaining, retryAfterSeconds }`. A rejected
 * call is **not** recorded, so a burst cannot extend its own lockout, and the
 * window is pruned on every call so `size()` stays honest in a long-running
 * process.
 */
export function createRateLimiter({ limit, windowMs, sweepEvery = 128, now = () => Date.now() }) {
  /** @type {Map<string, number[]>} key -> timestamps, oldest first */
  const hits = new Map();
  let checks = 0;

  const prune = (stamps, at) => {
    let index = 0;
    while (index < stamps.length && at - stamps[index] >= windowMs) index += 1;
    return index === 0 ? stamps : stamps.slice(index);
  };

  /**
   * Drops every key whose window has passed.
   *
   * Amortised rather than per call: pruning only the key being checked would let
   * the map grow with the number of distinct addresses ever seen, which is
   * exactly the unbounded growth a rate limiter must not have.
   */
  const sweep = (at) => {
    for (const [key, stamps] of hits) {
      const live = prune(stamps, at);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  };

  return {
    check(key) {
      const at = now();
      checks += 1;
      if (sweepEvery > 0 && checks % sweepEvery === 0) sweep(at);

      const recent = prune(hits.get(key) ?? [], at);

      if (recent.length >= limit) {
        hits.set(key, recent);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (at - recent[0])) / 1000)),
        };
      }

      recent.push(at);
      hits.set(key, recent);
      return { allowed: true, remaining: limit - recent.length, retryAfterSeconds: 0 };
    },
    /** Live keys. Used by the tests and by nothing else. */
    size() {
      return hits.size;
    },
  };
}

/**
 * The address a rate limit is charged to.
 *
 * `X-Forwarded-For` is only honoured behind `TRUST_PROXY=1`: otherwise anyone
 * could send the header and get a fresh budget per request.
 */
export function clientKey(req, { trustProxy = false } = {}) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (first) return String(first).split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/** A sync key as it may appear in a log line: enough to correlate, not to use. */
export function redactKey(key) {
  const value = String(key);
  return value.length <= 8 ? value : `${value.slice(0, 8)}…`;
}

/** The path for a log line, with a real sync or push key shortened. */
export function logPath(rawPath) {
  return String(rawPath).replace(
    /^(\/api\/(?:sync|push)\/)([a-f0-9]{64})$/,
    (_, prefix, key) => prefix + redactKey(key),
  );
}
