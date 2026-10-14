/**
 * WhatsApp reminders — the browser side.
 *
 * The same shape as `lib/push.ts`: guarded, injectable `fetch`, and nothing
 * here ever throws at a render. What differs is **what travels**.
 *
 * Push uploads a queue of *already-rendered* notifications, because the app can
 * work out every dose ahead of time and the server only has to compare
 * instants. WhatsApp uploads the **rule** instead — "every day at 08:00" — and
 * the server works each next dose out for itself (`server/recurrence.mjs`).
 * That is the difference between a reminder that goes quiet after 60 days and
 * one that keeps arriving for as long as the plan does, because it needs no app
 * to be opened.
 *
 * The sync code travels as its SHA-256 hash and never as itself, exactly as it
 * does for sync and push — and it must never appear in the `wa.me` link either.
 */

import type { VialSchedule } from './schedule';
import { hashSyncCode } from './sync';

export type WhatsappFailure = 'no-code' | 'not-configured' | 'network' | 'server' | 'invalid';

export type WhatsappOutcome<T> = { ok: true; value: T } | { ok: false; reason: WhatsappFailure };

/**
 * A schedule as the server stores it.
 *
 * Deliberately only the fields that decide *when*: titration phases change the
 * dose, and a reminder never needs the dose to work out the next time. Sending
 * them would be handing the server a plan it cannot act on.
 */
export interface WhatsappRule {
  times: string[];
  repeat: 'daily' | 'weekdays' | 'interval';
  weekdays: number[];
  intervalDays: number;
  startsOn: string;
  durationValue: number;
  durationUnit: 'weeks' | 'months' | 'ongoing';
}

/** What the server hands back when a plan is created or refreshed. */
export interface WhatsappPairing {
  code: string;
  link: string;
  expiresAt: string;
  status: string;
  linked: boolean;
  /** Digits only. Shown as text, for a phone that will not open the link. */
  whatsappNumber: string;
}

/**
 * One dose of a plan, as a date it starts applying from.
 *
 * A step-up (titration) plan changes dose partway through, and the reminder goes
 * on arriving whether or not the app is ever opened again. So the whole timeline
 * travels, not just today's number: a single dose would quote the starting dose
 * for the rest of the plan, which in month two is simply the wrong amount.
 */
export interface WhatsappDose {
  /** `yyyy-mm-dd` this dose applies from, inclusive. */
  from: string;
  /** e.g. `50 mg`. */
  dose: string;
  /** e.g. `Draw to 20 units`, or '' when it cannot be worked out. */
  draw: string;
}

/**
 * One vial's plan, as it is sent.
 *
 * `id` is the app's own id for the vial, and it is what makes a re-push an
 * update rather than a new reminder: the server keys on it, so editing a plan
 * keeps the pairing code the user is already holding.
 */
export interface WhatsappPlan {
  id: string;
  label: string;
  /** The person the vial is for; '' for the device's own owner. */
  person: string;
  doses: WhatsappDose[];
  rule: WhatsappRule;
}
/** One stored reminder, as the settings panel shows it. */
export interface WhatsappReminder {
  code: string;
  /** The app's id for the vial this belongs to, so a re-push finds it again. */
  slot: string;
  /**
   * The tap-to-start link, built by the server from the stored code.
   *
   * It comes down with every read rather than being kept from the PUT that
   * created the reminder, so a reloaded page still has one to offer. Without it
   * a created-but-unclaimed reminder had no way in at all.
   */
  link: string;
  label: string;
  dose: string;
  /** What to draw, as the app worded it. Empty when it could not be worked out. */
  draw: string;
  /** Whose vial it is; '' for the device's own owner. */
  person: string;
  doses: WhatsappDose[];
  status: string;
  linked: boolean;
  nextRunAt: string | null;
  /** What the server is actually working from. Null on an older server. */
  rule: WhatsappRule | null;
  timeZone: string;
  /** The language the reminder is stored in, so a change can be noticed. */
  lang: string;
}

/** The whole channel for this device: what is stored, and the number behind it. */
export interface WhatsappChannel {
  reminders: WhatsappReminder[];
  /** Digits only, as the server holds it. `formatWhatsappNumber` adds the `+`. */
  whatsappNumber: string;
}

/**
 * A phone number as a person writes it.
 *
 * The server stores digits because that is what a `wa.me` link needs, and this
 * is the one place that turns it back into something a human recognises. A
 * number shown as `16728899397` reads as a mistake; `+16728899397` reads as a
 * phone number, and it is what the user has to type if the link will not open.
 */
export function formatWhatsappNumber(digits: string): string {
  const trimmed = String(digits ?? '').trim();
  if (trimmed === '') return '';
  return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
}

