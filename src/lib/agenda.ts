/**
 * Cross-vial agenda — "which days, and at which hours, do I take my peptides?".
 *
 * The per-vial calendar (`DoseCalendar`) answers that for one vial; this module
 * merges every saved plan into one picture, which is what the Calendar page
 * renders. Pure: no React, no DOM, and `todayIso` is injectable so the maths is
 * deterministic in tests (it only feeds the vial's "doses left" snapshot).
 */

import { unitsPerMlOf } from './calc';
import { addDays, toIsoDate } from './dates';
import { isDoseDay, normalizeTimes } from './schedule';
import { liveVials, vialKind, vialStatus, type SavedVial, type VialKind } from './vials';

/** How far `upcomingDays` will scan before giving up. */
export const MAX_SCAN_DAYS = 366 * 2;

export interface AgendaEntry {
  vialId: string;
  name: string;
  kind: VialKind;
  /** `HH:mm`. */
  time: string;
  volumePerDoseMl: number;
  /** Insulin units — peptides only; 0 for anabolic oils (they are read in mL). */
  unitsPerDose: number;
}

export interface AgendaDay {
  date: string;
  entries: AgendaEntry[];
}

/** Live vials that have a plan — the only ones a calendar can show. */
export function scheduledVials(vials: SavedVial[]): SavedVial[] {
  return liveVials(vials).filter((vial) => Boolean(vial.schedule));
}

export function hasAnyPlan(vials: SavedVial[]): boolean {
  return scheduledVials(vials).length > 0;
}

function entryFor(vial: SavedVial, time: string, todayIso: string): AgendaEntry {
  const status = vialStatus(vial, todayIso);
  const kind = vialKind(vial);
  return {
    vialId: vial.id,
    name: vial.name,
    kind,
    time,
    volumePerDoseMl: status.volumePerDoseMl,
    unitsPerDose: kind === 'anabolic' ? 0 : status.volumePerDoseMl * unitsPerMlOf(vial.syringeType),
  };
}

/** Every dose scheduled on a date, across all vials: time ascending, then name. */
export function agendaForDay(
  vials: SavedVial[],
  iso: string,
  todayIso: string = toIsoDate(new Date()),
): AgendaEntry[] {
  const entries: AgendaEntry[] = [];
  for (const vial of scheduledVials(vials)) {
    if (!vial.schedule || !isDoseDay(vial.schedule, iso)) continue;
    for (const time of normalizeTimes(vial.schedule.times)) {
      entries.push(entryFor(vial, time, todayIso));
    }
  }
  return entries.sort((a, b) =>
    a.time !== b.time ? (a.time < b.time ? -1 : 1) : a.name.localeCompare(b.name),
  );
}

/** Doses per day for a month — only days that have at least one (for the grid). */
export function agendaForMonth(
  vials: SavedVial[],
  year: number,
  month: number,
  todayIso: string = toIsoDate(new Date()),
): Map<string, AgendaEntry[]> {
  const days = new Map<string, AgendaEntry[]>();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = toIsoDate(new Date(year, month, day));
    const entries = agendaForDay(vials, iso, todayIso);
    if (entries.length > 0) days.set(iso, entries);
  }
  return days;
}

/**
 * The next days that have at least one dose, starting at `fromIso` (inclusive).
 * Today keeps only the doses still ahead (`time >= nowTime`); later days keep all.
 */
export function upcomingDays(
  vials: SavedVial[],
  fromIso: string,
  nowTime: string,
  count: number,
  todayIso: string = toIsoDate(new Date()),
): AgendaDay[] {
  const days: AgendaDay[] = [];
  if (count <= 0) return days;

  let cursor = fromIso;
  for (let guard = 0; guard < MAX_SCAN_DAYS && days.length < count; guard += 1) {
    const entries = agendaForDay(vials, cursor, todayIso).filter(
      (entry) => cursor > fromIso || entry.time >= nowTime,
    );
    if (entries.length > 0) days.push({ date: cursor, entries });
    cursor = addDays(cursor, 1);
  }
  return days;
}
