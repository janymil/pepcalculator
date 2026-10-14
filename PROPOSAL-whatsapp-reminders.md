# WhatsApp dose reminders — proposal, and what was built

**Status:** Shipped, unproven against a live WhatsApp number (see *What has not
been tested*). Every route, table and message in this document exists in the
code, with tests.

## Verdict

**Build the WhatsApp channel on Evolution API. Keep Web Push as the default and
never let WhatsApp be the only reminder.**

The reasoning in one paragraph. The official route (Meta Cloud API or a reseller
such as WhatChimp) costs per message, requires an approved **template** for every
wording change, and puts a health-adjacent message in front of a reviewer. The
unofficial route (Evolution API, which runs a real WhatsApp client under the
hood) costs nothing, allows free text and needs no review. It also carries a real
and permanent risk that the number is banned, with no appeal, which would take
every reminder with it. Neither is free. The official route buys safety at a
price; the unofficial route buys freedom at risk. This project chose the second
**on the condition** that the first is not needed for the reminders to work —
which is why Web Push stays the default channel, and why the code says so in
several places.

### What was refused, and why

| Route | Decision | Reason |
| --- | --- | --- |
| **Meta Cloud API / WhatChimp** | **Refused** | Per-message cost, a template review for every wording change, and a health-adjacent topic in front of an automated reviewer. The message we need is a private planner note, not a marketing send. |
| **Email** | **Refused** | A dose reminder at 08:00 that is read at 18:00 is not a reminder. |
| **SMS** | **Refused** | Costs per message, and sender-ID registration in the EU is a longer fight than this feature is worth. |
| **Buttons (`[Done]`, `[Stop]`)** | **Refused** | Unofficial clients have been unstable about button replies since WhatsApp changed the protocol. Typed keywords work on every device and cannot silently stop working. |

### The one decision that removes most of the risk

> **Web Push stays the default. WhatsApp is an extra.**

`usePushReminders` and `server/push.mjs` are unchanged and remain the channel a
user gets without asking. If the WhatsApp number dies, the reminders do not stop.
Everything else below is a consequence of taking that seriously.

## The two questions this had to answer

### 1. "Must the database hold the whole protocol, to the end?"

**No — and it must not.**

Web Push stores a queue of *already-rendered* notifications, capped at 60 days
(`PUSH_HORIZON_DAYS`) and 300 entries (`MAX_PUSH_QUEUE`). That is the right shape
there, because the app can work out every dose ahead of time and the server only
has to compare instants. It also means the queue goes stale: if the app is not
opened for 60 days, the reminders simply stop.

WhatsApp cannot work that way, because the entire point is that it keeps arriving
*without the app being opened*. So the **rule** travels instead:

```
{ times: ['08:00'], repeat: 'daily', startsOn: '2020-01-01',
  durationValue: 0, durationUnit: 'ongoing' }
```

One row. No end date, because there is no end to store. `server/recurrence.mjs`
works out the next instant, and after each send it works out the one after that.

| Plan | Rows stored | Rows, if enumerated "until the end" |
| --- | --- | --- |
| 4 months, twice daily | 1 | 240 |
| 4 months, daily | 1 | 120 |
| **Ongoing** | 1 | Impossible, and now not needed |

The 4-month case is answered as a special case of the general one. Nothing is
enumerated at all.

### 2. "The user must be able to stop it"

Two ways, both tested:

- **`STOP`**, typed into WhatsApp. Absolute, immediate, and honoured **even for a
  number with no reminder at all** — an opt-out must never depend on us holding a
  record. `UNSUBSCRIBE` and `CANCEL` mean the same thing.
- **The Settings panel.** "Turn off WhatsApp reminders" calls `DELETE` and the
  row is gone.

And the guarantee underneath both: the worker's own query joins the subscriber
and refuses to select a row whose number has opted out. A bug elsewhere cannot
undo a `STOP`. That is asserted in `server.test.mjs` by re-arming a stopped row by
hand and checking that nothing goes out.

## How a phone number gets linked to a plan

The hard part, and the reason the flow is "the user writes first".

