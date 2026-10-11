/**
 * PepCalculator sync server — zero dependencies (Node's built-in http + sqlite).
 *
 * Stores an opaque JSON blob per user, keyed by the SHA-256 hash of their sync
 * code. The server never sees the code itself, only its hash.
 *
 *   GET  /api/health          -> { ok: true }
 *   GET  /api/sync/:key       -> { payload, updatedAt } | 404
 *   PUT  /api/sync/:key       -> { updatedAt }        body: { payload: string }
 *
 * Run:    npm run server           (listens on 8787 by default)
 * Config: PORT, DB_PATH, ALLOWED_ORIGIN, MAX_BODY_BYTES, RATE_LIMIT,
 *         RATE_WINDOW_MS, TRUST_PROXY, LOG_REQUESTS
 *
 * Hardening (roadmap item 2), all of it decided in `guard.mjs` and unit-tested
 * there: `ALLOWED_ORIGIN` may be a list and a caller from anywhere else gets a
 * 403 rather than a CORS-less response nobody can debug; a per-IP sliding-window
 * **rate limit** answers 429 with `Retry-After`; one **request log line** per call
 * with the sync key shortened to 8 characters, so a log identifies a record
 * without being usable as a credential; and `no-store` plus request timeouts.
 *
 * What this is **not**: an authentication layer. The code is a ~120-bit random
 * bearer token and stays the only credential — someone who has it, or who calls
 * from a script instead of a browser, is unaffected by CORS or by a rate limit.
 * That is the documented trade-off for having no email/password and no recovery.
 */

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import {
  clientKey,
  createRateLimiter,
  isOriginAllowed,
  logPath,
  parseAllowedOrigins,
} from './guard.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The key is a SHA-256 hex digest produced by the client. */
const KEY_PATTERN = /^[a-f0-9]{64}$/;

/** Everything configurable, read once — so a test can build a server directly. */
export function readConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 8787),
    dbPath: env.DB_PATH ?? join(here, 'data', 'sync.sqlite'),
    allowed: parseAllowedOrigins(env.ALLOWED_ORIGIN ?? '*'),
    maxBodyBytes: Number(env.MAX_BODY_BYTES ?? 512 * 1024),
    /** Requests per address per window on /api/sync. 0 disables the limit. */
    rateLimit: Number(env.RATE_LIMIT ?? 240),
    rateWindowMs: Number(env.RATE_WINDOW_MS ?? 60_000),
    /** Honour X-Forwarded-For — only when a real proxy sets it. */
    trustProxy: env.TRUST_PROXY === '1',
    logRequests: env.LOG_REQUESTS !== '0',
  };
}

function applyCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

/** Reads the request body, refusing anything oversized. */
function readBody(req, maxBodyBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let overflowed = false;
    const chunks = [];

    req.on('data', (chunk) => {
      // Keep draining the stream even after refusing, so the client can finish
      // sending and actually read the 413 instead of seeing a reset socket.
      if (overflowed) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        overflowed = true;
        chunks.length = 0;
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!overflowed) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

/**
 * Builds the server **without listening**, so the tests can use an ephemeral port
 * and an in-memory database. Returns the `http.Server`.
 */
export function createSyncServer(config = readConfig()) {
  // `:memory:` is how the tests run: no directory to create, no file left behind.
  if (config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });

  const db = new DatabaseSync(config.dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync (
      key        TEXT PRIMARY KEY,
      payload    TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const selectStmt = db.prepare('SELECT payload, updated_at FROM sync WHERE key = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO sync (key, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `);

  const limiter =
    config.rateLimit > 0
      ? createRateLimiter({ limit: config.rateLimit, windowMs: config.rateWindowMs })
      : null;

  const server = createServer(async (req, res) => {
    const started = Date.now();
    const origin = req.headers.origin;
    const rawPath = (req.url ?? '/').split('?')[0];
    const who = () => clientKey(req, { trustProxy: config.trustProxy });

    const done = (status) => {
      if (!config.logRequests) return;
      const parts = [
        String(status),
        req.method ?? '?',
        logPath(rawPath),
        `${Date.now() - started}ms`,
        who(),
      ];
      if (origin) parts.push(`origin=${origin}`);
      console.log(parts.join(' '));
    };

    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
      done(status);
    };

    // A synced payload is private: no proxy, no browser and no disk cache keeps it.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (config.allowed === '*') {
      applyCors(res, '*');
    } else {
      // The CORS answer depends on who is asking, so it must not be cached blind.
      res.setHeader('Vary', 'Origin');
      if (origin && !isOriginAllowed(origin, config.allowed)) {
        send(403, { error: 'origin_not_allowed' });
        return;
      }
      if (origin) applyCors(res, origin);
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      done(204);
      return;
    }

    if (rawPath === '/api/health') {
      send(200, { ok: true });
      return;
    }

    const match = rawPath.match(/^\/api\/sync\/([^/]+)$/);
    if (!match) {
      send(404, { error: 'not_found' });
      return;
    }

    // Charged per address, and only for the endpoint that touches the database.
    if (limiter) {
      const verdict = limiter.check(who());
      if (!verdict.allowed) {
        res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
        send(429, { error: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds });
        return;
      }
      res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
    }

    const key = match[1].toLowerCase();
    if (!KEY_PATTERN.test(key)) {
      send(400, { error: 'invalid_key' });
      return;
    }

    if (req.method === 'GET') {
      const row = selectStmt.get(key);
      if (!row) {
        send(404, { error: 'not_found' });
        return;
      }
      send(200, { payload: row.payload, updatedAt: row.updated_at });
      return;
    }

    if (req.method === 'PUT') {
      try {
        const parsed = JSON.parse(await readBody(req, config.maxBodyBytes));
        if (typeof parsed?.payload !== 'string') {
          send(400, { error: 'invalid_payload' });
          return;
        }
        const updatedAt = new Date().toISOString();
        upsertStmt.run(key, parsed.payload, updatedAt);
        send(200, { updatedAt });
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'payload_too_large';
        send(tooLarge ? 413 : 400, { error: tooLarge ? 'payload_too_large' : 'invalid_json' });
      }
      return;
    }

    send(405, { error: 'method_not_allowed' });
  });

  // This API answers in milliseconds, so nothing legitimate holds a connection
  // open: Node's generous defaults are only a slow-loris window here.
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;

  // Closing the server closes the database: the prepared statements live as long
  // as this closure, and leaving them to garbage collection is how a late request
  // meets "statement has been finalized" instead of a clean shutdown.
  server.on('close', () => db.close());

  return server;
}

/** Only starts a listener when run as a program — an import must not bind a port. */
const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isMain) {
  const config = readConfig();
  const server = createSyncServer(config);

  server.listen(config.port, () => {
    console.log(`PepCalculator sync server listening on http://localhost:${config.port}`);
    console.log(`  database:       ${config.dbPath}`);
    console.log(`  allowed origin: ${config.allowed === '*' ? '*' : config.allowed.join(', ')}`);
    console.log(
      `  rate limit:     ${
        config.rateLimit > 0
          ? `${config.rateLimit} / ${config.rateWindowMs / 1000}s per address`
          : 'off'
      }`,
    );
    if (config.allowed === '*') {
      console.warn('  ! ALLOWED_ORIGIN=* — any website can call this API from a browser.');
      console.warn('    Set ALLOWED_ORIGIN=https://your-app.example in production.');
    }
  });
}
