/**
 * PepCalculator sync server — zero dependencies (Node's built-in http + sqlite).
 *
 * Stores an opaque JSON blob per user, keyed by the SHA-256 hash of their sync
 * code. The server never sees the code itself, only its hash.
 *
 *   GET  /api/health          -> { ok: true }
 *   GET  /api/sync/:key       -> { payload, updatedAt } | 404
 *   PUT  /api/sync/:key       -> { updatedAt }        body: { payload: string }
 *   GET  /api/push/pubkey     -> { publicKey }        (the VAPID public key)
 *   PUT  /api/push/:key       -> { scheduled, updatedAt }  body: { subscription, queue }
 *   DELETE /api/push/:key     -> { ok: true }
 *   PUT  /api/wa/:key         -> { code, link, expiresAt } body: { code?, label, dose, rule, timeZone }
 *   GET  /api/wa/:key         -> { reminders: [...] }
 *   DELETE /api/wa/:key       -> { ok: true }
 *   POST /api/wa/webhook/:secret -> the Evolution webhook (its own secret, see below)
 *
 * Run:    npm run server           (listens on 8787 by default)
 * Config: PORT, DB_PATH, ALLOWED_ORIGIN, MAX_BODY_BYTES, RATE_LIMIT,
 *         RATE_WINDOW_MS, TRUST_PROXY, LOG_REQUESTS, VAPID_*, PUSH_INTERVAL_MS,
 *         WHATSAPP_*, MANAGE_URL
 *
 * Hardening (roadmap item 2), all of it decided in `guard.mjs` and unit-tested
 * there: `ALLOWED_ORIGIN` may be a list and a caller from anywhere else gets a
 * 403 rather than a CORS-less response nobody can debug; a per-IP sliding-window
 * **rate limit** answers 429 with `Retry-After`; one **request log line** per call
 * with the sync key shortened to 8 characters, so a log identifies a record
 * without being usable as a credential; and `no-store` plus request timeouts.
 *
 * WhatsApp reminders (see `PROPOSAL-whatsapp-reminders.md`) reuse the same
 * tables file and the same key convention, with one deliberate difference: the
 * **rule** travels instead of the rendered queue. Web Push can ship finished
 * text because the app is what produces it; a WhatsApp reminder has to keep
 * arriving when the app has not been opened for weeks, so the server stores
 * "every day at 08:00" and works the next dose out itself (`recurrence.mjs`).
 * That is what makes an *ongoing* plan possible — nothing is stored "until the
 * end", because there is no end to store.
 *
 * The `/api/wa/webhook/:secret` route is the one endpoint here that carries its
 * **own** secret, for a reason worth stating plainly: `isOriginAllowed` accepts
 * a request with no `Origin` header, and Evolution sends none, so the CORS guard
 * gives a webhook nothing at all. Without that secret, anyone who learned the
 * path could fake a `STOP` for any number.
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
import { createPushScheduler, isValidSubscription, normalizeQueue } from './push.mjs';
import { createPushSender, isPushConfigured } from './webpush.mjs';
import {
  createWhatsAppSender,
  extractConnectionUpdate,
  extractInbound,
  isConnectionOpen,
  isWhatsAppConfigured,
  secretMatches,
} from './evolution.mjs';
import { isValidTimeZone, sanitizeRule } from './recurrence.mjs';
import { DEFAULT_LANGUAGE, localDay, resolveLanguage } from './messages.mjs';
import {
  MAX_DOSE_LENGTH,
  MAX_INBOUND_LENGTH,
  MAX_LABEL_LENGTH,
  PAIRING_CODE_TTL_MS,
  applyIntent,
  armAt,
  buildPairingLink,
  cleanField,
  createWhatsAppWorker,
  generatePairingCode,
  isPairingCode,
  localClock,
  sanitizeDoses,
  normalizePairingCode,
  parseIntent,
  say,
} from './whatsapp.mjs';

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
    /** Web Push (VAPID). Sending stays off until both keys are set. */
    vapidPublicKey: env.VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: env.VAPID_PRIVATE_KEY ?? '',
    vapidSubject: env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
    /** How often the scheduler checks for a due dose. */
    pushIntervalMs: Number(env.PUSH_INTERVAL_MS ?? 30_000),
    /** WhatsApp (Evolution API). Sending stays off until all three are set. */
    whatsappUrl: env.WHATSAPP_URL ?? '',
    whatsappApiKey: env.WHATSAPP_API_KEY ?? '',
    whatsappInstance: env.WHATSAPP_INSTANCE ?? '',
    /**
     * Evolution's v1 and v2 have used different paths. Override this rather than
     * trusting any default, including this one.
     */
    whatsappSendPath: env.WHATSAPP_SEND_PATH ?? '/message/sendText/{instance}',
    /**
     * The secret on the webhook path **and** in the `apikey` header. Both must
     * match. Without it the webhook is unauthenticated — see the note at the top.
     */
    whatsappSecret: env.WHATSAPP_WEBHOOK_SECRET ?? '',
    /** The public number behind the `wa.me` link. No `+`, no spaces. */
    whatsappNumber: env.WHATSAPP_NUMBER ?? '',
    whatsappIntervalMs: Number(env.WHATSAPP_INTERVAL_MS ?? 30_000),
    whatsappTimeoutMs: Number(env.WHATSAPP_TIMEOUT_MS ?? 15_000),
    /** Requests per address per window on the webhook. 0 disables the limit. */
    whatsappWebhookRateLimit: Number(env.WHATSAPP_WEBHOOK_RATE_LIMIT ?? 60),
    /** Where "your plans" points, in the help text. The app's own URL. */
    manageUrl: env.MANAGE_URL ?? '',
    /**
     * Where a dropped WhatsApp link is announced, if anywhere.
     *
     * Empty by default, and then the server logs the warning and carries on.
     * There is no destination it can invent: the alert is *about* WhatsApp being
     * down, so it cannot be sent over WhatsApp.
     */
    alertWebhookUrl: env.ALERT_WEBHOOK_URL ?? '',
  };
}