```
App                        Server                      WhatsApp
 │                           │                            │
 │ PUT /api/wa/<hashKey>     │                            │
 │  { label, dose, rule,     │                            │
 │    timeZone }             │                            │
 ├──────────────────────────►│  stores the rule,           │
 │                           │  mints a code (K7M2QP)      │
 │◄──────────────────────────┤                            │
 │  { code, link, expires }  │                            │
 │                           │                            │
 │ shows a wa.me link — the user taps it and sends         │
 │ "START K7M2QP"            │                            │
 │                           │◄──── webhook ──────────────┤
 │                           │  ties phone ↔ plan          │
 │                           │  replies "Reminders are on" │
 │                           │──────────►────────────────►│
 │                           │                            │
 │                           │  every 30 s: due rows,      │
 │                           │  send, arm the next dose    │
 │                           │──────────►────────────────►│
```

**The phone number says _who_. The code says _which plan_.** Nothing is guessed
from the message text — which is exactly the question that was open.

Why the user writes first, rather than the server messaging a number from a form:

- **Opt-in is proven.** They composed and sent the message. There is no stronger
  evidence available, and no cold outbound message — the single fastest way to be
  reported.
- **The chat has history.** WhatsApp treats a conversation with a reply in it very
  differently from an unsolicited first message.
- **The link does the linking.** One tap, no typing.

### The sync code is not the pairing code

The sync code is a ~120-bit bearer token and the only credential the sync API
has. `server/server.mjs` says plainly that anyone holding it can read and write
that record. **It must never travel through WhatsApp.** So the pairing code is a
separate, short, single-purpose thing:

- six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — the same alphabet
  `src/lib/sync.ts` already uses, chosen so `I`, `O`, `0` and `1` cannot be
  misread off a screen;
- **single use**, expiring after 7 days while unclaimed (`PAIRING_CODE_TTL_MS`);
- claimable by exactly one number. A second number trying the same code gets the
  same answer as a code that never existed — saying which would turn the webhook
  into a way to probe for other people's codes.

### The link has to survive a reload

The `link` was originally only ever produced by the `PUT` that created the
reminder. Everything else — the read-back, the health check, the panel after a
refresh — treated it as state that lived in the open tab.

That is fine until the one case where it is not: a reminder that was created and
then *not* claimed, because the user closed the app, or lost the tab, or came
back the next day. On reload the app had a stored reminder and no link, so the
panel offered nothing to tap and no button that would have helped. The only way
out was to turn the reminder off and start again — a dead end that looks exactly
like a bug.

So `GET /api/wa/<key>` now rebuilds the link from the stored code on every read,
and the app takes it from whichever source has it. It is **derived, not
remembered**, so it cannot go stale.

### The panel shows the work as steps, because it is steps

The first version printed a paragraph, a link, a fallback sentence, a risk
warning and up to two buttons, in an order that matched nothing the user had to
do — and it showed the tap-to-start link in the `ready` state, before any
reminder existed. "Make a sync code, then send a code to a number, then wait to
be confirmed" was left for the reader to assemble.

It is now three numbered steps with exactly one of them active:

1. **Your plan** — named, with its dose and times in words ("Every day at 08:00").
2. **Send the first message** — the button, then the code and the number for a
   phone that will not open the link.
3. **Confirmation** — waiting, then connected.

Two details worth keeping: everything a user could have to work out is a *state*
rather than a sentence, so a missing sync code disables the setup button and says
which thing is missing instead of offering a button that does nothing; and the
number is shown with a `+`, because the server stores bare digits for `wa.me` and
`16728899397` on screen reads as a typo.


Parsed case-insensitively, tolerating a trailing `.` `,` `;` `!`:

| Sent | Meaning |
| --- | --- |
| `STOP`, `UNSUBSCRIBE`, `CANCEL` | Stop **every** plan on this number |
| `PAUSE`, `HOLD` | Pause every plan that is not already stopped |
| `RESUME`, `CONTINUE` | Start them all again, and clear the opt-out |
| `STATUS`, `INFO` | A numbered list of what is on |
| `HELP`, `?` | The list of commands |
| `08:00`, `8:00`, `8.30`, `2030`, `7`, `7am`, `7PM` | Change the time. With several plans on, asks which |
| `2 20:00`, `TIME 2 20:00` | Change the time of plan 2 |
| `START K7M2QP`, or just `K7M2QP` | Link this number to that plan |

**One subtlety, and it is the whole reason the parser has an order.** `STATUS` is
six characters long and every letter of it is in the code alphabet, so a parser
that looked for codes first would read "STATUS" as a pairing code and quietly try
to start a protocol. Keywords are therefore checked **before** codes, and
`whatsapp.test.mjs` asserts it.

## The wording rules

The message is a private planner note. It is deliberately not a health message.

