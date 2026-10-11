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
 * Config: PORT, DB_PATH, ALLOWED_ORIGIN, MAX_BODY_BYTES
 *
 * Security model: the code is a ~120-bit random bearer token. Anyone who has it
 * can read and write that record — this is a deliberate trade-off for having no
 * email/password and no account recovery.
 */

import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? join(here, 'data', 'sync.sqlite');
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 512 * 1024);
/** The key is a SHA-256 hex digest produced by the client. */
const KEY_PATTERN = /^[a-f0-9]{64}$/;

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
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

function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** Reads the request body, refusing anything oversized. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  applyCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/api/health') {
    send(res, 200, { ok: true });
    return;
  }

  const match = url.pathname.match(/^\/api\/sync\/([^/]+)$/);
  if (!match) {
    send(res, 404, { error: 'not_found' });
    return;
  }

  const key = match[1].toLowerCase();
  if (!KEY_PATTERN.test(key)) {
    send(res, 400, { error: 'invalid_key' });
    return;
  }

  if (req.method === 'GET') {
    const row = selectStmt.get(key);
    if (!row) {
      send(res, 404, { error: 'not_found' });
      return;
    }
    send(res, 200, { payload: row.payload, updatedAt: row.updated_at });
    return;
  }

  if (req.method === 'PUT') {
    try {
      const parsed = JSON.parse(await readBody(req));
      if (typeof parsed?.payload !== 'string') {
        send(res, 400, { error: 'invalid_payload' });
        return;
      }
      const updatedAt = new Date().toISOString();
      upsertStmt.run(key, parsed.payload, updatedAt);
      send(res, 200, { updatedAt });
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'payload_too_large';
      send(res, tooLarge ? 413 : 400, { error: tooLarge ? 'payload_too_large' : 'invalid_json' });
    }
    return;
  }

  send(res, 405, { error: 'method_not_allowed' });
});

server.listen(PORT, () => {
  console.log(`PepCalculator sync server listening on http://localhost:${PORT}`);
  console.log(`  database:       ${DB_PATH}`);
  console.log(`  allowed origin: ${ALLOWED_ORIGIN}`);
});
