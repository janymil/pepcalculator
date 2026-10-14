# PepCalculator sync server

A Node service that stores one JSON blob per sync code, so the same vials follow
you between your phone and your computer — with no email, no password and no
account. It also delivers **dose reminders while the app is closed** over Web
Push; that is the only part needing a dependency (`web-push`, loaded lazily), and
it stays dormant until you set VAPID keys.

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
| `VAPID_PUBLIC_KEY` | – | Web Push public key (`npm run vapid`). Push is **off** until this and the private key are set |
| `VAPID_PRIVATE_KEY` | – | Web Push private key. Keep it secret, keep it forever |
| `VAPID_SUBJECT` | `mailto:admin@example.com` | Contact `mailto:`/URL sent to the push service |
| `PUSH_INTERVAL_MS` | `30000` | How often the scheduler checks for a due dose |
| `WHATSAPP_URL` | – | Evolution API's base URL. Sending is **off** until this, the key and the instance are all set |
| `WHATSAPP_API_KEY` | – | The instance's `AUTHENTICATION_API_KEY`. Sent as the `apikey` header |
| `WHATSAPP_INSTANCE` | – | The instance name, created once and linked by QR code |
| `WHATSAPP_SEND_PATH` | `/message/sendText/{instance}` | The send path. v1 and v2 have differed — check the instance's own `/docs` |
| `WHATSAPP_WEBHOOK_SECRET` | – | The webhook secret, checked in **both** the path and the `apikey` header. Without it the webhook is unauthenticated |
| `WHATSAPP_NUMBER` | – | The public number for the `wa.me` link, digits only. Without it `PUT /api/wa/:key` answers `503` |
| `WHATSAPP_INTERVAL_MS` | `30000` | How often the worker looks for a due reminder |
| `WHATSAPP_WEBHOOK_RATE_LIMIT` | `60` | Requests per address per window on the webhook, on its own budget; `0` disables it |
| `MANAGE_URL` | – | Where "your plans" points, in the help text a subscriber gets back |
| `ALERT_WEBHOOK_URL` | – | Where a dropped link is announced. Empty means "log it loudly and carry on" |

```bash
PORT=9000 ALLOWED_ORIGIN=https://your-app.example npm run server
```

The server warns loudly at startup when `ALLOWED_ORIGIN` is still `*`.

### What a request log line looks like

```
200 PUT /api/sync/aaaaaaaa… 3ms ::1
403 GET /api/sync/aaaaaaaa… 1ms ::1 origin=https://evil.example
429 GET /api/sync/aaaaaaaa… 1ms ::1
200 PUT /api/push/aaaaaaaa… 3ms ::1
```

The sync (and push) key is shortened to eight characters: a log identifies
*which record* was touched without holding anything usable as a credential.

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
`node:22-alpine`; the only install step is `web-push`, and it is only ever loaded
when VAPID keys are set (see **Push** below). The database lives on the `/data`
volume, and the container has a `HEALTHCHECK` hitting `/api/health`.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | – | `{ ok: true }` |
| `GET` | `/api/sync/:key` | – | `{ payload, updatedAt }` or `404` |
| `PUT` | `/api/sync/:key` | `{ payload: string }` | `{ updatedAt }` |
| `GET` | `/api/push/pubkey` | – | `{ publicKey }` (VAPID public key, or `null`) |
| `PUT` | `/api/push/:key` | `{ subscription, queue }` | `{ scheduled, updatedAt }` |
| `DELETE` | `/api/push/:key` | – | `{ ok: true }` |
| `PUT` | `/api/wa/:key` | `{ code?, label, dose, rule, timeZone, lang }` | `{ code, link, expiresAt, status, linked, whatsappNumber }` |
| `GET` | `/api/wa/:key` | – | `{ whatsappNumber, reminders: [{ code, label, dose, status, linked, nextRunAt, rule, timeZone }] }` |
| `DELETE` | `/api/wa/:key` | – | `{ ok: true }` |
| `POST` | `/api/wa/webhook/:secret` | Evolution's payload | `{ ok, handled, intent?, linked? }` |

`:key` is the **SHA-256 hex digest** of the user's sync code (64 chars). The
server never receives the code itself — and the push and WhatsApp records use the
**same key**, so there is nothing new to create.

`:secret` is different, and it is the one endpoint here that is not the sync-code
pattern: see *WhatsApp reminders* below.

## Push (reminders while the app is closed)

A plain web page can only run a timer while it is alive. To notify you at a dose
time with the app shut, the app uploads its upcoming doses here and the server
pushes each one at the right moment.

- **Generate keys once:** `npm run vapid`, then set `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` (and `VAPID_SUBJECT`). Use the **same pair forever** — every
  device's subscription is signed with it. With no keys, push is off and the
  server behaves exactly like the old sync-only service (and never imports
  `web-push`).