```
Pepstool reminder

Morning protocol
Dose: 10 units
Planned for 08:00

Reply STOP to stop these messages, PAUSE to pause, STATUS for what is on.
```

- **No medical claim.** No condition, no benefit, no advice. "Your planned time",
  never "take your medication". A test greps the rendered text for the words that
  would cross that line.
- **No link in the reminder.** One domain at most, and only in a reply the user
  asked for.
- **Every actionable message says how to stop.**

## Not getting the number banned

The number is the whole asset, and the ways to lose it are well enough known to
design against. All of this is in the code, not in a runbook:

| Risk | What the code does |
| --- | --- |
| **A fixed timestamp is a signature** | Every send is nudged by up to 45 s (`withJitter`). The ceiling is deliberately under a minute, so the jittered instant still falls inside the dose's own minute and can never change *which* dose it is. |
| **A burst leaves together** | Sends inside one tick are spaced 3 s apart plus jitter (`spacingDelay`). |
| **A backlog becomes a flood** | At most 10 sends per tick (`MAX_SEND_PER_TICK`). |
| **Retrying a dead number forever** | A failed send waits 2 minutes and retries; after 5 consecutive failures the reminder is parked at `status = 'error'` instead of hammering. |
| **Our own replies trigger the bot** | `extractInbound` drops `fromMe`. Without it, every reply comes back as an inbound message and the bot answers itself forever. |
| **A group drives somebody's schedule** | `@g.us` and `status@broadcast` are dropped before anything else looks at the message. |
| **A fake `STOP` for someone else** | The webhook needs its own secret in **both** the path and the `apikey` header. |
| **A cold outbound message** | There is none. The user writes first, always. |

Two things are *not* code and must be done by hand when the number is new:

1. **Warm it up.** Days 1–7: a handful of messages a day, from a real phone, with
   real replies. Ramp over two to three weeks. Never start at twenty a day.
2. **Use a dedicated, burnable number.** A number whose loss is survivable. Never
   the owner's personal SIM.

## The webhook secret, and why the CORS guard is not enough

`isOriginAllowed` in `server/guard.mjs` returns `true` for a request with **no**
`Origin` header. That is correct for its job — it is the app's own same-origin
fetch, a `curl`, a health check. But Evolution sends no `Origin` either, so the
CORS guard gives a webhook **nothing at all**.

So the webhook carries its own secret, in the **path**:

```
POST /api/wa/webhook/<secret>       ← 256 random bits, and the credential
```

An `apikey` header is accepted as well but is **optional**, because Evolution
sends none by default — see *What running it actually taught us* for how that was
discovered, and why it mattered. If a deployment does configure one on the
instance webhook, it is sent and it must match.

Compared with `timingSafeEqual`, so the comparison itself cannot be measured. It
also gets its **own** rate limit (60 per window, `WHATSAPP_WEBHOOK_RATE_LIMIT`),
so a flood at the app can never starve the webhook, or the other way round. And a
refusal always says *why* in the log: a silent 403 here is a stopped channel that
looks like a healthy one, which is precisely the failure this whole document
keeps trying to avoid.

Recommended deployment: keep the webhook off the public internet entirely. Both
compose files declare one shared network (`pepstool-whatsapp`), so Evolution can
reach it by service name and nothing extra has to be exposed:

```
WEBHOOK_URL=http://sync:8787/api/wa/webhook/<the long secret>
```

## Files

| File | What it is |
| --- | --- |
| `server/recurrence.mjs` | **Pure.** When the next dose falls, plus wall clock ↔ absolute instant per timezone. The server's mirror of `src/lib/schedule.ts`. |
| `server/recurrence.test.mjs` | Unit tests, **plus an agreement test**: it imports the TypeScript original and asserts both agree across every cadence. |
| `server/whatsapp.mjs` | **Pure.** Intents, pairing codes, message rendering, and the worker that delivers them. Store and sender are injected. |
| `server/whatsapp.test.mjs` | The parser, the wording rules, and every worker path including failure, parking and a down link. |
| `server/messages.mjs` | **Pure.** Every word the server says, in `en`/`sk`/`es`. Its own table, because the app's dictionaries are TypeScript. |
| `server/messages.test.mjs` | Every language has every key; no link in a reminder; no medical claim; the plan lists number correctly. |
| `server/evolution.mjs` | **The only file that talks to Evolution.** `fetch` is injected, so every path is tested without a socket. |
| `server/evolution.test.mjs` | Send, failure, and the webhook reader. |
| `server/server.mjs` | The tables, the four routes, and the worker's one query. |
| `docker-compose.whatsapp.yml` | Evolution + Postgres + Redis, all bound to loopback. |
| `src/lib/whatsapp.ts` | The browser seam, same shape as `lib/push.ts`. Also `formatWhatsappNumber`, the one place digits become a `+` number. |
| `src/hooks/useWhatsAppReminders.ts` | Keeps the plan on screen and the stored rule in step, and hands the panel a link that survives a reload. |
| `src/components/RemindersPanel.tsx` | The row in Settings, with the WhatsApp flow as three steps. |
| `src/components/RemindersPanel.test.tsx` | Every step state, plus the two things that used to be wrong: a link shown before one existed, and no link after a reload. |
| `scripts/whatsapp-link.py` | Links the instance as a companion device from the terminal, keeping the code or QR on screen until it takes. |

