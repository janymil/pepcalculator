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
| `DB_PATH` | `server/data/sync.sqlite` | SQLite file location |
| `ALLOWED_ORIGIN` | `*` | CORS origin — set this to your app's URL in production |
| `MAX_BODY_BYTES` | `524288` | Largest accepted payload (512 KB) |

```bash
PORT=9000 ALLOWED_ORIGIN=https://your-app.example npm run server
```

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
- Deletions are **soft**: the app sends a tombstone so the removal reaches your
  other devices, then sweeps tombstones older than 90 days (`TOMBSTONE_TTL_DAYS`
  in `src/lib/vials.ts`). The server stores whatever payload it is handed and
  never prunes rows itself.
