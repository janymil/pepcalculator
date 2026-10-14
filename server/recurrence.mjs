/**
 * When the next dose falls — the server's copy of the app's schedule rules.
 *
 * Why this file exists at all. Web Push never needed it: the app rendered every
 * future notification and uploaded the finished text, so the server only had to
 * compare timestamps. WhatsApp needs the opposite. A reminder has to keep
 * arriving when the app has not been opened for weeks, so the server must be
 * able to answer "when is this plan's next dose?" on its own. That means the
 * rule travels instead of the rendered queue.
 *
 * The rules here are a deliberate mirror of `src/lib/schedule.ts` and its
 * `src/lib/dates.ts` helpers. Two implementations of the same maths is a real
 * risk, so it is not left to trust: `recurrence.test.mjs` imports **both** this
 * file and the TypeScript original and asserts they return the same answer for
 * the same schedule, across every cadence the app can produce. If the app's
 * rules ever change, that test fails and says so.
 *
 * Two clocks, kept apart on purpose:
 *   - `nextDose` works in the user's **wall clock** (`yyyy-mm-dd` + `HH:mm`) —
 *     the times a person set on their own phone.
 *   - `nextRunAt` converts that wall clock to an **absolute UTC instant** using
 *     the subscriber's IANA zone, which is what a scheduler compares against.
 *
 * Pure: no I/O, no timers, and `now` is always passed in.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ---------- date helpers (mirror of src/lib/dates.ts) ---------- */

/**
 * A Date's local date as `yyyy-mm-dd`.
 *
 * Built from the local parts rather than UTC on purpose: it is the same
 * construction `src/lib/dates.ts` uses, and the agreement test depends on the
 * two producing identical strings. Noon is the pivot (see `parseIsoDate`).
 */
