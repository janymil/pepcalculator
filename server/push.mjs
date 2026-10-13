/**
 * Web Push — the pure parts, and the scheduler that sends them.
 *
 * Design (the honest version): the app works out every future dose and uploads
 * it as a queue of *already-rendered* notifications, each stamped with an
 * absolute UTC instant. The server stores that queue per key and fires each
 * entry when it comes due, so a reminder arrives with the app closed.
 *
 * Why a queue of rendered text rather than the raw schedule: the schedule maths
 * stays in one place (`src/lib/reminders.ts`, the same code the calendar uses),
 * so a push can never disagree with the app, and the service worker stays
 * language-free — it just shows what it is handed.
 *
 * Nothing here imports `web-push` or opens the database: the sender and the
 * store are injected, so the whole of this file is testable without a socket.
 */

/** Largest queue stored for one key — an "ongoing" plan cannot grow forever. */
export const MAX_QUEUE = 500;

/** Anything further ahead than this is dropped when a queue is stored. */
export const MAX_HORIZON_MS = 100 * 24 * 60 * 60 * 1000;

/** An entry this far in the past is stale: never send a dose that late. */
export const MAX_ENTRY_AGE_MS = 24 * 60 * 60 * 1000;

export const MAX_TITLE_LENGTH = 120;
export const MAX_BODY_LENGTH = 240;

/** Safety cap: one tick sends at most this many notifications per subscriber. */
export const MAX_SEND_PER_TICK = 20;

/** A push subscription as the browser hands it over (`PushSubscription.toJSON`). */
export function isValidSubscription(value) {
  if (!value || typeof value !== 'object') return false;
  const endpoint = value.endpoint;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  if (!/^https?:\/\//.test(endpoint)) return false;
  const keys = value.keys;
  if (!keys || typeof keys !== 'object') return false;
  return (
    typeof keys.p256dh === 'string' &&
    keys.p256dh.length > 0 &&
    typeof keys.auth === 'string' &&
    keys.auth.length > 0
  );
}

function clampText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** One queue entry, or null when it cannot be trusted. */
function normalizeEntry(entry, nowMs) {
  if (!entry || typeof entry !== 'object') return null;
  const at = typeof entry.at === 'string' ? Date.parse(entry.at) : NaN;
  if (!Number.isFinite(at)) return null;
  if (at < nowMs - MAX_ENTRY_AGE_MS) return null;
  if (at > nowMs + MAX_HORIZON_MS) return null;

  const title = clampText(entry.title, MAX_TITLE_LENGTH).trim();
  if (!title) return null;
  const body = clampText(entry.body, MAX_BODY_LENGTH);
  const tag = clampText(entry.tag, 200).trim() || `dose:${at}`;
  return { at: new Date(at).toISOString(), title, body, tag };
}

/**
 * A client-supplied queue, filtered down to the entries worth storing: valid
 * instants inside the horizon, capped at `MAX_QUEUE`. `nowMs` is injectable so
 * the filtering is deterministic in tests.
 */
export function normalizeQueue(value, nowMs = Date.now()) {
  if (!Array.isArray(value)) return [];
  const kept = [];
  for (const entry of value) {
    const normalized = normalizeEntry(entry, nowMs);
    if (normalized) kept.push(normalized);
    if (kept.length >= MAX_QUEUE) break;
  }
  return kept;
}

/** The entries at or before `nowMs`, in the order they were stored. */
export function dueEntries(queue, nowMs) {
  return queue.filter((entry) => Date.parse(entry.at) <= nowMs);
}

/** A subscription the push service has forgotten; sending can never succeed. */
function isGone(error) {
  const status = error?.statusCode ?? error?.status;
  return status === 404 || status === 410;
}

/**
 * Fires due notifications.
 *
 * `store` is injected and must offer:
 *   - `list()` -> [{ key, subscription, queue, failures }]
 *   - `save(key, { queue, failures })`
 *   - `remove(key)`
 *
 * `send(subscription, { title, body, tag })` is injected too (the real one wraps
 * `web-push`), so the scheduler can be tested without a network. Delivery is
 * at-least-once: entries are only dropped after a successful send, and a
 * transient failure simply retries on the next tick.
 */
export function createPushScheduler({
  store,
  send,
  now = () => Date.now(),
  intervalMs = 30_000,
  onError = () => {},
}) {
  let timer = null;

  async function tick() {
    let rows;
    try {
      rows = store.list();
    } catch (error) {
      onError(error);
      return;
    }

    const nowMs = now();
    for (const row of rows) {
      const queue = Array.isArray(row.queue) ? row.queue : [];
      const due = dueEntries(queue, nowMs).slice(0, MAX_SEND_PER_TICK);
      if (due.length === 0) continue;

      const sent = new Set(due.map((entry) => entry.tag));
      const remaining = queue.filter((entry) => !sent.has(entry.tag));

      try {
        for (const entry of due) {
          await send(row.subscription, { title: entry.title, body: entry.body, tag: entry.tag });
        }
        store.save(row.key, { queue: remaining, failures: 0 });
      } catch (error) {
        if (isGone(error)) {
          // The endpoint is dead — keep pushing to it forever would be noise.
          store.remove(row.key);
        } else {
          // Keep every entry and try again next tick; an outage must not lose a dose.
          store.save(row.key, { queue, failures: (row.failures ?? 0) + 1 });
        }
        onError(error);
      }
    }
  }

  return {
    tick,
    start() {
      if (timer !== null) return;
      timer = setInterval(() => void tick(), intervalMs);
      // A scheduler must not be the reason the process refuses to exit.
      if (typeof timer.unref === 'function') timer.unref();
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
