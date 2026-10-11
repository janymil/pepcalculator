/**
 * Body measurements — the "is any of this changing?" log.
 *
 * Every other number in this app is about *drawing* a dose. This is the only
 * place that records something about the person, and it is deliberately pure
 * arithmetic: it stores what you measured and reports the change since your
 * first entry. It never says whether that change is good, and it holds no
 * target, because a target is a clinical decision.
 *
 * Metric only (cm / kg). The app has exactly two unit concepts (mass and
 * volume) and an imperial toggle would make it three; the languages it ships in
 * are metric countries.
 *
 * Pure module: no React, no DOM, no storage. `date` is supplied by the caller,
 * so everything here is deterministic and unit-testable.
 */

export type MeasureField = 'waistCm' | 'hipCm' | 'neckCm' | 'armCm' | 'thighCm' | 'weightKg';

/**
 * The order they are offered in. Waist first: for this class of medicine it is
 * the one that moves and the one clinics actually use — and it is the one a
 * person can measure alone, the same way, every week.
 */
export const MEASURE_FIELDS: readonly MeasureField[] = [
  'waistCm',
  'hipCm',
  'neckCm',
  'armCm',
  'thighCm',
  'weightKg',
];

/** Which unit a field is read in. Circumferences in cm, weight in kg. */
export function fieldUnit(field: MeasureField): 'cm' | 'kg' {
  return field === 'weightKg' ? 'kg' : 'cm';
}

export interface Measurement {
  id: string;
  /** Whose log this is; absent records belong to the default person, like vials. */
  ownerId?: string;
  /** The day it was measured (`yyyy-mm-dd`) — not necessarily the day it was typed. */
  date: string;
  /** Every point is optional: logging one number has to be enough to start. */
  waistCm?: number;
  hipCm?: number;
  neckCm?: number;
  armCm?: number;
  thighCm?: number;
  weightKg?: number;
  /** Same newest-wins comparison the vials use. */
  updatedAt: string;
  /** Tombstone, so a removal can travel. Hidden everywhere else. */
  deletedAt?: string;
}

/** The figure for one field, or undefined when it was not measured (or unusable). */
export function measurementValue(entry: Measurement, field: MeasureField): number | undefined {
  const value = entry[field];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** True when an entry recorded at least one usable figure. */
export function hasAnyValue(entry: Measurement): boolean {
  return MEASURE_FIELDS.some((field) => measurementValue(entry, field) !== undefined);
}

/** Oldest first, ties broken by id so the order never flickers between renders. */
export function byDate(list: Measurement[]): Measurement[] {
  return [...list].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
}

/** Newest first — the order the log is listed in. */
export function newestFirst(list: Measurement[]): Measurement[] {
  return byDate(list).reverse();
}

/** Everything that was not deleted. */
export function liveMeasurements(list: Measurement[]): Measurement[] {
  return list.filter((entry) => !entry.deletedAt);
}

/** Entries with at least one usable figure, oldest first — the trend order. */
export function usableMeasurements(list: Measurement[]): Measurement[] {
  return byDate(liveMeasurements(list)).filter(hasAnyValue);
}

export interface MeasurePoint {
  date: string;
  value: number;
}

/** One field's history, oldest first — what the trend line is drawn from. */
export function pointsFor(list: Measurement[], field: MeasureField): MeasurePoint[] {
  const points: MeasurePoint[] = [];
  for (const entry of usableMeasurements(list)) {
    const value = measurementValue(entry, field);
    if (value !== undefined) points.push({ date: entry.date, value });
  }
  return points;
}

/** The most recent figure for a field, or null when it was never recorded. */
export function latestValue(list: Measurement[], field: MeasureField): MeasurePoint | null {
  const points = pointsFor(list, field);
  return points.length > 0 ? points[points.length - 1] : null;
}

export interface MeasureChange {
  from: number;
  to: number;
  /** `to - from`. Negative is a smaller circumference or a lower weight. */
  delta: number;
  fromDate: string;
  toDate: string;
  /** How many entries stand behind the comparison. */
  points: number;
}

/**
 * The change since the first entry that recorded this field — the app's own
 * baseline, because "since you started logging" is the only baseline it can
 * honestly know. Needs two entries: one number is a measurement, not a change.
 *
 * The verdict is deliberately absent. This reports the signed difference, and
 * nothing about whether it is good.
 */
export function changeSinceStart(list: Measurement[], field: MeasureField): MeasureChange | null {
  const points = pointsFor(list, field);
  if (points.length < 2) return null;

  const from = points[0];
  const to = points[points.length - 1];
  return {
    from: from.value,
    to: to.value,
    delta: to.value - from.value,
    fromDate: from.date,
    toDate: to.date,
    points: points.length,
  };
}

/** A collision-resistant id for a new entry, with a fallback for odd runtimes. */
export function createMeasurementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `ms-${crypto.randomUUID()}`;
  }
  return `ms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** True when a stored/imported value could be one of our records at all. */
export function looksLikeMeasurement(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.date === 'string';
}

/**
 * Cleans one record from storage, a backup or a sync payload: keeps the ids and
 * the numbers it can trust, drops the rest. Returns null when the record is not
 * usable at all, so one damaged entry can never break the log.
 */
export function normalizeMeasurement(value: unknown): Measurement | null {
  if (!looksLikeMeasurement(value)) return null;
  const candidate = value as Record<string, unknown>;

  const id = (candidate.id as string).trim();
  const date = (candidate.date as string).trim();
  if (id === '' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const entry: Measurement = {
    id,
    date,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : date,
  };

  if (typeof candidate.ownerId === 'string' && candidate.ownerId.trim() !== '') {
    entry.ownerId = candidate.ownerId.trim();
  }
  if (typeof candidate.deletedAt === 'string') entry.deletedAt = candidate.deletedAt;

  for (const field of MEASURE_FIELDS) {
    const value = candidate[field];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) entry[field] = value;
  }

  // A record with no figures and no tombstone is noise: drop it.
  if (!hasAnyValue(entry) && entry.deletedAt === undefined) return null;
  return entry;
}

/** Cleans a whole list, keeping the usable records in their original order. */
export function normalizeMeasurements(value: unknown): Measurement[] {
  if (!Array.isArray(value)) return [];
  const out: Measurement[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const entry = normalizeMeasurement(raw);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out;
}

/**
 * Union by id, newest `updatedAt` wins — the same rule the vials use, so a
 * restore (or a future sync) cannot let an older figure overwrite a newer one.
 */
export function mergeMeasurements(current: Measurement[], incoming: Measurement[]): Measurement[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const existing = byId.get(entry.id);
    if (!existing || entry.updatedAt >= existing.updatedAt) byId.set(entry.id, entry);
  }
  return [...byId.values()];
}
