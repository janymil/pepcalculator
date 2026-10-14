import { describe, expect, it } from 'vitest';
import {
  FAILURE_BACKOFF_MS,
  MAX_FAILURES,
  MAX_MESSAGE_LENGTH,
  MAX_SEND_PER_TICK,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  applyIntent,
  buildPairingLink,
  cleanField,
  createWhatsAppWorker,
  digestGroups,
  digestTextFor,
  generatePairingCode,
  isPairingCode,
  isPermanentFailure,
  normalizePairingCode,
  parseIntent,
  planSummaries,
  planSummary,
  say,
  shouldPark,
  spacingDelay,
  withJitter,
} from './whatsapp.mjs';
import { digestEntries } from './messages.mjs';

/** A deterministic stand-in for `Math.random`, returning a fixed sequence. */
function seededRandom(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

function makeRule(overrides = {}) {
  return {
    times: ['08:00'],
    repeat: 'daily',
    weekdays: [],
    intervalDays: 0,
    startsOn: '2026-01-05',
    durationValue: 0,
    durationUnit: 'ongoing',
    ...overrides,
  };
}

function makeReminder(overrides = {}) {
  return {
    code: 'K7M2QP',
    status: 'active',
    label: 'Morning protocol',
    dose: '10 units (250 mcg)',
    timeZone: 'Europe/Bratislava',
    lang: 'en',
    rule: makeRule(),
    ...overrides,
  };
}

/** The same reminder in another language, so the replies are testable too. */
function inLang(lang, overrides = {}) {
  return makeReminder({ lang, ...overrides });
}

/** 07:00 in Bratislava on 15 January — an hour before the dose. */
const NOW = Date.UTC(2026, 0, 15, 6, 0, 0);

describe('pairing codes', () => {
  it('is always the advertised length', () => {
    for (let i = 0; i < 50; i += 1) expect(generatePairingCode()).toHaveLength(PAIRING_CODE_LENGTH);
  });

  it('never uses a character people confuse with another', () => {
    // I, O, 0 and 1 are the four that get misread off a screen.
    for (const character of 'IO01') {
      expect(PAIRING_CODE_ALPHABET).not.toContain(character);
    }
  });

  it('only ever emits characters from its own alphabet', () => {
    for (let i = 0; i < 50; i += 1) {
      for (const character of generatePairingCode()) {
        expect(PAIRING_CODE_ALPHABET).toContain(character);
      }
    }
  });

  it('builds a code from an injected random source', () => {
    // Every draw is the first character of the alphabet.
    expect(generatePairingCode(seededRandom([0]))).toBe('AAAAAA');
    // A draw past the end must clamp, not produce `undefined`.
    expect(generatePairingCode(seededRandom([1]))).toBe('999999');
  });

  it('accepts a code however the user typed it', () => {
    expect(normalizePairingCode('k7m-2qp')).toBe('K7M2QP');
    expect(normalizePairingCode(' K7 M2QP ')).toBe('K7M2QP');
    expect(normalizePairingCode('K7M2QP.')).toBe('K7M2QP');
    expect(isPairingCode('k7m-2qp')).toBe(true);
  });

  it('refuses anything that is not one of ours', () => {
    expect(isPairingCode('K7M2Q')).toBe(false); // too short
    expect(isPairingCode('K7M2QPX')).toBe(false); // too long
    expect(isPairingCode('K7M2Q0')).toBe(false); // carries a zero
    expect(isPairingCode('')).toBe(false);
    expect(isPairingCode(null)).toBe(false);
  });

  it('tidies a user-supplied label without letting it run away', () => {
    expect(cleanField('  Morning   protocol ', 60)).toBe('Morning protocol');
    expect(cleanField('x'.repeat(200), 60)).toHaveLength(60);
    expect(cleanField(undefined, 20)).toBe('');
  });

  it('builds the tap-to-start link with the code pre-filled', () => {
    expect(buildPairingLink({ phoneNumber: '+421 900 000 000', code: 'k7m-2qp' })).toBe(
      'https://wa.me/421900000000?text=START%20K7M2QP',
    );
  });

  it('refuses to build a link that would lead nowhere', () => {
    expect(buildPairingLink({ phoneNumber: '', code: 'K7M2QP' })).toBe('');
    expect(buildPairingLink({ phoneNumber: '421900000000', code: 'nope' })).toBe('');
  });

  it('never puts anything but a pairing code in the link', () => {
    // The sync code is the sync API's only credential and must not travel here.
    const link = buildPairingLink({ phoneNumber: '421900000000', code: 'K7M2QP' });
    expect(link).toBe('https://wa.me/421900000000?text=START%20K7M2QP');
    expect(decodeURIComponent(link.split('text=')[1])).toBe('START K7M2QP');
  });
});

describe('reading what the user typed', () => {
  it('reads the commands, whatever the case', () => {
    expect(parseIntent('STOP')).toEqual({ kind: 'stop' });
    expect(parseIntent('stop')).toEqual({ kind: 'stop' });
    expect(parseIntent('  Stop  ')).toEqual({ kind: 'stop' });
    expect(parseIntent('UNSUBSCRIBE')).toEqual({ kind: 'stop' });
    expect(parseIntent('PAUSE')).toEqual({ kind: 'pause' });
    expect(parseIntent('RESUME')).toEqual({ kind: 'resume' });
    expect(parseIntent('STATUS')).toEqual({ kind: 'status' });
    expect(parseIntent('HELP')).toEqual({ kind: 'help' });
    expect(parseIntent('?')).toEqual({ kind: 'help' });
  });

  it('tolerates a full stop at the end of a sentence', () => {
    expect(parseIntent('STOP.')).toEqual({ kind: 'stop' });
    expect(parseIntent('stop!')).toEqual({ kind: 'stop' });
    expect(parseIntent('Pause,')).toEqual({ kind: 'pause' });
  });

  it('reads a code as a start, with or without the word', () => {
    expect(parseIntent('START K7M2QP')).toEqual({ kind: 'start', code: 'K7M2QP' });
    expect(parseIntent('start k7m-2qp')).toEqual({ kind: 'start', code: 'K7M2QP' });
    expect(parseIntent('K7M2QP')).toEqual({ kind: 'start', code: 'K7M2QP' });
  });

  it('reads STATUS as the command, not as a pairing code', () => {
    // This is the trap the parser ordering exists for: every letter of STATUS
    // is in the code alphabet, and it is exactly six characters long.
    expect(isPairingCode('STATUS')).toBe(true);
    expect(parseIntent('STATUS')).toEqual({ kind: 'status' });
  });

  it('reads the ways people write a clock time', () => {
    expect(parseIntent('08:00')).toEqual({ kind: 'time', time: '08:00' });
    expect(parseIntent('8:00')).toEqual({ kind: 'time', time: '08:00' });
    expect(parseIntent('8.30')).toEqual({ kind: 'time', time: '08:30' });
    expect(parseIntent('2030')).toEqual({ kind: 'time', time: '20:30' });
    expect(parseIntent('7')).toEqual({ kind: 'time', time: '07:00' });
    expect(parseIntent('7am')).toEqual({ kind: 'time', time: '07:00' });
    expect(parseIntent('7PM')).toEqual({ kind: 'time', time: '19:00' });
    expect(parseIntent('12am')).toEqual({ kind: 'time', time: '00:00' });
    expect(parseIntent('12pm')).toEqual({ kind: 'time', time: '12:00' });
  });

  it('refuses a time that is not a real time', () => {
    expect(parseIntent('25:00')).toEqual({ kind: 'unknown' });
    expect(parseIntent('08:99')).toEqual({ kind: 'unknown' });
  });

  it('answers ignored for nothing, and unknown for anything else', () => {
    expect(parseIntent('')).toEqual({ kind: 'ignored' });
    expect(parseIntent('   ')).toEqual({ kind: 'ignored' });
    expect(parseIntent('hello there')).toEqual({ kind: 'unknown' });
    expect(parseIntent('START')).toEqual({ kind: 'unknown' }); // no code attached
  });

  it('never throws, whatever it is handed', () => {
    for (const value of [null, undefined, 0, {}, [], true]) {
      expect(() => parseIntent(value)).not.toThrow();
    }
  });
});

describe('what we send', () => {
  it('renders in the language it was asked for', () => {
    const entry = { time: '08:00', label: 'X', dose: '', draw: '' };
    expect(say('en', 'digest', { entries: digestEntries('en', [entry]) })).toContain('your doses today');
    expect(say('sk', 'digest', { entries: digestEntries('sk', [entry]) })).toContain('dnešné dávky');
    expect(say('es', 'digest', { entries: digestEntries('es', [entry]) })).toContain('tus dosis de hoy');
  });

  it('shows the draw the app sent, next to the dose', () => {
    // The units come from the app, because only the app knows the vial. The
    // server's job is to put them where they will be read.
    const text = digestTextFor([
      {
        lang: 'en',
        label: 'Nad+',
        dose: '50 mg',
        draw: 'draw to 20 units',
        timeZone: 'Europe/Bratislava',
        nextRunAtMs: Date.UTC(2026, 0, 15, 9, 0, 0),
      },
    ]);
    expect(text).toContain('10:00 · Nad+');
    expect(text).toContain('Dose: 50 mg · draw to 20 units');
  });

  it('says how many doses it could not fit, rather than cutting the list off', () => {
    /*
     * A day with this many doses is absurd, and that is the point: the failure
     * it guards against is not the absurd day, it is `say` slicing the text and
     * losing the tail with no sign — and the tail is somebody's evening dose.
     */
    const many = Array.from({ length: 200 }, (_, index) => ({
      lang: 'en',
      label: `Vial ${index}`,
      dose: '50 mg',
      draw: 'Draw to 20 units',
      timeZone: 'UTC',
      nextRunAtMs: Date.UTC(2026, 0, 15, 9, 0, 0),
      doses: [],
    }));

    const text = digestTextFor(many);
    expect(text.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    expect(text).toContain('more today');
  });

  it('falls back to English for a language it does not have', () => {
    expect(say('fr', 'stopped')).toBe(say('en', 'stopped'));
    expect(say(undefined, 'stopped')).toBe(say('en', 'stopped'));
  });

  it('answers an unknown message key with nothing, rather than throwing', () => {
    expect(say('en', 'noSuchMessage')).toBe('');
  });

  it('never builds more than WhatsApp will take', () => {
    const long = say('en', 'digest', { entries: 'x'.repeat(5000) });
    expect(long.length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
    // WhatsApp's own ceiling, which ours has to stay under.
    expect(MAX_MESSAGE_LENGTH).toBeLessThan(4096);
  });

  it('summarises a plan with the time the user set, not the next run', () => {
    expect(planSummary(makeReminder({ rule: makeRule({ times: ['08:00', '20:00'] }) }))).toEqual({
      label: 'Morning protocol',
      dose: '10 units (250 mcg)',
      status: 'active',
      time: '08:00',
    });
  });

  it('copes with a reminder that has no rule at all', () => {
    expect(planSummary({ label: '', dose: '', status: 'pending', rule: null }).time).toBe('');
    expect(planSummaries(null)).toEqual([]);
  });
});

describe('turning an intent into a state change', () => {
  /** Two plans on one number — which is what most of this now has to handle. */
  const TWO = [
    makeReminder({ code: 'AAAAAA', label: 'Morning protocol' }),
    makeReminder({
      code: 'BBBBBB',
      label: 'Evening peptide',
      rule: makeRule({ times: ['20:00'] }),
    }),
  ];

  it('stops every plan on the number, and clears every armed time', () => {
    // STOP is not "one of them". A person who says it means all of it.
    const { patches, reply } = applyIntent({ reminders: TWO, intent: { kind: 'stop' }, nowMs: NOW });
    expect(patches).toEqual([
      { code: 'AAAAAA', patch: { status: 'stopped', nextRunAtMs: null } },
      { code: 'BBBBBB', patch: { status: 'stopped', nextRunAtMs: null } },
    ]);
    expect(reply).toContain('Stopped');
  });

  it('pauses every plan that is not already stopped', () => {
    const { patches, reply } = applyIntent({
      reminders: [makeReminder({ code: 'A' }), makeReminder({ code: 'B', status: 'stopped' })],
      intent: { kind: 'pause' },
      nowMs: NOW,
    });
    expect(patches).toEqual([{ code: 'A', patch: { status: 'paused', nextRunAtMs: null } }]);
    expect(reply).toContain('Paused');
  });

  it('resumes and arms every plan, and names the soonest', () => {
    const { patches, reply } = applyIntent({
      reminders: TWO.map((reminder) => ({ ...reminder, status: 'paused' })),
      intent: { kind: 'resume' },
      nowMs: NOW,
    });
    expect(patches).toHaveLength(2);
    // 08:00 in Bratislava on 15 January is 07:00 UTC; 20:00 is 19:00 UTC.
    expect(patches[0].patch).toEqual({ status: 'active', nextRunAtMs: Date.UTC(2026, 0, 15, 7) });
    expect(patches[1].patch).toEqual({ status: 'active', nextRunAtMs: Date.UTC(2026, 0, 15, 19) });
    expect(reply).toContain('08:00');
  });

  it('says it is already on when the same code arrives twice for one plan', () => {
    const { reply } = applyIntent({
      reminders: [makeReminder({ status: 'active' })],
      intent: { kind: 'start' },
      nowMs: NOW,
    });
    expect(reply).toContain('already on');
  });

  it('stops rather than resuming a plan that has no dose left', () => {
    const finished = makeReminder({
      status: 'paused',
      rule: makeRule({ durationValue: 1, durationUnit: 'weeks' }),
    });
    const { patches, reply } = applyIntent({
      reminders: [finished],
      intent: { kind: 'resume' },
      nowMs: Date.UTC(2026, 5, 1, 6, 0, 0),
    });
    expect(patches[0].patch).toEqual({ status: 'stopped', nextRunAtMs: null });
    expect(reply).toContain('end of its plan');
  });
});

describe('sending politely', () => {
  it('nudges a send time by less than a minute', () => {
    expect(withJitter(1_000_000, () => 0)).toBe(1_000_000);
    expect(withJitter(1_000_000, () => 0.999)).toBeGreaterThan(1_000_000);
    // Under 60 s, so the jittered instant stays inside the dose's own minute.
    expect(withJitter(1_000_000, () => 0.999) - 1_000_000).toBeLessThan(60_000);
  });

  it('leaves the first send of a tick alone, and spaces the rest', () => {
    expect(spacingDelay(0, () => 0)).toBe(0);
    expect(spacingDelay(1, () => 0)).toBe(3_000);
    expect(spacingDelay(2, () => 0)).toBe(6_000);
    expect(spacingDelay(2, () => 0.5)).toBe(7_500);
  });

  it('parks a reminder only after it has failed enough times', () => {
    expect(shouldPark(0)).toBe(false);
    expect(shouldPark(MAX_FAILURES - 1)).toBe(false);
    expect(shouldPark(MAX_FAILURES)).toBe(true);
    expect(shouldPark(undefined)).toBe(false);
  });

  it('tells a permanent failure from a temporary one', () => {
    expect(isPermanentFailure(new Error('whatsapp_send_failed 400 bad number'))).toBe(true);
    expect(isPermanentFailure(new Error('whatsapp_send_failed 404 gone'))).toBe(true);
    expect(isPermanentFailure(new Error('whatsapp_send_failed 502 Bad Gateway'))).toBe(false);
    expect(isPermanentFailure(new Error('whatsapp_send_failed 503 '))).toBe(false);
    expect(isPermanentFailure(new Error('ECONNREFUSED'))).toBe(false);
    expect(isPermanentFailure(new Error('The operation was aborted due to timeout'))).toBe(false);
    expect(isPermanentFailure(null)).toBe(false);
  });
});

/** A store the worker can drive, recording every patch it is handed. */
function fakeStore(rows) {
  const saved = [];
  return {
    due: () => rows,
    /*
     * The digest covers the whole day, so the worker asks for every plan a
     * number holds — not only the one that just came due. Without this the
     * digest could never contain more than a single dose.
     */
    forPhone: (phone) => rows.filter((row) => row.phone === phone),
    save: (code, patch) => saved.push({ code, patch }),
    saved,
  };
}

/** One due reminder: 08:00 in Bratislava on 15 January, delivered a second late. */
const DUE_AT = Date.UTC(2026, 0, 15, 7, 0, 0);
const AFTER_DUE = DUE_AT + 1_000;

function dueRow(overrides = {}) {
  return {
    code: 'K7M2QP',
    phone: '421900000000',
    label: 'Morning protocol',
    dose: '10 units',
    draw: '',
    timeZone: 'Europe/Bratislava',
    lang: 'en',
    status: 'active',
    rule: makeRule(),
    nextRunAtMs: DUE_AT,
    failures: 0,
    ...overrides,
  };
}

describe('grouping the day into one digest', () => {
  // 10:00 and 13:00 in Bratislava (UTC+1 in January), and the midnight pair.
  const AT_10 = Date.UTC(2026, 0, 15, 9, 0, 0);
  const AT_13 = Date.UTC(2026, 0, 15, 12, 0, 0);
  const AT_2350 = Date.UTC(2026, 0, 15, 22, 50, 0);
  const AT_0010 = Date.UTC(2026, 0, 15, 23, 10, 0);

  const forPhone = (rows) => (phone) => rows.filter((row) => row.phone === phone);

  it('gathers every plan due the same local day, earliest first', () => {
    const rows = [
      dueRow({ code: 'B', label: 'Testosterone', nextRunAtMs: AT_13 }),
      dueRow({ code: 'A', label: 'Nad+', nextRunAtMs: AT_10 }),
    ];
    // Only the 10:00 plan is due this minute; the 13:00 one has to be found.
    const groups = digestGroups([rows[1]], forPhone(rows));

    expect(groups).toHaveLength(1);
    expect(groups[0].map((row) => row.label)).toEqual(['Nad+', 'Testosterone']);
  });

  it('never mixes two numbers, even at the same time', () => {
    const rows = [
      dueRow({ code: 'A', phone: '111', nextRunAtMs: AT_10 }),
      dueRow({ code: 'B', phone: '222', nextRunAtMs: AT_10 }),
    ];
    const groups = digestGroups(rows, forPhone(rows));

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group[0].phone).sort()).toEqual(['111', '222']);
  });

  it('keeps a dose just after midnight out of the previous day', () => {
    // 23:50 and 00:10 are different days. Merging them by number alone would
    // put tomorrow's dose into today's list — the one mistake a user cannot see
    // coming, because the message looks perfectly normal.
    const rows = [
      dueRow({ code: 'A', label: 'Late', nextRunAtMs: AT_2350 }),
      dueRow({ code: 'B', label: 'JustAfterMidnight', nextRunAtMs: AT_0010 }),
    ];
    const groups = digestGroups([rows[0]], forPhone(rows));

    expect(groups).toHaveLength(1);
    expect(groups[0].map((row) => row.label)).toEqual(['Late']);
  });

  it('sends one message for the day, and advances both plans', async () => {
    const rows = [
      dueRow({ code: 'A', label: 'Nad+', dose: '50 mg', draw: 'draw to 20 units', nextRunAtMs: AT_10 }),
      dueRow({ code: 'B', label: 'Testosterone', dose: '25 mg', draw: 'draw to 10 units', nextRunAtMs: AT_13 }),
    ];
    const store = fakeStore(rows);
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push({ phone, text }),
      now: () => AT_10 + 1_000,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    // One message, holding even the dose that is not due yet.
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain('Nad+');
    expect(sent[0].text).toContain('draw to 20 units');
    expect(sent[0].text).toContain('Testosterone');
    expect(sent[0].text).toContain('13:00');
    // And both plans move on. Arming only the first is what would let the 13:00
    // dose send a second, duplicate message later in the day.
    expect(store.saved.map((entry) => entry.code).sort()).toEqual(['A', 'B']);
  });
});

describe('the worker', () => {
  it('sends a due reminder and arms the next day', async () => {
    const store = fakeStore([dueRow()]);
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push({ phone, text }),
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(sent).toHaveLength(1);
    expect(sent[0].phone).toBe('421900000000');
    expect(sent[0].text).toContain('Morning protocol');
    expect(sent[0].text).toContain('08:00');
    expect(store.saved).toEqual([
      {
        code: 'K7M2QP',
        patch: { status: 'active', nextRunAtMs: Date.UTC(2026, 0, 16, 7, 0, 0), failures: 0 },
      },
    ]);
  });

  it('arms strictly the following dose, never the one just sent', async () => {
    const store = fakeStore([dueRow()]);
    const worker = createWhatsAppWorker({
      store,
      send: async () => {},
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(store.saved[0].patch.nextRunAtMs).toBeGreaterThan(DUE_AT);
  });

  it('spaces the sends in a batch instead of bursting', async () => {
    // Different numbers, because the spacing is between *messages* — and two
    // plans on one number are now one message, not two.
    const store = fakeStore([
      dueRow({ code: 'A', phone: '111' }),
      dueRow({ code: 'B', phone: '222' }),
      dueRow({ code: 'C', phone: '333' }),
    ]);
    const slept = [];
    const worker = createWhatsAppWorker({
      store,
      send: async () => {},
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async (ms) => slept.push(ms),
    });

    await worker.tick();

    // The first leaves immediately; the others wait their turn.
    expect(slept).toEqual([3_000, 6_000]);
  });

  it("sends at most a tick's worth, however long the backlog", async () => {
    const rows = Array.from({ length: 25 }, (_, index) => dueRow({ code: `C${index}`, phone: `9${index}` }));
    const store = fakeStore(rows);
    let count = 0;
    const worker = createWhatsAppWorker({
      store,
      send: async () => {
        count += 1;
      },
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(count).toBe(MAX_SEND_PER_TICK);
  });

  it('keeps a dose through a failure and retries it shortly', async () => {
    const store = fakeStore([dueRow()]);
    const errors = [];
    const worker = createWhatsAppWorker({
      store,
      send: async () => {
        throw new Error('ECONNREFUSED');
      },
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
      onError: (error) => errors.push(error),
    });

    await worker.tick();

    expect(errors).toHaveLength(1);
    expect(store.saved[0].patch).toEqual({
      failures: 1,
      nextRunAtMs: DUE_AT + FAILURE_BACKOFF_MS,
    });
  });

  it('parks a reminder that keeps failing, rather than retrying forever', async () => {
    const store = fakeStore([dueRow({ failures: MAX_FAILURES - 1 })]);
    const worker = createWhatsAppWorker({
      store,
      send: async () => {
        // A 4xx: this number is wrong, and it will be wrong again in two minutes.
        throw new Error('whatsapp_send_failed 400 {"message":"number not on WhatsApp"}');
      },
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(store.saved[0].patch).toEqual({
      status: 'error',
      failures: MAX_FAILURES,
      nextRunAtMs: null,
    });
  });

  it('never parks a reminder because the gateway went down', async () => {
    /*
     * The bug this test exists for. Five failures used to park a reminder no
     * matter why they failed — and a ten-minute outage is twenty ticks, which is
     * five failures, which would have switched off every reminder for every user
     * permanently, over a temporary problem.
     */
    const store = fakeStore([dueRow({ failures: MAX_FAILURES - 1 })]);
    const worker = createWhatsAppWorker({
      store,
      send: async () => {
        throw new Error('whatsapp_send_failed 502 Bad Gateway');
      },
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(store.saved[0].patch).toEqual({
      failures: MAX_FAILURES,
      nextRunAtMs: DUE_AT + FAILURE_BACKOFF_MS,
    });
  });

  it('sends nothing at all while the link is known to be down', async () => {
    const store = fakeStore([dueRow()]);
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push(text),
      canSend: () => false,
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    // Nothing sent, and — the point — nothing charged as a failure either.
    expect(sent).toHaveLength(0);
    expect(store.saved).toHaveLength(0);
  });

  it('sends again the moment the link comes back', async () => {
    const store = fakeStore([dueRow()]);
    let up = false;
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push(text),
      canSend: () => up,
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();
    expect(sent).toHaveLength(0);

    up = true;
    await worker.tick();
    // The armed time was never touched, so the dose is still there to send.
    expect(sent).toHaveLength(1);
  });

  it('delivers the last dose, then stops instead of asking for more', async () => {
    const lastDose = Date.UTC(2026, 0, 11, 7, 0, 0);
    const store = fakeStore([
      dueRow({
        rule: makeRule({ durationValue: 1, durationUnit: 'weeks' }),
        nextRunAtMs: lastDose,
      }),
    ]);
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push(text),
      now: () => lastDose + 1_000,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    // The final reminder goes out; nothing extra is sent afterwards.
    expect(sent).toHaveLength(1);
    expect(store.saved[0].patch).toEqual({ status: 'stopped', nextRunAtMs: null, failures: 0 });
  });

  it('skips a row with no phone or no usable instant', async () => {
    const store = fakeStore([
      dueRow({ code: 'A', phone: '' }),
      dueRow({ code: 'B', nextRunAtMs: null }),
      dueRow({ code: 'C' }),
    ]);
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push(text),
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(sent).toHaveLength(1);
    expect(store.saved).toHaveLength(1);
  });

  it('never sends something that is not due yet', async () => {
    // Belt and braces behind the store's query: a row armed for tomorrow is not
    // sent today just because it was handed over.
    const store = fakeStore([dueRow({ nextRunAtMs: AFTER_DUE + 60_000 })]);
    const sent = [];
    const worker = createWhatsAppWorker({
      store,
      send: async (phone, text) => sent.push(text),
      now: () => AFTER_DUE,
      random: () => 0,
      sleep: async () => {},
    });

    await worker.tick();

    expect(sent).toHaveLength(0);
    expect(store.saved).toHaveLength(0);
  });

  it('survives the store itself failing', async () => {
    const errors = [];
    const worker = createWhatsAppWorker({
      store: {
        due: () => {
          throw new Error('database is gone');
        },
        save: () => {},
      },
      send: async () => {},
      now: () => AFTER_DUE,
      onError: (error) => errors.push(error),
    });

    await expect(worker.tick()).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
  });

  it('starts and stops without leaving a timer running', () => {
    const worker = createWhatsAppWorker({
      store: fakeStore([]),
      send: async () => {},
      intervalMs: 60_000,
    });
    expect(() => worker.start()).not.toThrow();
    expect(() => worker.start()).not.toThrow(); // idempotent
    worker.stop();
    worker.stop();
  });
});