export function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses `yyyy-mm-dd` into a local noon Date, avoiding DST/UTC edge cases. */
export function parseIsoDate(iso) {
  const parts = String(iso).split('-').map(Number);
  const year = parts[0] || 1970;
  const month = parts[1] || 1;
  const day = parts[2] || 1;
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** Returns `iso` shifted by `days`. */
export function addDays(iso, days) {
  const date = parseIsoDate(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Returns `iso` shifted by whole months, clamping to the last day of the month. */
export function addMonths(iso, months) {
  const date = parseIsoDate(iso);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(day, daysInMonth));
  return toIsoDate(date);
}

/** Whole days from `from` to `to` (negative when `to` is in the past). */
export function daysBetween(from, to) {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY);
}

/** Day of week for `iso`: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso) {
  return parseIsoDate(iso).getDay();
}

/* ---------- the schedule rules (mirror of src/lib/schedule.ts) ---------- */

/** How far ahead we search for the next dose before giving up. */
export const SEARCH_HORIZON_DAYS = 400;

/** Longest gap an interval schedule may declare. */
export const MAX_INTERVAL_DAYS = 30;

/** Most clock times a single day may hold — the app draws four at most. */
export const MAX_TIMES_PER_DAY = 4;

/** Valid, de-duplicated, ascending `HH:mm` times. */
export function normalizeTimes(times) {
  const list = Array.isArray(times) ? times : [];
  const valid = list
    .map((time) => String(time).trim())
    .filter((time) => /^\d{1,2}:\d{2}$/.test(time))
    .map((time) => (time.length === 4 ? `0${time}` : time))
    .slice(0, MAX_TIMES_PER_DAY);
  return Array.from(new Set(valid)).sort();
}

/**
 * The interval in whole days, or 0 when the schedule's value is unusable.
 * Kept separate so `isDoseDay` and the app agree on what counts as valid.
 */
export function intervalOf(rule) {
  const days = Math.round(rule?.intervalDays ?? 0);
  return days >= 1 && days <= MAX_INTERVAL_DAYS ? days : 0;
}

/** Last day of the plan (inclusive), or null when the plan is ongoing. */
export function planEndDate(rule) {
  if (rule.durationUnit === 'ongoing' || rule.durationValue <= 0) return null;
  if (rule.durationUnit === 'weeks') {
    return addDays(rule.startsOn, rule.durationValue * 7 - 1);
  }
  return addDays(addMonths(rule.startsOn, rule.durationValue), -1);
}

/** Whether a dose is scheduled on the given date. */
export function isDoseDay(rule, iso) {
  if (iso < rule.startsOn) return false;
  const end = planEndDate(rule);
  if (end !== null && iso > end) return false;

  if (rule.repeat === 'weekdays') {
    const weekdays = Array.isArray(rule.weekdays) ? rule.weekdays : [];
    if (weekdays.length === 0) return false;
    return weekdays.includes(weekdayOf(iso));
  }

  if (rule.repeat === 'interval') {
    const step = intervalOf(rule);
    // A broken or missing interval must never hide the whole plan, so anything
    // under two days simply means "every day".
    if (step < 2) return true;
    return daysBetween(rule.startsOn, iso) % step === 0;
  }

  return true;
}

/** The times scheduled on a date (empty when it is not a dose day). */
export function timesOnDay(rule, iso) {
  return isDoseDay(rule, iso) ? normalizeTimes(rule.times) : [];
}

/**
 * The next scheduled dose at or after the given moment (null once the plan ends).
 *
 * Inclusive of `nowTime` itself, exactly like the app's `nextDose`: a reminder
 * set for 08:00 that is computed at precisely 08:00 still has a dose to send.
 */
export function nextDose(rule, nowIso, nowTime) {
  const times = normalizeTimes(rule.times);
  if (times.length === 0) return null;

  const end = planEndDate(rule);
  let cursor = nowIso < rule.startsOn ? rule.startsOn : nowIso;

  for (let i = 0; i < SEARCH_HORIZON_DAYS; i += 1) {
    if (end !== null && cursor > end) return null;

    if (isDoseDay(rule, cursor)) {
      const isToday = cursor === nowIso;
      for (const time of times) {
        if (!isToday || time >= nowTime) return { date: cursor, time };
      }
    }

    cursor = addDays(cursor, 1);
  }

  return null;
}

/**
 * True once the plan's last day has passed. An ongoing plan is never finished,
 * which is the whole point of allowing one.
 */
export function isPlanFinished(rule, nowIso) {
  const end = planEndDate(rule);
  return end !== null && nowIso > end;
}

/* ---------- validation: the rule arrives over the wire ---------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REPEATS = ['daily', 'weekdays', 'interval'];
const DURATION_UNITS = ['weeks', 'months', 'ongoing'];

/**
 * Whether a client-supplied rule can be trusted to drive a scheduler.
 *
 * The rule is the only thing the server needs to keep reminding forever, so a
 * malformed one would either loop or stop silently. Rejecting it at the edge is
 * cheaper than discovering it three weeks later in a log.
 */
export function isValidRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (typeof rule.startsOn !== 'string' || !ISO_DATE.test(rule.startsOn)) return false;
  if (!REPEATS.includes(rule.repeat)) return false;
  if (!DURATION_UNITS.includes(rule.durationUnit)) return false;
  if (typeof rule.durationValue !== 'number' || !Number.isFinite(rule.durationValue)) return false;
  if (rule.durationValue < 0 || rule.durationValue > 520) return false;
  if (normalizeTimes(rule.times).length === 0) return false;
  if (rule.repeat === 'interval' && intervalOf(rule) === 0) return false;
  if (rule.repeat === 'weekdays' && usableWeekdays(rule).length === 0) return false;
  return true;
}

/** The weekdays a rule may legitimately name: integers 0–6, de-duplicated. */
export function usableWeekdays(rule) {
  const weekdays = Array.isArray(rule?.weekdays) ? rule.weekdays : [];
  return Array.from(
    new Set(weekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)),
  ).sort();
}

