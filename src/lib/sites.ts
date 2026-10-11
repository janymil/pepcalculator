/**
 * Injection-site rotation.
 *
 * Rotating where you inject is one of the few things entirely within the user's
 * control, and defaulting to the same spot is the common mistake. The app
 * already derives *which dose is this?* from the schedule (`lib/schedule.ts` —
 * nothing is ever logged), so the site can be derived the same way: dose number
 * N maps to site N in a fixed rotation. The Today card just says where to go.
 *
 * Pure module: no React, no DOM, no storage.
 */

export type SiteId =
  | 'abdomenLeft'
  | 'abdomenRight'
  | 'thighLeft'
  | 'thighRight'
  | 'deltoidLeft'
  | 'deltoidRight';

/**
 * The default rotation.
 *
 * Consecutive doses never land on the same site, and the **side alternates on
 * every single dose**, so no area is used twice in a row and each side gets an
 * even share over any even number of doses.
 */
export const SITE_ROTATION: readonly SiteId[] = [
  'abdomenLeft',
  'abdomenRight',
  'thighLeft',
  'thighRight',
  'deltoidLeft',
  'deltoidRight',
];

/** Longest rotation we will accept, so a bad payload can't build a huge list. */
const MAX_ROTATION = 12;

/** De-duplicated, in order, and never empty (falls back to the default). */
function rotationOf(rotation?: readonly SiteId[]): readonly SiteId[] {
  if (!rotation || rotation.length === 0) return SITE_ROTATION;
  const clean: SiteId[] = [];
  for (const site of rotation) {
    if (SITE_ROTATION.includes(site) && !clean.includes(site)) clean.push(site);
    if (clean.length >= MAX_ROTATION) break;
  }
  return clean.length > 0 ? clean : SITE_ROTATION;
}

/** One entry of a rotation plan. */
export interface RotationStep {
  /** 0-based dose number within the plan. */
  ordinal: number;
  site: SiteId;
}

/**
 * The site for a 0-based dose number (`0` is the first dose of the plan).
 * Returns null for a negative or non-finite ordinal.
 */
export function siteForDose(
  ordinal: number,
  rotation: readonly SiteId[] = SITE_ROTATION,
): SiteId | null {
  if (!Number.isFinite(ordinal) || ordinal < 0) return null;
  const list = rotationOf(rotation);
  return list[Math.floor(ordinal) % list.length];
}

/** Where the **next** dose goes, given how many have already been taken. */
export function nextSite(
  dosesTaken: number,
  rotation: readonly SiteId[] = SITE_ROTATION,
): SiteId | null {
  return siteForDose(Math.max(0, Math.floor(dosesTaken)), rotation);
}

/**
 * The next `count` sites, starting from the dose after `dosesTaken` — a short
 * "what's coming" list. Capped at 24 entries.
 */
export function upcomingSites(
  dosesTaken: number,
  count: number,
  rotation: readonly SiteId[] = SITE_ROTATION,
): RotationStep[] {
  const steps: RotationStep[] = [];
  const wanted = Math.max(0, Math.min(24, Math.floor(count)));
  const from = Math.max(0, Math.floor(dosesTaken));
  for (let index = 0; index < wanted; index += 1) {
    const site = siteForDose(from + index, rotation);
    if (site) steps.push({ ordinal: from + index, site });
  }
  return steps;
}

/** How many sites one full rotation uses. */
export function rotationLength(rotation?: readonly SiteId[]): number {
  return rotationOf(rotation).length;
}
