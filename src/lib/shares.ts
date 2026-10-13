/**
 * Vial sharing — more than one person drawing from the same bottle.
 *
 * A saved vial is **one bottle**: the powder, the water, the strength and the
 * beyond-use date are the same for everybody, and only the person who mixed it
 * edits them. What is *not* necessarily the same is how each person uses it —
 * the dose, the days and the duration may all differ.
 *
 * So the model has two halves:
 *   - the **bottle**, which lives on the vial itself;
 *   - a **plan per person** — the vial's own `doseAmount`/`schedule` for its
 *     owner, and one `VialShare` for everybody else.
 *
 * A share carries the day it starts (`from`), because sharing rarely begins the
 * day the powder was mixed: someone joins a vial that is already in use. It may
 * also carry its own dose and its own cadence; when either is absent that person
 * simply follows the owner's plan, which is exactly why every record saved
 * before sharing existed keeps behaving as it did.
 *
 * Pure module: no React, no DOM, no storage, and no clock of its own.
 */

import { DOSE_UNITS, isPositive, type DoseUnit } from './calc';
import { vialOwnerId } from './owners';
import type { VialSchedule } from './schedule';

export interface VialShare {
  /** The other person drawing from this vial — never its owner. */
  ownerId: string;
  /** `yyyy-mm-dd`: the first day *they* draw from it. */
  from: string;
  /** Their dose, when it differs from the vial's own. Absent → the vial's dose. */
  doseAmount?: number;
  doseUnit?: DoseUnit;
  /**
   * Their cadence, when it differs. Its `startsOn` is always the same day as
   * `from`, so the two can never disagree about when sharing began.
   */
  schedule?: VialSchedule;
}

/** Everything a vial has to expose for sharing to be resolved. */
export interface ShareableVial {
  ownerId?: string;
  reconstitutedOn: string;
  doseAmount: number;
  doseUnit: DoseUnit;
  /** The owner's own plan. */
  schedule?: VialSchedule;
  shares?: VialShare[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when a value is a usable `yyyy-mm-dd` day. */
export function isShareDate(value: unknown): value is string {
  return typeof value === 'string' && DAY_RE.test(value.trim());
}

/** A usable day, or `fallback` when the value is missing or malformed. */
function day(value: unknown, fallback: string): string {
  return isShareDate(value) ? value.trim() : fallback;
}

/**
 * Sharing cannot start before the powder was mixed, so a date that predates the
 * vial is pulled forward rather than counting doses nobody could have drawn.
 */
function notBefore(from: string, reconstitutedOn: string): string {
  if (!isShareDate(reconstitutedOn)) return from;
  return from < reconstitutedOn ? reconstitutedOn : from;
}

/**
 * A share's own plan, with its first day pinned to the day sharing began — the
 * cadence and the start date then have one answer between them, not two.
 */
function ownSchedule(value: unknown, from: string): VialSchedule | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const schedule = value as Record<string, unknown>;
  // Without times there is no cadence; inventing one here would silently change
  // what the bottle is expected to deliver.
  if (!Array.isArray(schedule.times) || typeof schedule.startsOn !== 'string') return undefined;
  return { ...(value as VialSchedule), startsOn: from };
}

function ownDose(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && isPositive(value) ? value : undefined;
}

function ownUnit(value: unknown): DoseUnit | undefined {
  return DOSE_UNITS.includes(value as DoseUnit) ? (value as DoseUnit) : undefined;
}

/** One sanitised share, or null when the entry cannot describe anybody. */
function share(value: unknown, ownerId: string, reconstitutedOn: string): VialShare | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const from = notBefore(day(raw.from, reconstitutedOn), reconstitutedOn);
  const result: VialShare = { ownerId, from };

  const doseAmount = ownDose(raw.doseAmount);
  if (doseAmount !== undefined) {
    result.doseAmount = doseAmount;
    result.doseUnit = ownUnit(raw.doseUnit);
  }

  const schedule = ownSchedule(raw.schedule, from);
  if (schedule) result.schedule = schedule;

  return result;
}

/**
 * Sanitises stored shares: drops anything unusable, de-duplicates by person,
 * never lets someone share with themselves, and keeps the given order so the UI
 * stays stable between renders.
 */