/**
 * The rule reduced to the fields that are allowed to reach the database.
 * Anything else the client sent is dropped rather than stored.
 */
export function sanitizeRule(rule) {
  if (!isValidRule(rule)) return null;
  return {
    times: normalizeTimes(rule.times),
    repeat: rule.repeat,
    weekdays: rule.repeat === 'weekdays' ? usableWeekdays(rule) : [],
    intervalDays: rule.repeat === 'interval' ? intervalOf(rule) : 0,
    startsOn: rule.startsOn,
    durationValue: Math.round(rule.durationValue),
    durationUnit: rule.durationUnit,
  };
}

/* ---------- wall clock -> absolute instant ---------- */

const formatters = new Map();

function formatterFor(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      // `h23` rather than `hour12: false`: the latter can render midnight as
      // "24", which would put every 00:00 dose on the wrong day.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function partsToMap(utcMs, timeZone) {
  const parts = formatterFor(timeZone).formatToParts(new Date(utcMs));
  const map = {};
  for (const part of parts) map[part.type] = part.value;
  return map;
}

/** True when `Intl` recognises the zone. Guards a bad client value. */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    formatterFor(timeZone);
    return true;
  } catch {
    formatters.delete(timeZone);
    return false;
  }
}

/**
 * The zone's offset from UTC, in minutes, at a given instant.
 *
 * Read out of `Intl` rather than stored, so a DST change is handled by the
 * platform's own tz database instead of a table we would have to maintain.
 * Positive east of Greenwich.
 */
export function offsetMinutesAt(utcMs, timeZone) {
  const parts = partsToMap(utcMs, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  // `formatToParts` has second resolution, so compare against a whole second.
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/**
 * A wall-clock `yyyy-mm-dd` + `HH:mm` in `timeZone`, as an absolute instant.
 *
 * Two passes, because the offset depends on the instant we are trying to find:
 * the first assumes UTC, the second corrects with the offset that actually
 * applies at the candidate moment. That is what makes a dose time land on the
 * right side of a DST change.
 */
export function zonedTimeToUtc(iso, time, timeZone) {
  const [year, month, day] = String(iso).split('-').map(Number);
  const [hour, minute] = String(time).split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  const firstGuess = offsetMinutesAt(naive, timeZone);
  const secondGuess = offsetMinutesAt(naive - firstGuess * 60000, timeZone);
  return naive - secondGuess * 60000;
}

/** The wall clock in `timeZone` right now, as `{ iso, time }`. */
export function zonedNow(utcMs, timeZone) {
  const parts = partsToMap(utcMs, timeZone);
  const hour = String(parts.hour).padStart(2, '0');
  const minute = String(parts.minute).padStart(2, '0');
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${hour}:${minute}`,
  };
}

/** `HH:mm` one minute later, rolling into the next hour. */
function addOneMinute(time) {
  const [hour, minute] = String(time).split(':').map(Number);
  const total = hour * 60 + minute + 1;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The absolute instant of a plan's next dose, or null when the plan is over.
 *
 * `strictlyAfterMs` is what keeps the scheduler from sending the same dose
 * twice: after a successful send the caller asks for the occurrence strictly
 * after the one it just delivered.
 */
export function nextRunAt(rule, strictlyAfterMs, timeZone) {
  if (!isValidTimeZone(timeZone)) return null;

  const { iso, time } = zonedNow(strictlyAfterMs, timeZone);
  const slot = nextDose(rule, iso, time);
  if (!slot) return null;

  const at = zonedTimeToUtc(slot.date, slot.time, timeZone);
  // `nextDose` is inclusive, so an exact hit would otherwise fire forever.
  if (at > strictlyAfterMs) return at;

  const nudged = nextDose(rule, iso, addOneMinute(time));
  if (!nudged) return null;
  const later = zonedTimeToUtc(nudged.date, nudged.time, timeZone);
  return later > strictlyAfterMs ? later : null;
}