/**
 * One canonical string for "what this plan is".
 *
 * The whole point is that the app and the server can be compared with `!==`.
 * Times and weekdays are **sorted** first, because the server normalises them
 * and the app may not: `20:00,08:00` and `08:00,20:00` are the same plan, and a
 * signature that said otherwise would re-upload on every render, for ever.
 */
export function planSignature(parts: {
  label: string;
  person: string;
  doses: WhatsappDose[];
  rule: WhatsappRule | null;
}): string {
  const rule = parts.rule;
  if (!rule) return '';
  return [
    parts.label.trim(),
    parts.person.trim(),
    (parts.doses ?? []).map((dose) => `${dose.from}:${dose.dose}:${dose.draw}`).join(';'),
    [...(rule.times ?? [])].sort().join(','),
    rule.repeat,
    [...(rule.weekdays ?? [])].sort((a, b) => a - b).join(','),
    rule.intervalDays ?? 0,
    rule.startsOn,
    rule.durationValue,
    rule.durationUnit,
  ].join('|');
}

/**
 * Whether the reminder the server holds no longer matches the plan on screen.
 *
 * This is what keeps the two in step. The app is where a protocol is edited —
 * the times, the days, the duration, the dose — so a change there has to reach
 * the server, or the reminder keeps firing on the old schedule for ever and
 * nothing anywhere says so.
 *
 * Note what it does **not** do: it does not compare on every open. A plan that
 * has not changed is left alone, so a time the user set by typing `09:30` into
 * WhatsApp survives opening the app. Only a real difference triggers an upload.
 */
export function reminderIsStale(
  plan: WhatsappPlan | null,
  reminder: WhatsappReminder | null,
  lang: string,
): boolean {
  // Only a linked reminder is worth correcting: an unclaimed code has no
  // subscriber to send to yet.
  if (!plan || !reminder || !reminder.linked) return false;
  // Linked, but the server did not tell us its rule: assume the worst and
  // re-upload. Being wrong this way costs one request; being wrong the other way
  // costs a wrong reminder every day.
  if (!reminder.rule) return true;
  /*
   * And a reminder written in a different language is out of date too.
   *
   * Every word of the message comes from the language stored on the row, and a
   * plan edit is the only other thing that would ever refresh it — so without
   * this, switching the app to Spanish would leave that person's reminders in
   * English for ever, with nothing anywhere to say so.
   */
  if (reminder.lang && reminder.lang !== lang) return true;
  return planSignature(plan) !== planSignature(reminder);
}

/** The zone the browser reports, or '' when it will not say. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/** A saved schedule reduced to the rule the server stores. */
export function ruleFromSchedule(schedule: VialSchedule): WhatsappRule {
  return {
    times: schedule.times,
    repeat: schedule.repeat,
    weekdays: schedule.weekdays,
    intervalDays: schedule.intervalDays ?? 0,
    startsOn: schedule.startsOn,
    durationValue: schedule.durationValue,
    durationUnit: schedule.durationUnit,
  };
}

function trimmedBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * The URL for this device's reminders — the same hashed identity sync and push
 * use, so there is no second thing to create and no code in the URL.
 */
async function remindersUrl(baseUrl: string, code: string): Promise<string | null> {
  if (!baseUrl.trim()) return null;
  try {
    return `${trimmedBase(baseUrl)}/api/wa/${await hashSyncCode(code)}`;
  } catch {
    // `crypto.subtle` needs a secure context; a plain-http LAN phone has none.
    return null;
  }
}

/** A stored rule, or null when it is not shaped like one. */
function asRule(value: unknown): WhatsappRule | null {
  if (!value || typeof value !== 'object') return null;
  const rule = value as Record<string, unknown>;
  if (!Array.isArray(rule.times) || typeof rule.repeat !== 'string') return null;
  if (typeof rule.durationUnit !== 'string' || typeof rule.startsOn !== 'string') return null;
  return {
    times: rule.times.filter((time): time is string => typeof time === 'string'),
    repeat: rule.repeat as WhatsappRule['repeat'],
    weekdays: Array.isArray(rule.weekdays)
      ? rule.weekdays.filter((day): day is number => typeof day === 'number')
      : [],
    intervalDays: typeof rule.intervalDays === 'number' ? rule.intervalDays : 0,
    startsOn: rule.startsOn,
    durationValue: typeof rule.durationValue === 'number' ? rule.durationValue : 0,
    durationUnit: rule.durationUnit as WhatsappRule['durationUnit'],
  };
}

