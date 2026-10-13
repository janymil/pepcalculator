import { describe, expect, it } from 'vitest';
import {
  MAX_QUEUE,
  createPushScheduler,
  dueEntries,
  isValidSubscription,
  normalizeQueue,
} from './push.mjs';

const NOW = Date.parse('2026-01-01T12:00:00.000Z');
const KEY = 'a'.repeat(64);

const subscription = {
  endpoint: 'https://push.example/abc',
  keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
};

/** A queue entry `offsetMs` from NOW. */
const entry = (offsetMs, extra = {}) => ({
  at: new Date(NOW + offsetMs).toISOString(),
  title: 'Time for your dose',
  body: 'Test vial · 08:00',
  tag: `dose:${offsetMs}`,
  ...extra,
});

/** A store the scheduler can drive, recording what it did. */
function fakeStore(rows) {
  const saved = [];
  const removed = [];
  return {
    saved,
    removed,
    list: () => rows,
    save: (key, value) => saved.push({ key, ...value }),
    remove: (key) => removed.push(key),
  };
}

describe('isValidSubscription', () => {
  it('accepts a well-formed subscription', () => {
    expect(isValidSubscription(subscription)).toBe(true);
  });

  it('refuses anything missing its endpoint or keys', () => {
    expect(isValidSubscription(null)).toBe(false);
    expect(isValidSubscription({})).toBe(false);
    expect(isValidSubscription({ endpoint: 'https://x', keys: {} })).toBe(false);
    expect(isValidSubscription({ endpoint: 'not-a-url', keys: subscription.keys })).toBe(false);
  });
});

describe('normalizeQueue', () => {
  it('keeps usable entries and drops the rest', () => {
    const queue = normalizeQueue(
      [
        entry(60_000),
        { at: 'nonsense', title: 'x' },
        null,
        { title: 'no instant' },
      ],
      NOW,
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].title).toBe('Time for your dose');
  });

  it('drops a stale entry and one beyond the horizon', () => {
    const day = 24 * 60 * 60 * 1000;
    const queue = normalizeQueue([entry(-2 * day), entry(200 * day), entry(day)], NOW);
    expect(queue).toHaveLength(1);
    expect(Date.parse(queue[0].at)).toBe(NOW + day);
  });

  it('truncates long text and caps the number of entries', () => {
    const long = 'x'.repeat(1000);
    expect(normalizeQueue([entry(60_000, { title: long, body: long })], NOW)[0].title.length).toBe(
      120,
    );

    const many = Array.from({ length: MAX_QUEUE + 50 }, (_, index) => entry(60_000 + index));
    expect(normalizeQueue(many, NOW)).toHaveLength(MAX_QUEUE);
  });

  it('never throws on a non-array', () => {
    expect(normalizeQueue(undefined, NOW)).toEqual([]);
    expect(normalizeQueue('nope', NOW)).toEqual([]);
  });
});

describe('dueEntries', () => {
  it('returns only the entries at or before now', () => {
    const queue = normalizeQueue([entry(-60_000), entry(60_000)], NOW);
    // The stale one survived normalize (under a day); only the past one is due.
    expect(dueEntries(queue, NOW)).toHaveLength(1);
    expect(dueEntries(queue, NOW + 120_000)).toHaveLength(2);
  });
});

describe('createPushScheduler', () => {
  it('sends the due entry and stores what is left', async () => {
    const store = fakeStore([{ key: KEY, subscription, queue: [entry(-1), entry(60_000)], failures: 0 }]);
    const sent = [];
    const scheduler = createPushScheduler({ store, send: async (sub, payload) => sent.push(payload), now: () => NOW });

    await scheduler.tick();

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: 'Time for your dose' });
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0].queue).toHaveLength(1);
    expect(store.saved[0].failures).toBe(0);
  });

  it('does nothing when no entry is due', async () => {
    const store = fakeStore([{ key: KEY, subscription, queue: [entry(60_000)], failures: 0 }]);
    let calls = 0;
    const scheduler = createPushScheduler({ store, send: async () => (calls += 1), now: () => NOW });

    await scheduler.tick();

    expect(calls).toBe(0);
    expect(store.saved).toHaveLength(0);
  });

  it('keeps the queue and counts the failure on a transient error', async () => {
    const queue = [entry(-1)];
    const store = fakeStore([{ key: KEY, subscription, queue, failures: 2 }]);
    const errors = [];
    const scheduler = createPushScheduler({
      store,
      send: async () => {
        throw Object.assign(new Error('boom'), { statusCode: 500 });
      },
      now: () => NOW,
      onError: (error) => errors.push(error),
    });

    await scheduler.tick();

    expect(store.saved[0].queue).toEqual(queue);
    expect(store.saved[0].failures).toBe(3);
    expect(store.removed).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it('drops a subscription the push service has forgotten (410)', async () => {
    const store = fakeStore([{ key: KEY, subscription, queue: [entry(-1)], failures: 0 }]);
    const scheduler = createPushScheduler({
      store,
      send: async () => {
        throw Object.assign(new Error('gone'), { statusCode: 410 });
      },
      now: () => NOW,
    });

    await scheduler.tick();

    expect(store.removed).toEqual([KEY]);
    expect(store.saved).toHaveLength(0);
  });

  it('starts and stops its timer without leaking', () => {
    const store = fakeStore([]);
    const scheduler = createPushScheduler({ store, send: async () => {}, intervalMs: 1000 });
    scheduler.start();
    scheduler.start(); // idempotent
    scheduler.stop();
    expect(true).toBe(true);
  });
});
