/**
 * The WhatsApp side of dose reminders — the pure parts.
 *
 * Three jobs, none of which needs a socket:
 *   1. turn a message the user typed into an **intent** (`STOP`, `PAUSE`, a new
 *      `08:00`, `START K7M2QP`),
 *   2. turn an intent into the **state change** it implies,
 *   3. render the **text** we send back.
 *
 * Why typed words and not buttons. The reminder goes out through an unofficial
 * WhatsApp client (Evolution API), and button replies on those have been
 * unstable since WhatsApp changed the protocol. A keyword the user can type is
 * boring, works on every device, and survives that — so the design does not
 * depend on a button. `STOP` also does double duty: it is the word WhatsApp's
 * own policies expect a recipient to be able to send.
 *
 * The wording rules here are deliberate and should not be loosened:
 *   - nothing medical. No condition, no benefit, no advice. This is a personal
 *     planner, so it says "your planned time", never "take your medication".
 *   - no link in the reminder itself. One domain at most, and only when the
 *     user asked for something.
 *   - every message the user can act on says how to stop.
 *
 * Pure: no I/O, no clock, no network. `now` is always passed in.
 */

import { nextRunAt, normalizeTimes, zonedNow } from './recurrence.mjs';
import {
  DEFAULT_LANGUAGE,
  digestEntries,
  localDay,
  planChoices,
  planList,
  resolveLanguage,
  tableFor,
} from './messages.mjs';

/* ---------- limits ---------- */

export const PAIRING_CODE_LENGTH = 6;

/**
 * `A–Z` and `2–9`, without `I`, `O`, `0` or `1`.
 *
 * The code gets read off a screen and typed into WhatsApp by hand, so the four
 * characters people confuse with each other are simply not in it.
 */
export const PAIRING_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** How long an unclaimed code stays usable. */
export const PAIRING_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_LABEL_LENGTH = 60;
export const MAX_DOSE_LENGTH = 40;
export const MAX_NAME_LENGTH = 40;
/**
 * The longest message we will build.
 *
 * WhatsApp's own cap on a text message is 4096 characters; this leaves headroom.
 * It was 900, which was right when one plan meant one short message — but a
 * digest carries a whole day, and 900 would have cut a long one off mid-list.
 * Nothing is silently truncated in any case: `digestTextFor` drops entries and
 * says how many, rather than slicing the text.
 */
export const MAX_MESSAGE_LENGTH = 3_900;
export const MAX_INBOUND_LENGTH = 600;

/** Random seconds added to a send time, so a clock time is never a signature. */
export const JITTER_MAX_MS = 45_000;
/** Minimum gap between two sends, so a burst never leaves together. */
export const SEND_SPACING_MS = 3_000;
/** Most messages one tick will send, so a backlog cannot become a flood. */
export const MAX_SEND_PER_TICK = 10;
/** Consecutive failures before a reminder is parked instead of retried. */
export const MAX_FAILURES = 5;

/* ---------- pairing codes ---------- */

/** A fresh code. `random` is injectable so the tests are deterministic. */
export function generatePairingCode(random = Math.random) {
  let code = '';
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    const at = Math.floor(random() * PAIRING_CODE_ALPHABET.length);
    code += PAIRING_CODE_ALPHABET[Math.min(at, PAIRING_CODE_ALPHABET.length - 1)];
  }
  return code;
}

/**
 * A typed code, as it is stored: upper case, spaces and punctuation removed.
 * `k7m-2qp` and `K7 M2QP` both mean `K7M2QP`.
 */