### Two implementations of the same maths

The one real risk this creates, and how it is handled. The server cannot import
`src/lib/schedule.ts`: it is TypeScript, the server is plain `.mjs`, and the
server is deliberately built from Node's built-ins with no build step. So the
maths exists twice.

Two copies of date arithmetic is a genuine hazard, so it is not left to trust.
`server/recurrence.test.mjs` imports **both** and asserts they agree:

```js
import { nextDose } from './recurrence.mjs';
import { nextDose as tsNextDose } from '../src/lib/schedule.ts';

expect(nextDose(schedule, date, time)).toEqual(tsNextDose(schedule, date, time));
```

Twelve schedules — daily, four-times-daily, named weekdays, every 2nd/3rd/7th day,
weeks, months, ongoing, and plans that ended years ago — against 210 dates and six
times of day. **15,120 comparisons**, and it fails loudly if the app's rules ever
change.

The alternative was compiling the TypeScript for the server, which adds a build
step to a service that currently has none. Two routes that must agree is the
shape this project already uses elsewhere.

## Getting it running

```bash
cd /var/www/pepcalculator

# 1. The Evolution stack. Secrets are required, so it fails loudly without them.
cp .env.whatsapp.example .env
openssl rand -hex 32          # → WHATSAPP_API_KEY
openssl rand -hex 32          # → POSTGRES_PASSWORD
openssl rand -hex 32          # → WHATSAPP_WEBHOOK_SECRET, and the same value
                              #   goes into WEBHOOK_URL's last path segment
docker compose -f docker-compose.whatsapp.yml up -d

# 2. The sync server, with WhatsApp switched on.
#    WHATSAPP_URL=http://evolution:8080       (the shared network, not localhost)
#    WHATSAPP_API_KEY / WHATSAPP_INSTANCE / WHATSAPP_WEBHOOK_SECRET
#    WHATSAPP_NUMBER=421900000000             (digits only)
docker compose up -d

# 3. The instance, then link it. Scan the QR with the phone that will send.
curl -H "apikey: $WHATSAPP_API_KEY" -X POST \
  http://127.0.0.1:8080/instance/create \
  -H 'Content-Type: application/json' \
  -d '{"instanceName":"pepstool","qrcode":true,"integration":"WHATSAPP-BAILEYS"}'
# → GET /instance/connect/pepstool for the QR, and check the instance's own /docs
```

The startup log says which of these are missing, because a reminder channel that
is silently off is worse than one that is visibly off:

```
  push:           off — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (npm run vapid)
  whatsapp:       off — set WHATSAPP_URL, WHATSAPP_API_KEY and WHATSAPP_INSTANCE
```

and if the secret is missing while sending is on:

```
  whatsapp:       sending on, but WHATSAPP_WEBHOOK_SECRET is unset — the webhook is unauthenticated. Set it before exposing this server.
```

## What running it actually taught us

Four things were wrong in the plan, and every one of them would have failed in a
way that looked like success. All four were found by starting the stack and
reading what really happened, not by reading documentation.

### 1. The image did not exist

`atendai/evolution-api:v2.1.1` — the name in the original plan, and in most
tutorials — is not on Docker Hub. It answers `object not found`; the pull fails.
The project moved to **`evoapicloud/evolution-api`**. Pinned to **`v2.3.7`**, the
newest stable — `latest` currently points at a `2.4.0` release candidate, and a
protocol change should not arrive unannounced.

### 2. The webhook secret was required in a header Evolution never sends

