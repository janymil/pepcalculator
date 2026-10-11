# PepCalculator sync server

A **zero-dependency** Node service that stores one JSON blob per sync code, so
the same vials follow you between your phone and your computer — with no email,
no password and no account.

## Run it locally

```bash
npm run server
# PepCalculator sync server listening on http://localhost:8787
```

Then, in the app, open **Sync → Create sync code** and paste the printed URL
into the server field (default `http://localhost:8787`).

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `DB_PATH` | `server/data/sync.sqlite` | SQLite file location (`:memory:` for a throwaway run) |
| `ALLOWED_ORIGIN` | `*` | Allowed CORS origins — **set this to your app's URL in production**. Accepts a comma-separated list |
| `MAX_BODY_BYTES` | `524288` | Largest accepted payload (512 KB) |
| `RATE_LIMIT` | `240` | Requests per address per window on `/api/sync`; `0` disables the limit |
| `RATE_WINDOW_MS` | `60000` | The rate-limit window |
| `TRUST_PROXY` | off | Honour `X-Forwarded-For`. Set to `1` **only** behind a proxy you control |
| `LOG_REQUESTS` | on | One log line per request; `0` turns it off |

```bash
PORT=9000 ALLOWED_ORIGIN=https://your-app.example npm run server
```

The server warns loudly at startup when `ALLOWED_ORIGIN` is still `*`.

### What a request log line looks like

```
200 PUT /api/sync/aaaaaaaa… 3ms ::1
403 GET /api/sync/aaaaaaaa… 1ms ::1 origin=https://evil.example
429 GET /api/sync/aaaaaaaa… 1ms ::1
```

The sync key is shortened to eight characters: a log identifies *which record* was
touched without holding anything usable as a credential.

## Hardening

All of the decision-making lives in `server/guard.mjs` — pure functions, unit-tested
in `server/guard.test.mjs`, with the wiring tested over real HTTP in
`server/server.test.mjs` (`npm test` runs both).

| Rule | Behaviour |
| --- | --- |
| **Origin list** | A request whose `Origin` is not on the list gets `403 {"error":"origin_not_allowed"}` instead of a CORS-less response nobody can debug. A caller with **no** `Origin` (same-origin fetch, health probe, `curl`) is allowed. |
| **Cache safety** | Every response carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer`. A synced payload is private data. |
| **Rate limiting** | Per address, sliding window, on `/api/sync` only; `/api/health` is exempt. Over the limit: `429` with `Retry-After`, and `X-RateLimit-Remaining` on the responses that are still allowed. A rejected call does not extend its own lockout, and the map is swept so it cannot grow with the number of addresses seen. |
| **Body limit** | Oversized payloads are refused with `413` while the stream keeps draining, so the client reads the error instead of seeing a reset socket. |
| **Timeouts** | `headersTimeout` 10 s and `requestTimeout` 30 s — this API answers in milliseconds, so nothing legitimate holds a connection open. |

**What hardening is not:** authentication. The sync code remains the only
credential, and anything calling from a script rather than a browser is unaffected
by CORS or by a rate limit. See the security model below.

## Docker

```bash
docker build -t pepcalculator-sync .
docker run -d --name pepcalc-sync -p 127.0.0.1:8787:8787 \
  -v sync-data:/data \
  -e ALLOWED_ORIGIN=https://your-app.example \
  pepcalculator-sync
```

Or `docker compose up -d` with the included `docker-compose.yml` (which binds to
loopback on purpose — put a TLS reverse proxy in front). The image is
`node:22-alpine` plus two files: there is no dependency install step, because the
server uses only Node built-ins. The database lives on the `/data` volume, and the
container has a `HEALTHCHECK` hitting `/api/health`.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | `{ ok: true }` |
| `GET` | `/api/sync/:key` | – | `{ payload, updatedAt }` or `404` |
| `PUT` | `/api/sync/:key` | `{ payload: string }` | `{ updatedAt }` |

`:key` is the **SHA-256 hex digest** of the user's sync code (64 chars). The
server never receives the code itself.

## Hosting

Any host that runs Node 22+ works. Options:

- a small VPS or your existing shared host (if it runs Node),
- Render / Railway / Fly.io free tiers,
- your own machine behind a tunnel.

**Put it behind HTTPS in production** — the browser only exposes `crypto.subtle`
in a secure context, and the code should never travel in clear text.

**Back up `server/data/sync.sqlite`.** That file *is* everyone's synced data.

## Security model (read this)

- The sync code is ~120 bits of randomness from `crypto.getRandomValues`, so
  guessing one is not realistic.
- The code **is** the credential. Anyone who has it can read and write that
  record — treat it like a password and don't share it.
- There is **no recovery**. Lose the code and the server-side copy is
  unrecoverable. That is exactly why the app also offers a JSON **backup**.
- A stolen `sync.sqlite` exposes every payload, because the hash is a lookup key
  rather than a slow password hash. Encrypt the disk / keep the file private.
- **The origin list and the rate limit are browser-side controls.** They stop a
  website from silently calling your server on a visitor's behalf, and they blunt
  a flood — but anyone who can send an HTTP request by hand can ignore CORS, and a
  distributed flood is unaffected by a per-address limit. The credential is the
  sync code; treat everything else as a seatbelt, not a lock.
- Deletions are **soft**: the app sends a tombstone so the removal reaches your
  other devices, then sweeps tombstones older than 90 days (`TOMBSTONE_TTL_DAYS`
  in `src/lib/vials.ts`). The server stores whatever payload it is handed and
  never prunes rows itself.