function applyCors(res, origin) {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,DELETE,OPTIONS');
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
    CREATE TABLE IF NOT EXISTS push (
      key          TEXT PRIMARY KEY,
      subscription TEXT NOT NULL,
      queue        TEXT NOT NULL,
      failures     INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subscriber (
      phone        TEXT PRIMARY KEY,
      name         TEXT NOT NULL DEFAULT '',
      opted_out_at TEXT,
      created_at   TEXT NOT NULL,
      updated_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reminder (
      key         TEXT PRIMARY KEY,
      phone       TEXT REFERENCES subscriber(phone),
      owner       TEXT NOT NULL,
      label       TEXT NOT NULL,
      dose        TEXT NOT NULL,
      /*
       * The app's own words for how much to draw — "draw to 20 units". Stored
       * exactly as sent: this server has no idea what is in the vial, and a dose
       * line is the one place it must never invent a number.
       */
      draw        TEXT NOT NULL DEFAULT '',
      /*
       * The name of the person this vial is for, as the app holds it. Empty for
       * the device's own owner. Only used to divide a digest by person — the
       * server never needs to know who anybody is.
       */
      person      TEXT NOT NULL DEFAULT '',
      /*
       * The app's own stable id for this vial, so re-pushing the same vial keeps
       * its pairing code instead of minting a new one. Without it, editing a
       * plan would leave a trail of dead rows and a link that stops working.
       */
      slot        TEXT NOT NULL DEFAULT '',
      rule        TEXT NOT NULL,
      /*
       * The dose timeline — [{ from, dose, draw }] — so a step-up plan quotes
       * the right amount on the right day. Empty for a reminder written before
       * timelines existed, and then the single dose above is used instead.
       */
      doses       TEXT NOT NULL DEFAULT '[]',
      time_zone   TEXT NOT NULL,
      lang        TEXT NOT NULL DEFAULT 'en',
      status      TEXT NOT NULL,
      next_run_at TEXT,
      expires_at  TEXT,
      failures    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS reminder_due ON reminder (status, next_run_at);
    CREATE INDEX IF NOT EXISTS reminder_owner ON reminder (owner);
    /*
     * One number may hold several plans, so this index is deliberately **not**
     * unique any more. The old unique index has to be dropped by name: SQLite
     * would otherwise see the name already in use and quietly leave the
     * uniqueness in place.
     */
    DROP INDEX IF EXISTS reminder_phone;
    CREATE INDEX IF NOT EXISTS reminder_phone_idx ON reminder (phone);
    /*
     * The last state Evolution reported for its WhatsApp link. One row, one
     * instance — this is the only signal that the whole channel is down, and it
     * is what the health endpoint answers from.
     */
    CREATE TABLE IF NOT EXISTS instance_state (
      instance   TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      reason     TEXT,
      changed_at TEXT NOT NULL,
      since_at   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      phone      TEXT NOT NULL,
      key        TEXT,
      body       TEXT NOT NULL,
      ok         INTEGER NOT NULL,
      error      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inbound (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT,
      phone      TEXT NOT NULL,
      body       TEXT NOT NULL,
      intent     TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  /*
   * Migrations for a database that already existed.
   *
   * `CREATE TABLE IF NOT EXISTS` above does nothing to a table that is already
   * there, so a column added since then has to be applied separately. SQLite has
   * no `ADD COLUMN IF NOT EXISTS`, hence reading the columns back first.
   */
  const reminderColumns = db
    .prepare('PRAGMA table_info(reminder)')
    .all()
    .map((row) => row.name);
  if (!reminderColumns.includes('lang')) {
    db.exec("ALTER TABLE reminder ADD COLUMN lang TEXT NOT NULL DEFAULT 'en'");
  }
  if (!reminderColumns.includes('draw')) {
    db.exec("ALTER TABLE reminder ADD COLUMN draw TEXT NOT NULL DEFAULT ''");
  }
  if (!reminderColumns.includes('person')) {
    db.exec("ALTER TABLE reminder ADD COLUMN person TEXT NOT NULL DEFAULT ''");
  }
  if (!reminderColumns.includes('slot')) {
    db.exec("ALTER TABLE reminder ADD COLUMN slot TEXT NOT NULL DEFAULT ''");
  }
  if (!reminderColumns.includes('doses')) {
    db.exec("ALTER TABLE reminder ADD COLUMN doses TEXT NOT NULL DEFAULT '[]'");
  }

  const selectStmt = db.prepare('SELECT payload, updated_at FROM sync WHERE key = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO sync (key, payload, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
  `);

  const pushListStmt = db.prepare('SELECT key, subscription, queue, failures FROM push');
  const pushUpsertStmt = db.prepare(`
    INSERT INTO push (key, subscription, queue, failures, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      subscription = excluded.subscription,
      queue        = excluded.queue,
      updated_at   = excluded.updated_at
  `);
  const pushQueueStmt = db.prepare(
    'UPDATE push SET queue = ?, failures = ?, updated_at = ? WHERE key = ?',
  );
  const pushDeleteStmt = db.prepare('DELETE FROM push WHERE key = ?');

  /* ---------- WhatsApp: statements ---------- */

  /**
   * The columns a patch is allowed to touch, and the name each one has in the
   * table. A patch is built from this list rather than from the caller's keys,
   * so nothing a request body contains can reach the SQL.
   */
  const REMINDER_COLUMNS = {
    phone: 'phone',
    label: 'label',
    dose: 'dose',
    rule: 'rule',
    timeZone: 'time_zone',
    lang: 'lang',
    status: 'status',
    nextRunAtMs: 'next_run_at',
    expiresAt: 'expires_at',
    failures: 'failures',
  };

  /** One prepared statement per set of columns actually used, then reused. */
  const saveStatements = new Map();

  function reminderValue(field, value) {
    if (field === 'rule') return JSON.stringify(value);
    if (field === 'nextRunAtMs') {
      return value === null || value === undefined ? null : new Date(Number(value)).toISOString();
    }
    return value;
  }

  /** Writes a patch onto one reminder. An empty patch writes nothing. */
  function saveReminder(key, patch) {
    const fields = Object.keys(patch ?? {}).filter((field) =>
      Object.prototype.hasOwnProperty.call(REMINDER_COLUMNS, field),
    );
    if (fields.length === 0) return;

    const signature = fields.join(',');
    let statement = saveStatements.get(signature);
    if (!statement) {
      const assignments = fields.map((field) => `${REMINDER_COLUMNS[field]} = ?`).join(', ');
      statement = db.prepare(`UPDATE reminder SET ${assignments}, updated_at = ? WHERE key = ?`);
      saveStatements.set(signature, statement);
    }

    const values = fields.map((field) => reminderValue(field, patch[field]));
    statement.run(...values, new Date().toISOString(), key);
  }

  /**
   * Creates a reminder, or updates the one a code already names.
   *
   * A conflict deliberately does **not** touch `phone` or `status`: the app
   * re-uploads after an edit, and that must not unlink a number that has already
   * paired.
   */
  const reminderUpsertStmt = db.prepare(`
    INSERT INTO reminder
      (key, phone, owner, label, dose, draw, person, slot, rule, doses, time_zone, lang, status, next_run_at, expires_at, failures, created_at, updated_at)
    VALUES
      (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, 0, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      owner      = excluded.owner,
      label      = excluded.label,
      dose       = excluded.dose,
      draw       = excluded.draw,
      person     = excluded.person,
      slot       = excluded.slot,
      rule       = excluded.rule,
      doses      = excluded.doses,
      time_zone  = excluded.time_zone,
      lang       = excluded.lang,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `);

  const reminderByKeyStmt = db.prepare('SELECT * FROM reminder WHERE key = ?');
  // Ordered, because a number may hold several plans and the STATUS list numbers
  // them: an order that shifted between messages would renumber a plan the user
  // had just been told to reply "2" for.
  const reminderByPhoneStmt = db.prepare(
    'SELECT * FROM reminder WHERE phone = ? ORDER BY created_at, key',
  );
  const reminderByOwnerStmt = db.prepare(
    'SELECT * FROM reminder WHERE owner = ? ORDER BY created_at, key',
  );
  /**
   * A vial the app has already pushed, found by the app's own id for it.
   *
   * `slot` is how a re-push stays the *same* reminder. The pairing code is the
   * row's primary key, so without this an edit would mint a fresh code and the
   * link the user is holding would quietly stop working.
   */
  const reminderBySlotStmt = db.prepare('SELECT * FROM reminder WHERE owner = ? AND slot = ?');
  /** Every vial this owner has pushed that no number has claimed yet. */
  const reminderUnclaimedByOwnerStmt = db.prepare(
    'SELECT * FROM reminder WHERE owner = ? AND phone IS NULL',
  );
  const reminderDeleteStmt = db.prepare('DELETE FROM reminder WHERE owner = ?');
  /** One vial's row, so removing a vial stops only that reminder. */
  const reminderDeleteSlotStmt = db.prepare('DELETE FROM reminder WHERE owner = ? AND slot = ?');
  const reminderClearPhoneStmt = db.prepare('UPDATE reminder SET phone = NULL WHERE phone = ?');

  /**
   * The one query the worker runs. One line, as promised — and indexed on
   * `(status, next_run_at)`, so it stays one line however many rows there are.
   *
   * The `subscriber` join is the opt-out guarantee: a number that has sent STOP
   * is never messaged again, whatever the reminder row happens to say.
   */
  const reminderDueStmt = db.prepare(`
    SELECT reminder.* FROM reminder
      LEFT JOIN subscriber ON subscriber.phone = reminder.phone
     WHERE reminder.status = 'active'
       AND reminder.next_run_at IS NOT NULL
       AND reminder.next_run_at <= ?
       AND subscriber.opted_out_at IS NULL
     ORDER BY reminder.next_run_at
  `);

  /**
   * Every plan a number holds, due today or not.
   *
   * The digest covers the whole day, and `reminderDueStmt` only ever returns the
   * minute that has just arrived — so the worker asks for the rest. The rows come
   * back unfiltered on purpose: which of them belong in today's list is a
   * question about dates, and the clock lives in the worker, not here.
   */
  const reminderForPhoneStmt = db.prepare('SELECT * FROM reminder WHERE phone = ?');

  const subscriberUpsertStmt = db.prepare(`
    INSERT INTO subscriber (phone, name, opted_out_at, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?)
    ON CONFLICT(phone) DO UPDATE SET
      name         = excluded.name,
      opted_out_at = NULL,
      updated_at   = excluded.updated_at
  `);
  const subscriberOptOutStmt = db.prepare(
    'UPDATE subscriber SET opted_out_at = ?, updated_at = ? WHERE phone = ?',
  );

  const outboxStmt = db.prepare(
    'INSERT INTO outbox (phone, key, body, ok, error, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  );
  const inboundStmt = db.prepare(
    'INSERT INTO inbound (message_id, phone, body, intent, created_at) VALUES (?, ?, ?, ?, ?)',
  );

  /**
   * Records what Evolution says about its own link.
   *
   * `since_at` only moves when the state itself changes, so "down since Tuesday
   * 09:14" survives the same event arriving forty more times.
   */
  const stateUpsertStmt = db.prepare(`
    INSERT INTO instance_state (instance, state, reason, changed_at, since_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instance) DO UPDATE SET
      state      = excluded.state,
      reason     = excluded.reason,
      changed_at = excluded.changed_at,
      since_at   = CASE WHEN instance_state.state = excluded.state
                        THEN instance_state.since_at
                        ELSE excluded.since_at END
  `);
  const stateGetStmt = db.prepare('SELECT * FROM instance_state WHERE instance = ?');

  /**
   * The scheduler's view of the push table. It parses JSON lazily and skips a
   * single corrupt row rather than letting one bad record break every push.
   */
  const pushStore = {
    list() {
      const rows = [];
      for (const row of pushListStmt.all()) {
        try {
          rows.push({
            key: row.key,
            subscription: JSON.parse(row.subscription),
            queue: JSON.parse(row.queue),
            failures: row.failures,
          });
        } catch {
          /* skip a corrupt row */
        }
      }
      return rows;
    },
    save(key, { queue, failures }) {
      pushQueueStmt.run(JSON.stringify(queue), failures, new Date().toISOString(), key);
    },
    remove(key) {
      pushDeleteStmt.run(key);
    },
  };

  /* ---------- WhatsApp: the store, the sender, and what a message means ---------- */

  /**
   * One `reminder` row, as the worker and the commands want it.
   *
   * A rule that will not parse becomes `null` rather than throwing: a corrupt
   * row is a reminder that cannot be armed, and that is a thing to stop, not a
   * thing to crash the scheduler over.
   */
  /** The stored dose timeline, or [] when it is missing or unreadable. */
  function parseDoses(raw) {
    try {
      return sanitizeDoses(JSON.parse(raw ?? '[]'));
    } catch {
      return [];
    }
  }

  function reminderRow(row) {
    if (!row) return null;
    let rule = null;
    try {
      rule = JSON.parse(row.rule);
    } catch {
      rule = null;
    }
    return {
      code: row.key,
      phone: row.phone ?? null,
      owner: row.owner,
      label: row.label,
      dose: row.dose,
      draw: row.draw ?? '',
      person: row.person ?? '',
      slot: row.slot ?? '',
      rule,
      doses: parseDoses(row.doses),
      timeZone: row.time_zone,
      lang: resolveLanguage(row.lang),
      status: row.status,
      nextRunAtMs: row.next_run_at ? Date.parse(row.next_run_at) : null,
      expiresAt: row.expires_at ?? null,
      failures: row.failures,
    };
  }

  const whatsappStore = {
    due(nowIso) {
      return reminderDueStmt.all(nowIso).map(reminderRow);
    },
    forPhone(phone) {
      return reminderForPhoneStmt.all(phone).map(reminderRow);
    },
    save(code, patch) {
      saveReminder(code, patch);
    },
  };

  /* ---------- the link itself ---------- */

  /**
   * The last state Evolution reported, or null before the first event.
   *
   * This is the only thing that can tell "nobody has a dose due" apart from
   * "the whole channel is dead", and from the outside those look identical.
   */
  function readConnection() {
    // `?? ''` because `createSyncServer(config)` is a public entry point and a
    // caller may legitimately have left the WhatsApp keys out entirely — the
    // tests do. SQLite cannot bind `undefined`.
    const row = stateGetStmt.get(String(config.whatsappInstance ?? ''));
    return row
      ? {
          instance: row.instance,
          state: row.state,
          reason: row.reason ?? null,
          changedAt: row.changed_at,
          sinceAt: row.since_at,
        }
      : null;
  }

  /**
   * Whether the worker may try to send.
   *
   * Before the first `connection.update` we assume **yes**. Refusing to send
   * until an event arrives that might never arrive would turn a silent warning
   * into a silent outage, which is the thing this whole mechanism exists to
   * prevent. Trying and failing is recoverable; not trying is not.
   */
  function linkIsUp() {
    const known = readConnection();
    return known === null || isConnectionOpen(known.state);
  }

  const rawSendText = createWhatsAppSender(config);

  /**
   * Sends, and writes the attempt to the outbox either way.
   *
   * The outbox is the only honest answer to "did that number actually get its
   * reminder?", and it is what a failed send is diagnosed from later. It records
   * the failure and then rethrows, so the worker still counts it.
   */
  async function sendTo(phone, text, key = null) {
    const at = new Date().toISOString();
    try {
      await rawSendText(phone, text);
      outboxStmt.run(phone, key, text, 1, '', at);
      return true;
    } catch (error) {
      const detail = String(error?.message ?? error).slice(0, 300);
      outboxStmt.run(phone, key, text, 0, detail, at);
      throw error;
    }
  }

  /** Remembers a number that wrote to us, which is also what clears an opt-out. */
  function rememberSubscriber(inbound) {
    const at = new Date().toISOString();
    subscriberUpsertStmt.run(inbound.phone, cleanField(inbound.pushName, MAX_LABEL_LENGTH), at, at);
  }

  /** Records a STOP on the number itself, so it survives the reminder being gone. */
  function markOptedOut(phone, nowMs) {
    const at = new Date(nowMs).toISOString();
    subscriberOptOutStmt.run(at, at, phone);
  }

  const limiter =
    config.rateLimit > 0
      ? createRateLimiter({ limit: config.rateLimit, windowMs: config.rateWindowMs })
      : null;

  /**
   * The webhook's own budget, tighter than the app's.
   *
   * Separate rather than shared, so a flood at the app can never starve the
   * webhook and a flood at the webhook can never starve the app — and a
   * machine-to-machine endpoint has no legitimate reason to be busy.
   */
  const webhookLimiter =
    config.whatsappWebhookRateLimit > 0
      ? createRateLimiter({
          limit: config.whatsappWebhookRateLimit,
          windowMs: config.rateWindowMs,
        })
      : null;
  // The clock that turns a stored queue into a delivered notification. It is
  // only started when the server is actually configured to send, so a test —
  // or a server without VAPID keys — never spins a timer.
  const scheduler = createPushScheduler({
    store: pushStore,
    send: createPushSender(config),
    intervalMs: config.pushIntervalMs,
    onError: (error) => {
      if (config.logRequests) console.warn(`push send failed: ${error?.message ?? error}`);
    },
  });
  if (isPushConfigured(config)) scheduler.start();

  /**
   * The clock that delivers WhatsApp reminders. Started only when the instance
   * is configured, so a test — or a server without credentials — never spins a
   * timer or opens a socket.
   */
  const whatsappWorker = createWhatsAppWorker({
    store: whatsappStore,
    send: (phone, text) => sendTo(phone, text),
    // A link we know is down means "skip", not "fail every subscriber".
    canSend: linkIsUp,
    intervalMs: config.whatsappIntervalMs,
    onError: (error) => {
      if (config.logRequests) console.warn(`whatsapp send failed: ${error?.message ?? error}`);
    },
  });
  if (isWhatsAppConfigured(config)) whatsappWorker.start();

  /**
   * Ties a phone number to a plan, when it sends `START <code>`.
   *
   * This is the whole answer to "how does the app know which protocol a message
   * belongs to": the phone number says *who*, and the code says *which plan*.
   * Nothing is guessed from the message text.
   */
  async function linkWithCode({ inbound, intent, nowMs }) {
    const row = reminderRow(reminderByKeyStmt.get(intent.code));
    // Expiry applies to a code nobody has claimed yet. Once a number is attached,
    // the code has done its job and the link must keep working.
    const expired =
      row !== null &&
      row.phone === null &&
      row.expiresAt !== null &&
      Date.parse(row.expiresAt) < nowMs;

    const mine = reminderByPhoneStmt.all(inbound.phone).map(reminderRow);
    // The plan's own language if the code is known, otherwise whatever this
    // number was last spoken to in, and English only as a last resort.
    const lang = resolveLanguage(row?.lang ?? mine[0]?.lang ?? DEFAULT_LANGUAGE);

    // Unknown, expired, and "already claimed by somebody else" all get the same
    // answer. Saying which would turn this endpoint into a way to probe for
    // other people's codes.
    if (row === null || expired || (row.phone !== null && row.phone !== inbound.phone)) {
      if (row !== null && expired) saveReminder(row.code, { status: 'stopped', nextRunAtMs: null });
      await sendTo(inbound.phone, say(lang, 'badCode'));
      return { handled: true, intent: 'start', linked: false };
    }

    if (row.rule === null) {
      await sendTo(inbound.phone, say(lang, 'badCode'));
      return { handled: true, intent: 'start', linked: false };
    }

    const alreadyMine = row.phone === inbound.phone;

    /*
     * No ceiling on how many vials a number holds.
     *
     * There used to be one, because every plan was another message to the same
     * person. That stopped being true when the digest arrived: one number gets
     * **one message a day**, whether it holds one vial or twenty. A limit here
     * would only ever mean silently leaving somebody's evening dose out.
     */
    const armed = armAt({ rule: row.rule, timeZone: row.timeZone, nowMs });
    rememberSubscriber(inbound);
    saveReminder(row.code, { ...armed, phone: inbound.phone, expiresAt: null, lang });

    /*
     * One opt-in for the whole device, not one per vial.
     *
     * The app pushes a row for every scheduled vial, and the code the user sent
     * names *them* — so every vial they pushed that is still unclaimed is
     * attached to this number too. Asking somebody to send a second code for
     * their second vial is how a feature gets abandoned half-set-up, and the
     * half that is missing is the one they would not notice.
     *
     * Each row keeps its own rule and arms its own next dose; only the phone is
     * shared.
     */
    for (const pending of reminderUnclaimedByOwnerStmt.all(row.owner)) {
      if (pending.key === row.code) continue;
      const other = reminderRow(pending);
      if (!other?.rule) continue;
      saveReminder(other.code, {
        ...armAt({ rule: other.rule, timeZone: other.timeZone, nowMs }),
        phone: inbound.phone,
        expiresAt: null,
        lang,
      });
    }

    if (armed.nextRunAtMs === null) {
      await sendTo(inbound.phone, say(lang, 'finished', { label: row.label }), row.code);
      return { handled: true, intent: 'start', linked: true };
    }

    /*
     * "today at 10:00", "tomorrow at 10:00", or "Friday 16 Oct at 10:00".
     *
     * The day is the whole point, and this is the message that proved it: sent
     * on a Wednesday at 12:34, the old text said "Next one at 10:00" with no day
     * at all, which reads as tomorrow morning. The dose was Friday.
     */
    const atMs = armed.nextRunAtMs;
    const when = `${localDay({ atMs, nowMs, timeZone: row.timeZone, lang })} at ${localClock(atMs, row.timeZone)}`;
    await sendTo(
      inbound.phone,
      alreadyMine
        ? say(lang, 'alreadyLinked', { label: row.label, time: when })
        : say(lang, 'linked', { label: row.label, dose: row.dose, draw: row.draw, time: when }),
      row.code,
    );
    return { handled: true, intent: 'start', linked: true };
  }

  /**
   * Tells somebody that the channel is down — if a destination was configured.
   *
   * The default is to log and nothing more, deliberately. A message *about* the
   * WhatsApp link being down cannot be sent over the WhatsApp link, so there is
   * no destination the server can invent for itself. `ALERT_WEBHOOK_URL` is the
   * way out: any endpoint the operator already watches (a chat-bot webhook, an
   * uptime service, a home automation hook).
   */
  async function alertOperator(message) {
    if (!config.alertWebhookUrl) return;
    try {
      await fetch(config.alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `Pepstool WhatsApp: ${message}` }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (error) {
      if (config.logRequests) console.warn(`whatsapp alert failed: ${error?.message ?? error}`);
    }
  }

  /**
   * A `connection.update` from Evolution: the state of the link itself.
   *
   * This is the event that would otherwise leave the whole feature dead in
   * silence, so it does three things a log line cannot: it stores the state for
   * `/api/health` to answer from, it stops the worker from charging failures to
   * every subscriber while the link is down, and it shouts.
   */
  async function handleConnection(update) {
    const known = readConnection();
    const changed = known === null || known.state !== update.state;
    const at = new Date().toISOString();

    stateUpsertStmt.run(
      config.whatsappInstance || update.instance,
      update.state,
      update.reason === null || update.reason === undefined ? null : String(update.reason),
      at,
      at,
    );

    if (!changed) return { handled: true, event: 'connection.update', state: update.state };

    const detail = update.reason ? ` (reason ${update.reason})` : '';
    if (isConnectionOpen(update.state)) {
      if (config.logRequests) {
        console.log(`whatsapp link open${detail} — reminders will go out again`);
      }
    } else {
      console.warn(
        `whatsapp link ${update.state}${detail} — NO REMINDERS WILL BE SENT WHILE THE LINK IS DOWN. ` +
          'Re-link the instance and scan the QR code.',
      );
      void alertOperator(`link ${update.state}${detail}`);
    }

    return { handled: true, event: 'connection.update', state: update.state };
  }

  /**
   * One inbound WhatsApp message: link, stop, resume, pause, retime, or answer.
   *
   * Awaited by the route before it answers, so the reply is sent and the result
   * is assertable. Evolution waits for one outbound call; against a local
   * instance that is milliseconds.
   */
  async function handleInbound(payload) {
    // A link-state event is not about a subscriber at all, so it is handled
    // before anything looks at a phone number.
    const connection = extractConnectionUpdate(payload);
    if (connection !== null) return handleConnection(connection);

    const nowMs = Date.now();
    const inbound = extractInbound(payload);
    if (inbound === null) return { handled: false, reason: 'ignored' };

    const intent = parseIntent(inbound.text);
    try {
      inboundStmt.run(
        inbound.messageId || null,
        inbound.phone,
        inbound.text.slice(0, MAX_INBOUND_LENGTH),
        intent.kind,
        new Date(nowMs).toISOString(),
      );
    } catch {
      /* a duplicate id is not worth failing the whole message over */
    }

    if (intent.kind === 'start') return linkWithCode({ inbound, intent, nowMs });

    const mine = reminderByPhoneStmt.all(inbound.phone).map(reminderRow);
    const lang = resolveLanguage(mine[0]?.lang ?? DEFAULT_LANGUAGE);

    if (mine.length === 0) {
      if (intent.kind === 'ignored') return { handled: false, reason: 'ignored' };
      rememberSubscriber(inbound);
      if (intent.kind === 'stop') {
        // An opt-out must never depend on us holding a record, so it is written
        // even for a number we have never seen before.
        markOptedOut(inbound.phone, nowMs);
        await sendTo(inbound.phone, say(lang, 'stopped'));
      } else {
        await sendTo(inbound.phone, say(lang, 'notLinked', { manageUrl: config.manageUrl }));
      }
      return { handled: true, intent: intent.kind, linked: false };
    }

    const { patches, reply } = applyIntent({
      reminders: mine,
      intent,
      nowMs,
      manageUrl: config.manageUrl,
    });
    if (reply === null) return { handled: false, reason: 'ignored' };

    if (intent.kind === 'stop') {
      rememberSubscriber(inbound);
      markOptedOut(inbound.phone, nowMs);
    } else if (intent.kind === 'resume') {
      // Writing again is itself a fresh opt-in, so the opt-out is cleared here.
      rememberSubscriber(inbound);
    }

    for (const { code, patch } of patches) saveReminder(code, patch);
    await sendTo(inbound.phone, reply, mine[0]?.code ?? null);
    return { handled: true, intent: intent.kind, linked: true };
  }

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

    // Charged per address, and only for the endpoints that touch the database.
    // Returns false (and has already answered 429) when the caller is over budget.
    const chargeRateLimit = () => {
      if (!limiter) return true;
      const verdict = limiter.check(who());
      if (!verdict.allowed) {
        res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
        send(429, { error: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds });
        return false;
      }
      res.setHeader('X-RateLimit-Remaining', String(verdict.remaining));
      return true;
    };

    /** The same, against the webhook's own budget. */
    const chargeWebhookLimit = () => {
      if (!webhookLimiter) return true;
      const verdict = webhookLimiter.check(who());
      if (!verdict.allowed) {
        res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
        send(429, { error: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds });
        return false;
      }
      return true;
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
      /*
       * The link's own state belongs in a health check, because "nobody has a
       * dose due" and "the channel is dead" look identical from the outside. A
       * monitor that only sees `{"ok":true}` cannot tell them apart, and the
       * second one is the whole failure mode this feature has to avoid.
       */
      const connection = isWhatsAppConfigured(config) ? readConnection() : null;
      send(200, {
        ok: true,
        whatsapp: isWhatsAppConfigured(config)
          ? {
              state: connection?.state ?? 'unknown',
              since: connection?.sinceAt ?? null,
              reason: connection?.reason ?? null,
              sending: linkIsUp(),
            }
          : null,
      });
      return;
    }

    if (rawPath === '/api/push/pubkey') {
      // The app reads this to subscribe; it is public by design, and the only
      // thing that proves who is asking is the sync key on the other routes.
      send(200, { publicKey: config.vapidPublicKey || null });
      return;
    }

    const pushMatch = rawPath.match(/^\/api\/push\/([^/]+)$/);
    if (pushMatch) {
      if (!chargeRateLimit()) return;

      const pushKey = pushMatch[1].toLowerCase();
      if (!KEY_PATTERN.test(pushKey)) {
        send(400, { error: 'invalid_key' });
        return;
      }

      if (req.method === 'PUT') {
        try {
          const parsed = JSON.parse(await readBody(req, config.maxBodyBytes));
          if (!isValidSubscription(parsed?.subscription)) {
            send(400, { error: 'invalid_subscription' });
            return;
          }
          // The queue is the client's own future doses, already rendered; the
          // server keeps only what is usable (see `normalizeQueue`).
          const queue = normalizeQueue(parsed?.queue);
          const updatedAt = new Date().toISOString();
          pushUpsertStmt.run(
            pushKey,
            JSON.stringify(parsed.subscription),
            JSON.stringify(queue),
            updatedAt,
            updatedAt,
          );
          send(200, { scheduled: queue.length, updatedAt });
        } catch (error) {
          const tooLarge = error instanceof Error && error.message === 'payload_too_large';
          send(tooLarge ? 413 : 400, { error: tooLarge ? 'payload_too_large' : 'invalid_json' });
        }
        return;
      }

      if (req.method === 'DELETE') {
        pushDeleteStmt.run(pushKey);
        send(200, { ok: true });
        return;
      }

      send(405, { error: 'method_not_allowed' });
      return;
    }

    /**
     * The inbound webhook from Evolution.
     *
     * It carries its own secret, in **both** the path and the `apikey` header,
     * because nothing else here protects it: `isOriginAllowed` waves through any
     * request with no `Origin` header, and Evolution sends none. Its own rate
     * limit too — a machine-to-machine endpoint has no legitimate flood.
     */
    const webhookMatch = rawPath.match(/^\/api\/wa\/webhook\/([^/]+)$/);
    if (webhookMatch) {
      if (req.method !== 'POST') {
        send(405, { error: 'method_not_allowed' });
        return;
      }

      const header = req.headers.apikey;
      const presented = Array.isArray(header) ? header[0] : header;

      /*
       * What this route is actually protected by, established by reading what
       * Evolution really sends rather than by assuming.
       *
       * Its webhook is a plain `axios` POST with `content-type` and a
       * `user-agent` — **no `apikey` header at all**. So a rule that demanded one
       * rejected every real webhook with a 403, and because the app still looked
       * healthy, nothing on the outside said so. That was the bug this comment
       * exists to stop coming back.
       *
       * So:
       *   - the **path secret** is the credential. 256 random bits, in a URL only
       *     the two services know, and it cannot be found by probing.
       *   - an `apikey` header is **optional**. Evolution sends none unless the
       *     instance webhook was configured with `headers`, and then it must
       *     match (either our secret or the gateway's own key). If it is present
       *     and wrong, that is a real signal and the request is refused.
       *
       * A rejection always logs *why*. A silent 403 here is a stopped channel
       * that looks like a healthy one.
       */
      const pathOk = secretMatches(webhookMatch[1], config.whatsappSecret);
      const headerOk =
        presented === undefined || presented === ''
          ? true
          : secretMatches(presented, config.whatsappApiKey) ||
            secretMatches(presented, config.whatsappSecret);

      if (!config.whatsappSecret || !pathOk || !headerOk) {
        if (config.logRequests) {
          const why = !config.whatsappSecret
            ? 'WHATSAPP_WEBHOOK_SECRET is not set'
            : !pathOk
              ? 'the path secret does not match'
              : 'the apikey header is present but wrong';
          console.warn(`whatsapp webhook refused: ${why}`);
        }
        send(403, { error: 'forbidden' });
        return;
      }

      if (!chargeWebhookLimit()) return;

      let payload;
      try {
        payload = JSON.parse(await readBody(req, config.maxBodyBytes));
      } catch (error) {
        const tooLarge = error instanceof Error && error.message === 'payload_too_large';
        send(tooLarge ? 413 : 400, { error: tooLarge ? 'payload_too_large' : 'invalid_json' });
        return;
      }

      try {
        const result = await handleInbound(payload);
        send(200, { ok: true, ...result });
      } catch (error) {
        // A reply we could not deliver is our problem, not Evolution's: it
        // answered us correctly, and a non-2xx would only make it deliver the
        // message we have already acted on all over again.
        if (config.logRequests) console.warn(`whatsapp inbound failed: ${error?.message ?? error}`);
        send(200, { ok: true, handled: false, reason: 'send_failed' });
      }
      return;
    }

    /**
     * The app's side of WhatsApp reminders, keyed by the same sync-key hash the
     * sync and push routes use — so there is no second identity to create, and
     * the sync code itself never appears in a URL.
     */
    const waMatch = rawPath.match(/^\/api\/wa\/([^/]+)$/);
    if (waMatch) {
      if (!chargeRateLimit()) return;

      const waKey = waMatch[1].toLowerCase();
      if (!KEY_PATTERN.test(waKey)) {
        send(400, { error: 'invalid_key' });
        return;
      }

      // No number means no link to hand out, and no instance means nothing could
      // ever be delivered. Refusing is honest; storing a plan that silently
      // never fires is not.
      if (!config.whatsappNumber || !isWhatsAppConfigured(config)) {
        send(503, { error: 'whatsapp_not_configured' });
        return;
      }

      if (req.method === 'PUT') {
        try {
          const parsed = JSON.parse(await readBody(req, config.maxBodyBytes));
          const rule = sanitizeRule(parsed?.rule);
          if (rule === null) {
            send(400, { error: 'invalid_rule' });
            return;
          }
          const timeZone = String(parsed?.timeZone ?? '');
          if (!isValidTimeZone(timeZone)) {
            send(400, { error: 'invalid_time_zone' });
            return;
          }

          /*
           * Which reminder this is.
           *
           * The app sends a stable `slot` — its own id for the vial — so
           * re-pushing the same vial updates the row it already has instead of
           * creating another one. Without that, every edit would mint a new
           * pairing code and leave the previous row stranded, and a device with
           * five vials would slowly fill the table with dead ones.
           *
           * A code the app already showed is still honoured, so pressing the
           * button twice does not invalidate the link the user is looking at.
           */
          const slot = cleanField(parsed?.slot, MAX_LABEL_LENGTH);
          // `?? null` deliberately: SQLite's `.get()` answers `undefined` when
          // the row is missing, and `undefined === null` is false.
          const existing = (slot === '' ? null : reminderBySlotStmt.get(waKey, slot)) ?? null;

          const code = isPairingCode(parsed?.code)
            ? normalizePairingCode(parsed.code)
            : existing?.key ?? generatePairingCode();

          const at = new Date();
          const expiresAt = new Date(at.getTime() + PAIRING_CODE_TTL_MS).toISOString();
          // The app knows which language it is showing, so the reminder can
          // arrive in the same one. Anything unrecognised falls back to English.
          const lang = resolveLanguage(parsed?.lang);
          reminderUpsertStmt.run(
            code,
            waKey,
            cleanField(parsed?.label, MAX_LABEL_LENGTH),
            cleanField(parsed?.dose, MAX_DOSE_LENGTH),
            // The draw string the app worked out. Same cap as the dose: both are
            // a few words, and neither is free text the user typed at length.
            cleanField(parsed?.draw, MAX_DOSE_LENGTH),
            // The person this vial is for. A short name, or blank for the
            // device's own owner.
            cleanField(parsed?.person, MAX_LABEL_LENGTH),
            slot,
            JSON.stringify(rule),
            JSON.stringify(sanitizeDoses(parsed?.doses)),
            timeZone,
            lang,
            expiresAt,
            at.toISOString(),
            at.toISOString(),
          );

          // An already-linked reminder takes an edit at once. A paused one is
          // left paused: the user asked for quiet, and an edit is not a RESUME.
          const saved = reminderRow(reminderByKeyStmt.get(code));
          if (saved.status === 'active') saveReminder(code, armAt({ ...saved, nowMs: at.getTime() }));

          /*
           * A device that has already opted in stays opted in.
           *
           * Adding a vial later must not quietly go silent. The owner sent their
           * code once, and asking for it again per vial is exactly what the
           * one-opt-in rule exists to avoid — worse, they would have no way to
           * notice: the reminders they already get keep arriving, and the new
           * vial simply never appears in them.
           */
          const claimed = reminderRow(reminderByKeyStmt.get(code));
          if (claimed.phone === null) {
            const owner = reminderByOwnerStmt
              .all(waKey)
              .map(reminderRow)
              .find((other) => other.phone !== null);
            if (owner?.phone) {
              saveReminder(code, {
                phone: owner.phone,
                expiresAt: null,
                lang,
                ...armAt({ rule: claimed.rule, timeZone: claimed.timeZone, nowMs: at.getTime() }),
              });
            }
          }

          const fresh = reminderRow(reminderByKeyStmt.get(code));
          send(200, {
            code,
            link: buildPairingLink({ phoneNumber: config.whatsappNumber, code }),
            expiresAt,
            status: fresh.status,
            linked: fresh.phone !== null,
            // The fallback hint needs the number in text form, for anyone whose
            // phone will not open the link.
            whatsappNumber: config.whatsappNumber,
          });
        } catch (error) {
          const tooLarge = error instanceof Error && error.message === 'payload_too_large';
          send(tooLarge ? 413 : 400, { error: tooLarge ? 'payload_too_large' : 'invalid_json' });
        }
        return;
      }

      if (req.method === 'GET') {
        const rows = reminderByOwnerStmt.all(waKey).map(reminderRow);
        send(200, {
          whatsappNumber: config.whatsappNumber || null,
          reminders: rows.map((row) => ({
            code: row.code,
            /*
             * The link comes back too, rebuilt here rather than remembered.
             *
             * It used to exist only in the PUT that created the reminder, which
             * meant a reloaded page had no link to offer — and a reminder that
             * was created but never claimed has no other way in. The user was
             * left at "waiting" with nothing to tap and no button to press,
             * which is the one state they could not get out of. Deriving it
             * from the stored code costs nothing and cannot go stale.
             */
            link: buildPairingLink({ phoneNumber: config.whatsappNumber, code: row.code }),
            label: row.label,
            dose: row.dose,
            // What the app said to draw, so the digest can show the units rather
            // than only the strength.
            draw: row.draw,
            // Whose vial it is, so a digest can divide by person.
            person: row.person,
            /*
             * The same three things the app sent — its id for the vial, the dose
             * timeline, and the language — come back so the app can see what the
             * server is working from. Without them a changed dose, a switched
             * language or a new vial looks identical to a plan that is already
             * up to date, and the reminder quietly stays wrong.
             */
            slot: row.slot,
            doses: row.doses,
            lang: row.lang,
            status: row.status,
            linked: row.phone !== null,
            // The phone number itself is never echoed back. The app already
            // knows it, and anyone holding the sync key does not need it.
            nextRunAt: row.nextRunAtMs === null ? null : new Date(row.nextRunAtMs).toISOString(),
            /*
             * The rule comes back so the app can see what the server is actually
             * working from. Without it there is no way to tell a reminder that
             * matches the plan from one that is weeks stale — and a stale one
             * keeps firing on the old times, for ever, silently.
             */
            rule: row.rule,
            timeZone: row.timeZone,
          })),
        });
        return;
      }

      if (req.method === 'DELETE') {
        /*
         * `?slot=` removes one vial's reminder; no parameter removes them all.
         *
         * Deleting a vial has to stop *that* reminder and nothing else — the
         * whole point of one message per person per day is that the other vials
         * keep theirs. Without this, a removed vial went on being reminded about
         * for ever, and the only way to stop it was to switch everything off.
         *
         * Removing the plan is the app's own way of saying "no more". Any
         * opt-out already recorded on the number is deliberately left in place.
         */
        const slot = cleanField(new URL(req.url, 'http://localhost').searchParams.get('slot'), MAX_LABEL_LENGTH);
        if (slot === '') reminderDeleteStmt.run(waKey);
        else reminderDeleteSlotStmt.run(waKey, slot);
        send(200, { ok: true });
        return;
      }

      send(405, { error: 'method_not_allowed' });
      return;
    }

    const match = rawPath.match(/^\/api\/sync\/([^/]+)$/);
    if (!match) {
      send(404, { error: 'not_found' });
      return;
    }

    // Charged per address, and only for the endpoints that touch the database.
    if (!chargeRateLimit()) return;

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
  server.on('close', () => {
    scheduler.stop();
    whatsappWorker.stop();
    db.close();
  });

  // Exposed the way `createRateLimiter.size()` is: for the tests, and for
  // nothing else. Asserting what the worker's one query returns is only possible
  // if a test can arm a row and drive a single tick.
  server.whatsappStore = whatsappStore;
  server.whatsappWorker = whatsappWorker;

  /**
   * The channel's own state in one object.
   *
   * This exists because the startup banner runs **outside** this factory and
   * cannot see `readConnection` — which it tried to call, and crashed the
   * process on `listen`. Tests never start the server as a program, so nothing
   * caught it. One accessor is both the fix and the thing that makes the state
   * observable from outside at all.
   */
  server.whatsappStatus = () => ({
    configured: isWhatsAppConfigured(config),
    link: readConnection(),
    sending: linkIsUp(),
  });

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
    console.log(
      isPushConfigured(config)
        ? `  push:           on (every ${config.pushIntervalMs / 1000}s)`
        : '  push:           off — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (npm run vapid)',
    );
    if (!isWhatsAppConfigured(config)) {
      console.log('  whatsapp:       off — set WHATSAPP_URL, WHATSAPP_API_KEY and WHATSAPP_INSTANCE');
    } else if (!config.whatsappSecret) {
      console.log(
        '  whatsapp:       sending on, but WHATSAPP_WEBHOOK_SECRET is unset — the webhook is unauthenticated. Set it before exposing this server.',
      );
    } else {
      console.log(
        `  whatsapp:       on (every ${config.whatsappIntervalMs / 1000}s, instance ${config.whatsappInstance})`,
      );
    }
    if (isWhatsAppConfigured(config) && !config.whatsappNumber) {
      console.warn('  ! WHATSAPP_NUMBER is unset — the app cannot show a wa.me link.');
    }
    /*
     * The most useful line this server can print. A link that dropped an hour
     * ago means every reminder has silently stopped, and a restart is exactly
     * when somebody is looking at the log.
     *
     * Read through `server.whatsappStatus()` rather than `readConnection`:
     * this block runs outside `createSyncServer`, and calling into its closure
     * directly is what crashed the process on startup.
     */
    if (isWhatsAppConfigured(config)) {
      const { link } = server.whatsappStatus();
      if (link && !isConnectionOpen(link.state)) {
        console.warn(
          `  ! whatsapp link is ${link.state} (since ${link.sinceAt}) — NO REMINDERS WILL BE SENT. Re-link the instance and scan the QR code.`,
        );
      }
    }
  });
}