The design said the webhook must present its secret in **both** the path and an
`apikey` header. It does not: Evolution's webhook is a plain `axios` POST
carrying only `content-type`, a `user-agent` and the body. Verified by pointing
the webhook at a logging container and reading the raw request.

So every real webhook was refused with **403** — and from the outside everything
looked healthy. The app was fine, `/api/health` was fine, the worker was fine.
Nothing said the channel was dead. That is the same failure mode the
`connection.update` work existed to prevent, wearing a different hat.

What the route is actually protected by now:

| | |
| --- | --- |
| **The path secret** | 256 random bits. Required. Cannot be found by probing. |
| **An `apikey` header** | *Optional.* Evolution sends none by default. If a deployment sets one on the instance webhook, it is sent — and then it must match, or the request is refused. |
| **A refusal** | Always logs *why*, because a silent 403 here is a stopped channel that looks like a working one. |

### 3. The Docker image carried a fixed list of modules

`Dockerfile` copied `guard.mjs push.mjs webpush.mjs server.mjs` by name. Adding
`recurrence.mjs`, `whatsapp.mjs`, `evolution.mjs` and `messages.mjs` broke the
container with `ERR_MODULE_NOT_FOUND` on start — the tests were green, because
nothing tested the image. It is `COPY server/*.mjs ./` now, with the tests
excluded by `.dockerignore`: a glob cannot be forgotten.

### 4. The startup banner crashed the process

The `if (isMain)` block called `readConnection()`, which only exists inside the
`createSyncServer` closure. It printed "listening on…" and *then* threw
`ReferenceError`, killing the process. Every test passed, because every test
calls `createSyncServer()` directly and never executes that block.

Both of the last two have the same shape: **the thing that only runs in
production was the only thing not tested.** There is now a test that spawns
`node server/server.mjs` for real, waits for the banner, and checks the process
is still alive.

## What has not been tested

- **No message has been sent through it yet.** The instance exists, the pairing
  code has been issued, and the webhook is confirmed working end to end — a real
  `connection.update` from Evolution reached the sync server and was recorded
  (`{"state":"connecting"}` in `/api/health`). What is left is the user entering
  the code on the phone, and then one real reminder.
- **`/message/sendText` is confirmed from the image's own code and its route
  table, but not yet exercised against live WhatsApp.** The first real send is
  what proves it.
- **The warm-up has not happened.** Days 1–7: a few messages a day from a real
  phone, ramping over two to three weeks. It is calendar time, not code.
- **A real ban has not been survived**, obviously. The mitigations are design
  decisions, not guarantees.
- **One instance, one number.** Nothing here has been run with two linked
  numbers, or with a reminder that has been through a full week of sends.

### Known gaps

| Gap | Why it is left |
| --- | --- |
| **The Evolution image tag is pinned but unverified** | See *What has not been tested*. |
| **The warm-up has not happened** | Calendar time, not code. |
| **No "last dose in the vial" nudge** | Considered and not built. The supply outlook already says it in the app, and it is the kind of message that reads as marketing. |

Three things used to be on this list. They are built now, and they are described
below rather than removed, because each one taught something worth keeping.

## The three things that were missing, and what they cost

### 1. The server spoke only English

The app is `en`/`sk`/`es`. A Slovak user got a Slovak plan name inside an English
frame — *"Reply STOP to stop these messages"* on a plan called *Ranný protokol*.

The app now sends `lang` with the plan, the reminder row stores it, and the
server answers in whatever that row says. `server/messages.mjs` holds the
fifteen messages in all three languages; a test asserts that every language has
every key the English one has, so a missing translation cannot reach production
as a blank message.

**Why not import the app's dictionaries?** They are ~30 kB each and TypeScript,
which the server cannot load — the same wall as `schedule.ts`. It needs fifteen
strings, not six hundred.

### 2. One plan per number

A second `START` used to replace the first. That was defensible — it kept `STOP`
unambiguous — but it is not what a user with a morning and an evening peptide
expects, and "you cannot have two" is not an answer.

Now a number may hold up to **five** plans (`MAX_PLANS`, a ceiling because every
plan is another message to the same person). The commands differ in scope, and
that is the whole design:

| Command | Scope |
| --- | --- |
| `STOP`, `PAUSE`, `RESUME` | **Every** plan on the number. Someone who says STOP does not mean "one of them" |
| `STATUS` | A numbered list of everything that is on |
| `08:00` with **one** plan | Changes it |
| `08:00` with **several** | *"Which one?"* — with the numbered list. Guessing would move the wrong plan's clock |
| `2 09:30` or `TIME 2 09:30` | Changes plan 2 |

Numbering is a real hazard here, so it is pinned down: a **stopped** plan takes
no number, and the numbering is identical in `STATUS` and in *"which one?"* — so
"2" always means the second plan the user just read. The list is `ORDER BY
created_at, key`, so it cannot renumber between two messages.

**This needed a database migration**, and the old schema would have made it fail
silently: `reminder_phone` was a `UNIQUE` index, so a second plan on one number
would have been refused by SQLite. `CREATE INDEX IF NOT EXISTS` would *not* have
fixed it — the name was already taken. The server now drops it by name on
startup, and adds the `lang` column if it is missing. There is a test that builds
a database in the **old** shape and asserts two plans link successfully.

### 3. The link itself was never read — and a bug hid behind it

`connection.update` was enabled in Evolution and ignored by the server.

**Writing the test for it found a real bug.** The worker parked a reminder after
five consecutive failures *whatever the reason*. A ten-minute gateway outage is
twenty ticks, which is five failures — so a brief outage would have switched off
every reminder for every user, permanently, from a temporary problem. Nobody
would have known why.

Three things changed:

1. **Failures are classified.** A **4xx** means this number is wrong and will be
   wrong again in two minutes — park it. Anything else (5xx, a timeout, a
   refused connection) is the gateway being unavailable, and is retried.
2. **A link known to be down skips the tick entirely** (`canSend`), so an outage
   charges nobody a failure. The armed times are untouched, so nothing is lost by
   waiting.
3. **The state is stored and answered from `/api/health`:**

   ```json
   {"ok":true,"whatsapp":{"state":"close","since":"…","reason":"401","sending":false}}
   ```

   This is the whole point. *"Nobody has a dose due"* and *"the channel is dead"*
   look identical from the outside, and a monitor watching only `{"ok":true}`
   cannot tell them apart.

And it shouts. On every change away from `open`, the log gets:

```
whatsapp link close (reason 401) — NO REMINDERS WILL BE SENT WHILE THE LINK IS
DOWN. Re-link the instance and scan the QR code.
```

`ALERT_WEBHOOK_URL` is the optional way to send that somewhere a human sees it.
It is empty by default, and honestly: the alert is *about* WhatsApp being down,
so it cannot go over WhatsApp, and the server has no destination it can invent
for itself. Without it, the health check and the log are the signal — which is
still infinitely better than nothing, and was the previous state.

### 4. The reminder did not follow a change to the plan

Found by the user, and the most serious of the four.

The app uploaded a plan once — when the user pressed "Remind me on WhatsApp" —
and then only ever **read** back the status. So this sequence was broken:

> Link WhatsApp. Later, change the time from 08:00 to 20:00 in the app.
> **The server keeps sending at 08:00, for ever, and nothing says so.**

The same for a changed dose: the message would keep quoting the old one.

**The fix has two halves.**

1. **The server now reports what it is actually working from.** `GET /api/wa/:key`
   returns each reminder's `rule` and `timeZone`, so the app can compare instead
   of guessing.
2. **The app pushes the plan whenever it has really changed** — and only then.
   `reminderIsStale` compares the plan on screen with the stored rule using one
   canonical `planSignature`, and an upload carries the **same code**, so the
   `wa.me` link the user already has keeps working.

**Why "only then" matters.** Uploading on every open would be simpler, and wrong:
it would silently undo a time the user had set by typing `09:30` into WhatsApp.
So the app compares the plan against *what it last pushed*, not against the
server. If the plan has not changed since, nothing is sent — a change made in
WhatsApp survives opening the app. If the user edits the plan, that edit wins,
because that is what they just did.

**And a real failure is still covered.** If the very first push fails — the phone
went offline mid-edit — the server still holds the old rule. On the next open the
plan no longer matches what is stored, so it is pushed again. The comparison is
against the server's own rule, not a local flag, so drift cannot hide.

**Why not a cron job on the server re-deriving the plan?** Because it would have
to parse the synced vials payload, which `server.mjs` deliberately treats as an
opaque blob, and because it would fight the WhatsApp-side edits — every tick
would undo a `2 09:30`. The app is where a protocol is edited, and the app is
open at that moment, so pushing from there is both simpler and more correct.