/** A dose timeline, or [] when it is not shaped like one. */
function asDoses(value: unknown): WhatsappDose[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
    .map((row) => ({
      from: typeof row.from === 'string' ? row.from : '',
      dose: typeof row.dose === 'string' ? row.dose : '',
      draw: typeof row.draw === 'string' ? row.draw : '',
    }));
}

/** Keeps only records shaped like a reminder, so a surprise cannot reach the UI. */
function sanitize(rows: unknown[]): WhatsappReminder[] {
  const kept: WhatsappReminder[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (typeof record.code !== 'string') continue;
    kept.push({
      code: record.code,
      slot: typeof record.slot === 'string' ? record.slot : '',
      link: typeof record.link === 'string' ? record.link : '',
      label: typeof record.label === 'string' ? record.label : '',
      dose: typeof record.dose === 'string' ? record.dose : '',
      draw: typeof record.draw === 'string' ? record.draw : '',
      person: typeof record.person === 'string' ? record.person : '',
      doses: asDoses(record.doses),
      status: typeof record.status === 'string' ? record.status : 'pending',
      linked: record.linked === true,
      nextRunAt: typeof record.nextRunAt === 'string' ? record.nextRunAt : null,
      rule: asRule(record.rule),
      timeZone: typeof record.timeZone === 'string' ? record.timeZone : '',
      lang: typeof record.lang === 'string' ? record.lang : '',
    });
  }
  return kept;
}

/** Creates or refreshes the reminder for a plan, and returns the tap-to-start link. */
export async function saveWhatsappReminder(
  baseUrl: string,
  syncCode: string,
  body: {
    code?: string;
    /** The app's own id for the vial, so a re-push updates one row. */
    slot: string;
    label: string;
    /** Whose vial it is; '' for the device's own owner. */
    person: string;
    /**
     * Today's dose and draw. Sent as well as the timeline, so a server built
     * before `doses` existed still has something to print.
     */
    dose: string;
    draw: string;
    /** The whole dose timeline, so a step-up plan stays right over time. */
    doses: WhatsappDose[];
    rule: WhatsappRule;
    timeZone: string;
    /** So the reminder comes back in the language the app is showing. */
    lang: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsappOutcome<WhatsappPairing>> {
  const url = await remindersUrl(baseUrl, syncCode);
  if (url === null) return { ok: false, reason: 'no-code' };

  try {
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // 503 is the server saying "no WhatsApp is configured here". Saying so is
    // the point: it is the difference between a button that does nothing and a
    // button that explains itself.
    if (response.status === 503) return { ok: false, reason: 'not-configured' };
    if (!response.ok) return { ok: false, reason: 'server' };

    const parsed = (await response.json()) as Partial<WhatsappPairing>;
    if (typeof parsed?.code !== 'string' || typeof parsed?.link !== 'string') {
      return { ok: false, reason: 'invalid' };
    }
    return {
      ok: true,
      value: {
        code: parsed.code,
        link: parsed.link,
        expiresAt: String(parsed.expiresAt ?? ''),
        status: String(parsed.status ?? 'pending'),
        linked: parsed.linked === true,
        whatsappNumber: String(parsed.whatsappNumber ?? ''),
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** What is currently on for this device, and the number reminders come from. */
export async function fetchWhatsappReminders(
  baseUrl: string,
  syncCode: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WhatsappOutcome<WhatsappChannel>> {
  const url = await remindersUrl(baseUrl, syncCode);
  if (url === null) return { ok: false, reason: 'no-code' };

  try {
    const response = await fetchImpl(url);
    if (response.status === 503) return { ok: false, reason: 'not-configured' };
    if (!response.ok) return { ok: false, reason: 'server' };

    const parsed = (await response.json()) as { reminders?: unknown; whatsappNumber?: unknown };
    return {
      ok: true,
      value: {
        reminders: Array.isArray(parsed?.reminders) ? sanitize(parsed.reminders) : [],
        whatsappNumber: typeof parsed?.whatsappNumber === 'string' ? parsed.whatsappNumber : '',
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Turns reminders off. One vial with `slot`, or all of them without. */
export async function removeWhatsappReminder(
  baseUrl: string,
  syncCode: string,
  options: { slot?: string; fetchImpl?: typeof fetch } = {},
): Promise<WhatsappOutcome<true>> {
  const url = await remindersUrl(baseUrl, syncCode);
  if (url === null) return { ok: false, reason: 'no-code' };

  // No `slot` means every vial — the "turn it off" button. A `slot` removes just
  // that vial's reminder, which is what deleting a vial has to do: the other
  // vials keep theirs.
  const target = options.slot ? `${url}?slot=${encodeURIComponent(options.slot)}` : url;
  const fetchImpl = options.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(target, { method: 'DELETE' });
    return response.ok ? { ok: true, value: true } : { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