- **What the app sends:** a subscription (`endpoint` + keys) and a `queue` of
  upcoming notifications, each an absolute UTC instant plus the **already
  localised** title/body. The schedule maths never leaves the app, so a push
  cannot disagree with the calendar, and the service worker stays language-free.
- **What the server does:** `server/push.mjs` holds the pure helpers and a
  scheduler that, every `PUSH_INTERVAL_MS`, sends whatever is due and stores the
  rest. It drops a subscription the push service reports as gone (404/410) and
  retries anything else, so a brief outage cannot lose a dose.
- **Platform reality:** desktop and Android receive a push with the browser
  closed, once the site has been opened and notification permission granted. On
  **iOS it only works for a site added to the Home Screen** — Web Push there needs
  an installed PWA. And a device that never opened the app cannot be reached:
  there is no subscription to send to.

The stored queue is bounded (a horizon of ~60 days and a cap of 500 entries) so an
"ongoing" plan can never grow the record without limit.

## WhatsApp reminders (optional, off by default)

The full reasoning, the refused alternatives and the honest list of what has not
been tested are in **`PROPOSAL-whatsapp-reminders.md`**. The short version:

> Evolution API is an **unofficial** WhatsApp client. The number can be banned,
> permanently and with no appeal. That is why Web Push stays the default, and why
> this stays an extra rather than a replacement.

**The rule travels, not the queue.** This is the one place the design differs
from push, and it is the whole point. Push stores finished notification text,
capped by a 60-day horizon — so an app that is never opened goes quiet. WhatsApp
stores `{ times, repeat, startsOn, durationValue, durationUnit }` and works the
next instant out itself in `recurrence.mjs`. One row, and an *ongoing* plan keeps
running for ever, because there is no end date to run out of.

Four tables, `next_run_at` indexed, and the worker asks one question:

```sql
SELECT reminder.* FROM reminder
  LEFT JOIN subscriber ON subscriber.phone = reminder.phone
 WHERE reminder.status = 'active'
   AND reminder.next_run_at IS NOT NULL
   AND reminder.next_run_at <= ?
   AND subscriber.opted_out_at IS NULL
 ORDER BY reminder.next_run_at
```

That `LEFT JOIN` is a promise, not an optimisation: a number that has sent `STOP`
is never messaged again, whatever a reminder row happens to say.

### Linking a number

The user writes first. The app creates the reminder, gets back a 6-character code
and a `wa.me` link with `START <code>` pre-filled, and the user taps it. The phone
number says *who*; the code says *which plan*. There is no cold outbound message
anywhere in this design.

The code is **not** the sync code. The sync code is a ~120-bit bearer token and
the sync API's only credential — see *Security model* above — so it must never
travel through WhatsApp. The pairing code is separate: six characters from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, usable once, expiring after 7 days, and
claimable by exactly one number.

### Commands

`STOP` · `PAUSE` · `RESUME` · `STATUS` · `HELP` · a time (`08:00`, `8.30`, `7pm`,
or `2 09:30` for plan 2) · `START <code>` or a bare `<code>` to link.
Case-insensitive, tolerating a trailing full stop.

A number may hold up to `MAX_PLANS` (5) plans. `STOP`, `PAUSE` and `RESUME` cover
**every** plan on the number; `STATUS` numbers them; a bare time with more than
one plan on asks which. Numbering is `ORDER BY created_at, key`, and a stopped
plan takes no number — so "2" always means the second plan the user just read.

Keywords are matched **before** codes, and that ordering is load-bearing: `STATUS`
is six characters long and every letter of it is in the code alphabet, so a
code-first parser would read it as a pairing code and try to start a protocol.

### The words

`server/messages.mjs` holds every message in `en`, `sk` and `es`. The app sends
its `lang` when it creates a plan, the reminder row stores it, and the server
answers in whatever that row says. A test asserts every language has every key
the English one has.

### Keeping up with the plan

The server stores a **copy** of the rule, so it has to be told when the plan
changes. `GET /api/wa/:key` returns that stored `rule` and `timeZone`, and the app
pushes a new one whenever the plan on screen stops matching it — reusing the
**same code**, so the `wa.me` link the user already has keeps working.

Without this, changing the time in the app would leave the server firing the old
schedule for ever, with nothing anywhere saying so.

The app pushes on a **real change only**, never on every open — otherwise opening
the app would undo a time the user had set by typing `09:30` into WhatsApp. If a
push fails (offline mid-edit), the next open sees the mismatch against the
server's own rule and pushes again.

A push never resurrects a paused plan: an edit is not a `RESUME`.

### When the link drops

The one failure that stops everything, so it is not left to a log line:

```
curl -s localhost:8787/api/health
{"ok":true,"whatsapp":{"state":"close","since":"2026-01-14T09:14:02Z","reason":"401","sending":false}}
```

`connection.update` from Evolution is stored in `instance_state` and answered
from `/api/health`, because *"nobody is due"* and *"the channel is dead"* look
identical from the outside. A change away from `open` prints:

```
whatsapp link close (reason 401) — NO REMINDERS WILL BE SENT WHILE THE LINK IS
DOWN. Re-link the instance and scan the QR code.
```

and posts to `ALERT_WEBHOOK_URL` if one is set.

While the link is down the worker **skips its tick** rather than charging a
failure to every subscriber, and the armed times are untouched — so a dose is
delayed by an outage, never lost to one.

### Which failures park a reminder

| Failure | What happens |
| --- | --- |
| **4xx** from the gateway | This number or message is wrong. Retried twice, then parked at `status = 'error'` |
| **5xx, timeout, refused connection** | The gateway is unavailable. Retried for ever, with a 2-minute backoff |
| **Link known to be down** | Not attempted at all, and not counted |

That distinction is not cosmetic. Without it, five failures over a ten-minute
outage would park every reminder for every user, permanently.

### Upgrading from an earlier build

Nothing to do. On startup the server drops the old `reminder_phone` **unique**
index (SQLite would otherwise keep refusing a second plan per number, and
`CREATE INDEX IF NOT EXISTS` cannot replace an index whose name is taken), and
adds the `lang` column if it is missing. Both are idempotent.

### The webhook secret

`POST /api/wa/webhook/:secret` is protected by the **path secret**: 256 random
bits, checked with `timingSafeEqual`, and its own rate limit separate from the
app's.

**An `apikey` header is optional, not required.** Evolution's webhook is a plain
`axios` POST — `content-type`, `user-agent`, body — with **no `apikey` header at
all**. Requiring one refused every real webhook with a 403 while everything on the
outside still looked healthy. Verified by pointing the webhook at a logging
container and reading the raw request.

If a deployment sets `headers` on the instance webhook, they are sent, and then
they must match (`WHATSAPP_WEBHOOK_SECRET` or the gateway's own key). A refusal
always logs *why*, because a silent 403 here is a stopped channel that looks like
a working one.

The recommended deployment keeps this route off the public internet entirely:
`docker-compose.whatsapp.yml` and `docker-compose.yml` share one network
(`pepstool-whatsapp`), so Evolution reaches it as
`http://sync:8787/api/wa/webhook/<secret>`.

### Linking the phone

Evolution can link as a companion device by **pairing code** or by **QR**. Use
this, which prints whichever the API is currently offering and **keeps refreshing
it until the link opens**:

```bash
python3 scripts/whatsapp-link.py                 # QR as text, refreshed until linked
python3 scripts/whatsapp-link.py --png qr.png    # also write a PNG to open in VS Code
python3 scripts/whatsapp-link.py --big           # 2 chars per module, for a wide terminal
```

Both routes expire, and that is the whole problem with doing it by hand: a code
is good for about two minutes, a QR rotates every few tens of seconds, and by the
time a fetched code has been pasted into a chat and read, it is dead. So the
script redraws it every 25s until the instance reports `open`, and you scan or
type whenever you are actually ready.

**The QR is drawn two modules per character cell**, which is what makes it fit.
A terminal cell is about twice as tall as it is wide, so the obvious "two
characters per module" rendering gives the right shape at the wrong size: an
81-module symbol then needs 170 columns and runs off the side of the screen.
Packing it with `▀ ▄ █` gives the same square shape in **89 columns and 45 rows**.
That is the floor for text — 81 modules cannot fit fewer than 81 columns — so on a
narrower terminal use `--png` and scan the image instead of the text.

Then on the phone: **WhatsApp Business → Settings → Linked devices → Link a
device**. Either scan the QR, or tap **"Link with phone number instead"** and type
the 8-character code.

Two things worth knowing, both learned the hard way:

- **WhatsApp allows one pairing code per number at a time, with a cooldown.** Ask
  again too soon and the API returns `pairingCode: null` — not an error, not a
  failure, just nothing. The QR is still there, so "no code" is not a reason to
  start debugging.
- **Re-linking does not need the instance recreated**, just a fresh
  `/instance/connect`. The phone stays primary; chats stay where they are;
  unlinking is one tap in that same menu.

If you would rather do it by hand:

```bash
# Create the instance WITH the number. That is what makes it issue a code.
curl -s -X POST http://127.0.0.1:8080/instance/create \
  -H "apikey: $WHATSAPP_API_KEY" -H 'Content-Type: application/json' \
  -d "{\"instanceName\":\"pepstool\",\"number\":\"$WHATSAPP_NUMBER\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\"}"

# Then read the code (a fresh one each time) — or the QR, as base64.
curl -s "http://127.0.0.1:8080/instance/connect/pepstool" \
  -H "apikey: $WHATSAPP_API_KEY"
```

Confirm it took, and that the server agrees:

```bash
curl -s "http://127.0.0.1:8080/instance/connectionState/pepstool" \
  -H "apikey: $WHATSAPP_API_KEY"          # → "state":"open"
curl -s http://127.0.0.1:8787/api/health   # → whatsapp.state "open"
```

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