export function normalizeShares(
  value: unknown,
  ownerId: string,
  reconstitutedOn: string,
): VialShare[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const list: VialShare[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const id = (entry as Record<string, unknown>).ownerId;
    if (typeof id !== 'string') continue;
    const personId = id.trim();
    if (personId === '' || personId === ownerId || seen.has(personId)) continue;
    const clean = share(entry, personId, reconstitutedOn);
    if (!clean) continue;
    seen.add(personId);
    list.push(clean);
  }
  return list;
}

/** The people sharing a vial, sanitised. Empty for a vial one person holds. */
export function sharesOf(vial: ShareableVial): VialShare[] {
  return normalizeShares(vial.shares, vialOwnerId(vial), vial.reconstitutedOn);
}

/** True when somebody other than the owner draws from this vial. */
export function isShared(vial: ShareableVial): boolean {
  return sharesOf(vial).length > 0;
}

/** The vial's owner first, then everyone sharing the bottle. */
export function participantIds(vial: ShareableVial): string[] {
  return [vialOwnerId(vial), ...sharesOf(vial).map((entry) => entry.ownerId)];
}

/** Someone's own share of a vial, or null when they are its owner (or a stranger). */
export function shareFor(vial: ShareableVial, ownerId: string): VialShare | null {
  return sharesOf(vial).find((entry) => entry.ownerId === ownerId) ?? null;
}

/** The dose one injection draws for a person: their own, or the vial's. */
export function shareDose(vial: ShareableVial, entry: VialShare | null): number {
  return entry?.doseAmount !== undefined ? entry.doseAmount : vial.doseAmount;
}

/** The unit that dose is written in. */
export function shareDoseUnit(vial: ShareableVial, entry: VialShare | null): DoseUnit {
  return entry?.doseUnit ?? vial.doseUnit;
}

/**
 * A person's plan: their own when they set one, otherwise the owner's cadence
 * re-anchored to the day they joined the bottle. `undefined` when the vial has
 * no plan at all.
 */
export function shareSchedule(
  vial: ShareableVial,
  entry: VialShare | null,
): VialSchedule | undefined {
  if (!entry) return vial.schedule;
  if (entry.schedule) return { ...entry.schedule, startsOn: entry.from };
  return vial.schedule ? { ...vial.schedule, startsOn: entry.from } : undefined;
}

/**
 * The vial as one person sees it: their dose and their cadence, with every
 * physical fact — the powder, the water, the expiry, the price — left untouched.
 * The owner sees the vial itself, so only a sharer's view ever differs.
 *
 * This is the whole trick behind sharing. Every derived number in the app is
 * computed from a `SavedVial`, so resolving *whose* plan is in force once, here,
 * makes the Today card, the calendar, the vial card and the printed sheet right
 * for that person without teaching any of them about shares.
 */
export function viewVial<T extends ShareableVial>(vial: T, viewerId: string): T {
  const entry = shareFor(vial, viewerId);
  if (!entry) return vial;

  const schedule = shareSchedule(vial, entry);
  return {
    ...vial,
    doseAmount: shareDose(vial, entry),
    doseUnit: shareDoseUnit(vial, entry),
    ...(schedule ? { schedule } : {}),
  } as T;
}

/** What a share form hands over, so the "same plan" switch cannot be got wrong. */
export interface ShareDraft {
  ownerId: string;
  /** `yyyy-mm-dd`; a blank or too-early date falls back to the mix date. */
  from: string;
  /** The day the powder was mixed, used to keep `from` honest. */
  reconstitutedOn: string;
  /** True = follow the owner's plan, and the dose and cadence are then dropped. */
  samePlan: boolean;
  doseAmount?: number;
  doseUnit?: DoseUnit;
  schedule?: VialSchedule;
}

/**
 * Builds the share a form should store. Choosing "same plan" really *removes*
 * the dose and the cadence rather than copying the owner's, so a later change to
 * the owner's plan carries the sharer along — which is what "same plan" means.
 */
export function makeShare(draft: ShareDraft): VialShare {
  const from = notBefore(day(draft.from, draft.reconstitutedOn), draft.reconstitutedOn);
  const entry: VialShare = { ownerId: draft.ownerId, from };
  if (draft.samePlan) return entry;

  const doseAmount = ownDose(draft.doseAmount);
  if (doseAmount !== undefined) {
    entry.doseAmount = doseAmount;
    entry.doseUnit = draft.doseUnit ?? 'mg';
  }

  const schedule = ownSchedule(draft.schedule, from);
  if (schedule) entry.schedule = schedule;
  return entry;
}
