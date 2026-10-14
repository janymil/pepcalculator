/**
 * When to remind someone that their data lives only on this device.
 *
 * The app has no account and no server copy, so the user's own JSON file is the
 * only safety net. A reminder has to earn its place, though: nagging is how a
 * calm app turns into a noisy one. So there is exactly one automatic prompt, and
 * it is quiet by construction:
 *
 *  - only when something **actually changed** since the last copy;
 *  - never before `NUDGE_INTERVAL_DAYS` have passed since the last copy, the last
 *    time the prompt was dismissed, or the first time the device held any data
 *    (so a brand-new user is not nagged minutes after building a protocol).
 *
 * Pure module: no DOM, no React, the clock is passed in. Everything it needs is
 * stored locally, so it adds no analytics and no network call.
 */

import { daysBetween } from './dates';
import { liveMeasurements, type Measurement } from './measure';
import type { Owner } from './owners';
import { liveVials, type SavedVial } from './vials';

/** Days between two automatic reminders. */
export const NUDGE_INTERVAL_DAYS = 7;

/** FNV-1a, 32-bit: small, dependency-free, plenty to tell two snapshots apart. */
function hash(text: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, '0');
}

/**
 * A short fingerprint of everything a backup would contain.
 *
 * Soft-deleted rows are ignored (a backup leaves them out too) and vials are
 * ordered by id, so a sync that merely reorders the list is not a "change".
 * Comparing two fingerprints is how the app knows the copy on disk is stale.
 */
export function dataFingerprint(
  vials: SavedVial[],
  owners: Owner[],
  measurements: Measurement[],
): string {
  const live = liveVials(vials)
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id));
  const log = liveMeasurements(measurements);
  return hash(JSON.stringify({ vials: live, owners, measurements: log }));
}

export interface BackupNudgeInput {
  /** Whether there is anything on the device worth saving. */
  hasData: boolean;
  /** Whether the data differs from what the last copy contained. */
  changed: boolean;
  /** ISO date (or timestamp) of the last downloaded copy, or ''. */
  lastBackup: string;
  /** ISO date the reminder was last shown and dismissed, or ''. */
  nudgedOn: string;
  /** ISO date the device first held data, or '' when not yet recorded. */
  seenOn: string;
  todayIso: string;
  intervalDays?: number;
}

/**
 * True when the gentle "you have unsaved changes" reminder is due.
 *
 * The clock runs from the *latest* of the last copy, the last dismissal and the
 * first sight of data. With none of those yet there is nothing to measure from,
 * so the answer is no: the caller records the first sight, and the countdown
 * starts then.
 */
export function shouldNudgeBackup({
  hasData,
  changed,
  lastBackup,
  nudgedOn,
  seenOn,
  todayIso,
  intervalDays = NUDGE_INTERVAL_DAYS,
}: BackupNudgeInput): boolean {
  if (!hasData || !changed) return false;

  const anchors = [lastBackup, nudgedOn, seenOn]
    .map((value) => value.slice(0, 10))
    .filter((value) => value !== '')
    .sort();
  if (anchors.length === 0) return false;

  // ISO dates sort the same way they read, so the last one is the latest.
  const latest = anchors[anchors.length - 1];
  return daysBetween(latest, todayIso) >= intervalDays;
}