export function normalizePairingCode(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Whether a string is a code this service could have issued. */
export function isPairingCode(raw) {
  const code = normalizePairingCode(raw);
  if (code.length !== PAIRING_CODE_LENGTH) return false;
  for (const character of code) {
    if (!PAIRING_CODE_ALPHABET.includes(character)) return false;
  }
  return true;
}

/**
 * The link the app puts behind "Remind me on WhatsApp".
 *
 * The user sends the first message, and this is why that matters: a number
 * writing to a stranger is the single fastest way to be reported, and a report
 * is what costs a number its Quality Rating. One tap here means they wrote to
 * us — the best opt-in proof there is — and the code they send is what ties the
 * conversation to their own plan.
 *
 * The **sync code must never appear here.** It is a ~120-bit bearer token and
 * the only credential the sync API has; a code that travels through WhatsApp is
 * not a secret any more.
 */
export function buildPairingLink({ phoneNumber, code }) {
  const digits = String(phoneNumber ?? '').replace(/[^0-9]/g, '');
  if (!digits || !isPairingCode(code)) return '';
  const text = `START ${normalizePairingCode(code)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** Trims and shortens a user-supplied field to what we are willing to store. */
export function cleanField(value, max) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** How many steps a dose timeline may hold. More than a titration could need. */
export const MAX_DOSES = 24;

/**
 * A dose timeline, reduced to what we are willing to store.
 *
 * Whole entries are dropped rather than repaired: this list ends up printed on a
 * dose line, and a half-understood entry is worse than a missing one. Sorted on
 * the way out so "the entry that applies today" needs no second pass later.
 */
export function sanitizeDoses(value) {
  if (!Array.isArray(value)) return [];
  const kept = [];
  for (const entry of value.slice(0, MAX_DOSES)) {
    if (!entry || typeof entry !== 'object') continue;
    const from = String(entry.from ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) continue;
    kept.push({
      from,
      dose: cleanField(entry.dose, MAX_DOSE_LENGTH),
      draw: cleanField(entry.draw, MAX_DOSE_LENGTH),
    });
  }
  return kept.sort((a, b) => a.from.localeCompare(b.from));
}

/**
 * The dose that applies on `iso`.
 *
 * The last step that starts on or before that day, which is the whole reason the
 * timeline travels at all: a step-up plan changes partway through, and quoting
 * the starting dose in month two would be plainly wrong. Falls back to the row's
 * single dose for a reminder written before timelines existed.
 */
export function doseOn(row, iso) {
  const timeline = Array.isArray(row?.doses) ? row.doses : [];
  let chosen = null;
  for (const entry of timeline) {
    if (typeof entry?.from !== 'string' || entry.from > iso) continue;
    if (chosen === null || entry.from > chosen.from) chosen = entry;
  }
  if (chosen) return { dose: chosen.dose ?? '', draw: chosen.draw ?? '' };
  return { dose: row?.dose ?? '', draw: row?.draw ?? '' };
}

/* ---------- what the user typed ---------- */

/**
 * The words that mean something, and the intent each one carries.
 *
 * `STOP` and `UNSUBSCRIBE` are the words a recipient is expected to be able to
 * send; the rest are conveniences. All of them are matched case-insensitively.
 */
const KEYWORDS = {
  STOP: 'stop',
  UNSUBSCRIBE: 'stop',
  CANCEL: 'stop',
  PAUSE: 'pause',
  HOLD: 'pause',
  RESUME: 'resume',
  CONTINUE: 'resume',
  STATUS: 'status',
  INFO: 'status',
  HELP: 'help',
  '?': 'help',
};

/** `HH:mm`, `H.mm`, `H am`, `HHMM` or a bare hour, as `HH:mm`. */
function parseClockTime(text) {
  let match = text.match(/^(\d{1,2})[:.](\d{2})$/);
  if (match) return clockFrom(Number(match[1]), Number(match[2]));

  match = text.match(/^(\d{1,2})\s*(AM|PM)$/);
  if (match) {
    const hour = Number(match[1]) % 12;
    return clockFrom(match[2] === 'PM' ? hour + 12 : hour, 0);
  }

  match = text.match(/^(\d{3,4})$/);
  if (match) {
    const digits = match[1].padStart(4, '0');
    return clockFrom(Number(digits.slice(0, 2)), Number(digits.slice(2)));
  }

  match = text.match(/^(\d{1,2})$/);
  if (match) return clockFrom(Number(match[1]), 0);

  return null;
}

/** `HH:mm`, or null when the pair is not a real time of day. */
function clockFrom(hour, minute) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * What a message means. Always returns an object; never throws.
 *
 *   { kind: 'stop' | 'pause' | 'resume' | 'status' | 'help' | 'ignored'
 *          | 'start' | 'time' | 'unknown', code?, time? }
 *
 * Order matters, and it is the whole subtlety of this function: keywords are
 * checked **before** codes. `STATUS` is six characters long and every letter of
 * it is in the code alphabet, so a code-first parser would read "STATUS" as a
 * pairing code and quietly try to start a protocol.
 */
export function parseIntent(rawText) {
  const raw = String(rawText ?? '').trim();
  if (raw === '') return { kind: 'ignored' };

  // One trailing full stop, comma or bang is how people finish a sentence.
  const text = raw.replace(/[.,;!]+$/, '').trim();
  const upper = text.toUpperCase();

  if (Object.prototype.hasOwnProperty.call(KEYWORDS, upper)) {
    return { kind: KEYWORDS[upper] };
  }

  // "START K7M2QP" — the wording the wa.me link pre-fills.
  const withStart = upper.match(/^START[\s:]+(.+)$/);
  if (withStart && isPairingCode(withStart[1])) {
    return { kind: 'start', code: normalizePairingCode(withStart[1]) };
  }

  // A bare code is also a start, because that is what people paste.
  if (isPairingCode(upper)) return { kind: 'start', code: normalizePairingCode(upper) };

  /*
   * "<plan> <time>" and "TIME <plan> <time>" — how a user picks one plan out of
   * several. The parser only reports what was typed; whether a plan number is
   * *needed* depends on how many plans are on, and that is the caller's call.
   */
  const indexed = upper.match(
    /^(?:TIME[\s:]+)?(\d{1,2})\s+(\d{1,2}[:.]\d{2}|\d{3,4}|\d{1,2}\s*(?:AM|PM))$/,
  );
  if (indexed) {
    const planNumber = Number(indexed[1]);
    const time = parseClockTime(indexed[2].replace(/\s+/g, ''));
    if (time && planNumber >= 1) {
      return { kind: 'time', time, planNumber };
    }
  }

  const withTime = upper.match(/^TIME[\s:]+(.+)$/);
  if (withTime) {
    const time = parseClockTime(withTime[1].replace(/\s+/g, ''));
    if (time) return { kind: 'time', time };
  }

  const time = parseClockTime(upper);
  if (time) return { kind: 'time', time };

  return { kind: 'unknown' };
}

/* ---------- what we send back ---------- */

/**
 * The one place a message is rendered, and trimmed to what WhatsApp will take.
 *
 * `key` names a message in `messages.mjs`. An unknown key or an unknown language
 * answers `''` rather than throwing: a message the server cannot word is a
 * missing sentence, not a reason to drop a reply that has already been decided.
 */
export function say(lang, key, vars = {}) {
  const build = tableFor(lang)[key];
  if (typeof build !== 'function') return '';
  return String(build(vars) ?? '').slice(0, MAX_MESSAGE_LENGTH);
}

/**
 * One reminder as the STATUS list and the "which one?" prompt want it.
 *
 * `time` is the time the *user set* on the plan, not the next run. Those differ
 * once a plan is paused, and the user typed the former — so it is the one that
 * answers "what is on?" and the one an edit changes.
 */
export function planSummary(reminder) {
  return {
    label: reminder?.label ?? '',
    dose: reminder?.dose ?? '',
    status: reminder?.status ?? 'pending',
    time: normalizeTimes(reminder?.rule?.times ?? [])[0] ?? '',
  };
}

/** Every reminder as a summary, in the order given. */
export function planSummaries(reminders) {
  return (Array.isArray(reminders) ? reminders : []).map(planSummary);
}

/* ---------- from an intent to a state change ---------- */

/** The wall-clock `HH:mm` an instant falls at, in a zone. */
export function localClock(atMs, timeZone) {
  if (atMs === null || atMs === undefined) return '';
  return zonedNow(atMs, timeZone).time;
}

/**
 * The status and the next run a reminder should be armed with, from `nowMs`.
 *
 * One place decides this, so the worker, the `START` path and the commands can
 * never disagree about whether a plan still has a dose in it.
 */
export function armAt({ rule, timeZone, nowMs }) {
  const at = rule ? nextRunAt(rule, nowMs, timeZone) : null;
  return at === null
    ? { status: 'stopped', nextRunAtMs: null }
    : { status: 'active', nextRunAtMs: at };
}

/**
 * The state change an intent implies, for a reminder **already linked** to a
 * phone number.
 *
 * Linking is deliberately not here: `START <code>` needs a database lookup, so
 * the caller performs that and only hands over a reminder that has a `phone`.
 *
 * Takes **every** reminder on the number, not one, because a number may hold
 * several plans and the commands differ in scope: `STOP` and `PAUSE` cover all
 * of them (a person who says STOP does not mean "one of them"), while a new time
 * has to say which, or ask.
 *
 * Returns `{ patches, reply }`:
 *   - `patches` is `[{ code, patch }]`, possibly empty — a question changes
 *     nothing.
 *   - `reply` is what to send back, or null when the message deserves no answer.
 *
 * The language comes from the reminders themselves, so a Slovak subscriber is
 * answered in Slovak without the caller having to remember to say so.
 */
export function applyIntent({ reminders, intent, nowMs, manageUrl = '' }) {
  const list = Array.isArray(reminders) ? reminders : reminders ? [reminders] : [];
  const lang = resolveLanguage(list[0]?.lang ?? DEFAULT_LANGUAGE);
  /*
   * What the user is being *told about*. A stopped plan is not on, so it neither
   * appears in STATUS nor takes up a number — which keeps the numbering in the
   * STATUS list and in "which one?" identical, and stops `08:00` from asking
   * about a plan the user already switched off.
   */
  const visible = list.filter((reminder) => reminder.status !== 'stopped');
  const summaries = planSummaries(visible);

  /** The same fields written to every reminder in a set. */
  const patchAll = (set, fields) => set.map((reminder) => ({ code: reminder.code, patch: fields }));

  switch (intent?.kind) {
    // Stopping is absolute and immediate, and it covers every plan on the
    // number: someone who says STOP does not mean "one of them".
    case 'stop':
      return {
        patches: patchAll(list, { status: 'stopped', nextRunAtMs: null }),
        reply: say(lang, 'stopped'),
      };

    case 'pause':
      return {
        patches: patchAll(visible, { status: 'paused', nextRunAtMs: null }),
        reply: say(lang, 'paused'),
      };

    case 'resume':
    case 'start': {
      if (list.length === 0) return { patches: [], reply: say(lang, 'notLinked', { manageUrl }) };

      const patches = [];
      let soonest = null;
      let lastLabel = '';

      for (const reminder of list) {
        const armed = armAt({ rule: reminder.rule, timeZone: reminder.timeZone, nowMs });
        patches.push({ code: reminder.code, patch: armed });
        if (armed.nextRunAtMs === null) lastLabel = reminder.label ?? '';
        else if (soonest === null || armed.nextRunAtMs < soonest.at) {
          soonest = { at: armed.nextRunAtMs, timeZone: reminder.timeZone };
        }
      }

      // Every plan is over. Say so once rather than silently doing nothing.
      if (soonest === null) {
        return { patches, reply: say(lang, 'finished', { label: lastLabel }) };
      }

      /*
       * "today at 10:00", not "10:00". A reply that says only a time is read as
       * the next one of those, which may be days away — the same mistake the
       * welcome message made.
       */
      const when = `${localDay({ atMs: soonest.at, nowMs, timeZone: soonest.timeZone, lang })} at ${localClock(soonest.at, soonest.timeZone)}`;
      const wasActive = list.length === 1 && list[0].status === 'active';
      return {
        patches,
        reply: wasActive
          ? say(lang, 'alreadyLinked', { label: list[0].label, time: when })
          : say(lang, 'resumed', { time: when }),
      };
    }

    case 'time': {
      if (list.length === 0) return { patches: [], reply: say(lang, 'notLinked', { manageUrl }) };
      if (visible.length === 0) return { patches: [], reply: say(lang, 'noPlans') };

      const which = () => ({
        patches: [],
        reply: say(lang, 'chooseWhich', { plans: planChoices(lang, summaries) }),
      });

      // With several plans on, a bare time is ambiguous. Ask which one, and show
      // the numbers — guessing would move the wrong plan's clock.
      if (visible.length > 1) {
        const index = Number(intent.planNumber) - 1;
        if (!Number.isInteger(index) || index < 0 || index >= visible.length) return which();
      }

      const chosen = visible.length > 1 ? visible[Number(intent.planNumber) - 1] : visible[0];
      if (!chosen.rule) return { patches: [], reply: say(lang, 'badCode') };

      const updated = { ...chosen.rule, times: [intent.time] };
      const armed = armAt({ rule: updated, timeZone: chosen.timeZone, nowMs });
      const patch = { ...armed, rule: updated };

      if (armed.nextRunAtMs === null) {
        return {
          patches: [{ code: chosen.code, patch }],
          reply: say(lang, 'finished', { label: chosen.label }),
        };
      }
      return {
        patches: [{ code: chosen.code, patch }],
        reply: say(lang, 'timeChanged', { time: intent.time, label: chosen.label }),
      };
    }

    case 'status':
      if (visible.length === 0) return { patches: [], reply: say(lang, 'noPlans') };
      return {
        patches: [],
        reply: say(lang, 'status', { plans: planList(lang, summaries), count: visible.length }),
      };

    case 'help':
    case 'unknown':
      return { patches: [], reply: say(lang, 'help', { manageUrl }) };

    case 'ignored':
    default:
      return { patches: [], reply: null };
  }
}

/* ---------- sending politely ---------- */

/**
 * A due dose, nudged by up to 45 seconds.
 *
 * Not a cosmetic detail. Sending every subscriber at exactly `08:00:00` is a
 * pattern, and patterns are what gets a number flagged. The ceiling is under a
 * minute on purpose: the jittered instant still falls inside the dose's own
 * minute, so it can never roll into the next one and change which dose it is.
 */
export function withJitter(atMs, random = Math.random) {
  return atMs + Math.floor(random() * JITTER_MAX_MS);
}

/** How long to wait before the `index`-th send of a tick. */
export function spacingDelay(index, random = Math.random) {
  if (index <= 0) return 0;
  return index * SEND_SPACING_MS + Math.floor(random() * SEND_SPACING_MS);
}

/**
 * Whether a reminder has failed enough times to be parked.
 *
 * The alternative — retrying a number forever — is the other thing that gets a
 * sender flagged, and it hides a broken setup behind a log nobody reads.
 */
export function shouldPark(failures) {
  return Number(failures ?? 0) >= MAX_FAILURES;
}

/**
 * Whether a send failure is the *reminder's* fault, and worth giving up on.
 *
 * A 4xx means this number or this message is wrong, and it will be just as wrong
 * in two minutes — park it and stop. Anything else (5xx, a timeout, a refused
 * connection) means the gateway is unavailable, and no subscriber should lose
 * their reminders because the gateway had a bad ten minutes.
 *
 * This distinction was missing at first, and it was a real bug: a 10-minute
 * outage is twenty worker ticks, which is five failures, which parked every
 * reminder for every user — permanently, from a temporary problem.
 */
export function isPermanentFailure(error) {
  const match = /whatsapp_send_failed (\d{3})/.exec(String(error?.message ?? ''));
  if (!match) return false;
  const status = Number(match[1]);
  return status >= 400 && status < 500;
}

/** How long a failed send waits before it is tried again. */
export const FAILURE_BACKOFF_MS = 2 * 60 * 1000;

/**
 * The digest for one phone number, for one local day.
 *
 * One message, not one per plan. A person taking three things at three times
 * wants one list to read, not three notifications to dismiss — and the list
 * tells them how the day is shaped, which a single line never can.
 *
 * `rows` is every plan due on the same local day for the same number. The
 * language is taken from the first row; they always agree, because one device
 * pushes them all and it pushes them in the language it is showing.
 */
export function digestTextFor(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const lang = rows[0].lang;
  const entries = rows.map((row) => {
    // The day this dose falls on, in its own zone — which is also the day the
    // whole group shares, so a timeline can be asked for the right step.
    const atMs = Number(row.nextRunAtMs);
    const date = Number.isFinite(atMs) ? zonedNow(atMs, row.timeZone || 'UTC').iso : '';
    const picked = doseOn(row, date);
    return {
      time: localClock(row.nextRunAtMs, row.timeZone),
      // So the digest can divide by person when more than one is on the device.
      person: row.person,
      label: row.label,
      dose: picked.dose,
      draw: picked.draw,
    };
  });
  /*
   * Fit the message to what one can hold, and say what was left out.
   *
   * Dropping entries is a last resort — a day with that many doses is a very
   * long day — but the alternative is worse. `say` slices to the length limit,
   * so a digest that did not fit would lose its tail silently, and the tail is
   * somebody's evening dose.
   */
  const build = (kept, more) => say(lang, 'digest', { entries: digestEntries(lang, kept), more });

  let kept = entries;
  let text = build(kept, 0);
  while (kept.length > 1 && text.length >= MAX_MESSAGE_LENGTH) {
    kept = kept.slice(0, -1);
    text = build(kept, entries.length - kept.length);
  }
  return text;
}

/**
 * The due rows gathered into one group per number per local day.
 *
 * The **day** is what makes this correct rather than merely tidy. A plan at
 * 23:50 and one at 00:10 are different days, and collapsing them by number alone
 * would put tomorrow's dose into today's list — the one mistake a digest can
 * make that a user cannot see coming.
 *
 * `allForPhone` is injected so this is testable without a database, the same
 * reason `store` and `send` are.
 */
export function digestGroups(dueRows, allForPhone) {
  const groups = [];
  const seen = new Set();

  for (const due of dueRows) {
    if (!due?.phone) continue;
    const atMs = Number(due.nextRunAtMs);
    if (!Number.isFinite(atMs)) continue;
    const day = zonedNow(atMs, due.timeZone || 'UTC').iso;

    const key = `${due.phone}|${day}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const members = (allForPhone(due.phone) ?? [])
      .filter((row) => row?.status === 'active' && row.nextRunAtMs !== null)
      .filter((row) => Number.isFinite(Number(row.nextRunAtMs)))
      .filter((row) => zonedNow(Number(row.nextRunAtMs), row.timeZone || 'UTC').iso === day)
      .sort((a, b) => Number(a.nextRunAtMs) - Number(b.nextRunAtMs));

    // A group with nothing in it would be a digest of nothing. `due` itself is
    // always in its own day, so this only guards against a surprising store.
    if (members.length > 0) groups.push(members);
  }

  return groups;
}

/**
 * The clock that turns a stored rule into a delivered message.
 *
 * The same shape as `createPushScheduler` in `push.mjs`, and injected for the
 * same reason: `store` and `send` are handed in, so the whole of this is
 * testable without a socket, a timer, or a running WhatsApp instance.
 *
 * What it deliberately does **not** do:
 *   - it does not send everything at once. Sends are spaced (`spacingDelay`) and
 *     capped per tick (`MAX_SEND_PER_TICK`), because a backlog leaving together
 *     is a burst, and a burst is what a number gets flagged for.
 *   - it does not drop a dose on a transient failure. The row is retried after
 *     `FAILURE_BACKOFF_MS`, and only a run of `MAX_FAILURES` parks it.
 *   - it does not send a "plan finished" message. The last dose's own reminder
 *     goes out, and then the row stops. One fewer unprompted message is one
 *     fewer worth reporting.
 *
 * `store` must offer:
 *   - `due(nowIso)` -> [{ code, phone, label, dose, draw, rule, timeZone, nextRunAtMs, failures }]
 *   - `forPhone(phone)` -> every plan that number holds, so the digest can cover
 *     the whole day rather than only the minute that just arrived
 *   - `save(code, patch)`
 */
export function createWhatsAppWorker({
  store,
  send,
  canSend = () => true,
  now = () => Date.now(),
  intervalMs = 30_000,
  random = Math.random,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onError = () => {},
  onSent = () => {},
}) {
  let timer = null;

  async function tick() {
    /*
     * A link we already know is down is not a reason to charge a failure to
     * every subscriber. Skip the tick and wait for it to come back — the rows
     * keep their armed time, so nothing is lost by waiting.
     */
    if (!canSend()) return;

    const nowMs = now();
    let rows;
    try {
      rows = store.due(new Date(nowMs).toISOString());
    } catch (error) {
      onError(error);
      return;
    }

    // `Number(null)` is 0, not NaN — so a row with no armed time would look due
    // at the epoch and be sent. Every parked or stopped row has one. The
    // `atMs <= nowMs` test is a second defence behind the store's own query:
    // nothing that is not yet due goes out, even if that query is ever wrong.
    const due = rows.filter((row) => {
      if (!row?.phone || row.nextRunAtMs === null || row.nextRunAtMs === undefined) return false;
      const atMs = Number(row.nextRunAtMs);
      return Number.isFinite(atMs) && atMs <= nowMs;
    });

    /*
     * One message per number per local day, not one per plan.
     *
     * `store.due` only knows what is due *this minute*, so the rest of the day
     * has to be pulled in: for each number with something due, every plan it
     * holds is read and the ones falling on the same local day are gathered into
     * one group. A later plan is then advanced **without a message of its own**
     * — that is the whole point, and why the advance below runs over the group.
     */
    const groups = digestGroups(due, (phone) => store.forPhone(phone)).slice(0, MAX_SEND_PER_TICK);

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const phone = group[0].phone;

      const delay = spacingDelay(index, random);
      if (delay > 0) await sleep(delay);

      try {
        await send(phone, digestTextFor(group));

        for (const member of group) {
          const atMs = Number(member.nextRunAtMs);
          const next = nextRunAt(member.rule, atMs, member.timeZone);
          store.save(member.code, {
            // Past the end of the plan: the last dose has now been reminded, so
            // there is nothing left to arm.
            status: next === null ? 'stopped' : 'active',
            nextRunAtMs: next === null ? null : withJitter(next, random),
            failures: 0,
          });
        }
        onSent(group[0]);
      } catch (error) {
        // The failure belongs to the message, so every plan inside it backs off
        // together. Backing off only the first would quietly drop the rest of
        // the day's doses.
        for (const member of group) {
          const atMs = Number(member.nextRunAtMs);
          const failures = Number(member.failures ?? 0) + 1;
          // Park only what deserves parking. A gateway outage must not be
          // allowed to switch off somebody's reminders.
          if (isPermanentFailure(error) && shouldPark(failures)) {
            store.save(member.code, { status: 'error', failures, nextRunAtMs: null });
          } else {
            // Keep the dose and try again shortly; an outage must not lose it.
            store.save(member.code, { failures, nextRunAtMs: atMs + FAILURE_BACKOFF_MS });
          }
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




