/**
 * Backup / restore of saved vials.
 *
 * The app keeps everything in the browser, which is great for privacy and
 * speed but means clearing site data (or Safari's 7-day eviction) would lose
 * it. Exporting a plain JSON file gives the user a real copy — and doubles as
 * data portability.
 *
 * Pure module: no DOM, no React. The caller supplies `exportedAt` so the output
 * is deterministic and testable.
 */

import { mergeOwners, normalizeOwners, ownersFromVials, type Owner } from './owners';
import { looksLikeSavedVial, liveVials, normalizeSavedVial, type SavedVial } from './vials';

export const BACKUP_APP_ID = 'pepcalculator';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: number;
  exportedAt: string;
  /** The people the vials belong to. Optional on files written before owners. */
  owners?: Owner[];
  vials: SavedVial[];
}

export type BackupError = 'invalidJson' | 'notABackup' | 'noVials';

export type BackupParseResult =
  | { ok: true; vials: SavedVial[]; owners: Owner[] }
  | { ok: false; reason: BackupError };

/**
 * Serialises the saved vials into a pretty-printed JSON backup. Soft-deleted
 * vials are left out — a backup should be a copy of what the user actually has.
 * The people list travels with them so stacks stay separated after a restore.
 */
export function serializeBackup(
  vials: SavedVial[],
  exportedAt: string,
  owners: Owner[] = [],
): string {
  const payload: BackupFile = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt,
    owners: owners.length > 0 ? normalizeOwners(owners) : undefined,
    vials: liveVials(vials),
  };
  return JSON.stringify(payload, null, 2);
}

/** Parses a backup file, returning either usable vials or a reason it failed. */
export function parseBackup(text: string): BackupParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'invalidJson' };
  }

  if (typeof data !== 'object' || data === null) return { ok: false, reason: 'notABackup' };

  const candidate = data as Partial<BackupFile>;
  if (candidate.app !== BACKUP_APP_ID || !Array.isArray(candidate.vials)) {
    return { ok: false, reason: 'notABackup' };
  }

  const vials = candidate.vials.filter(looksLikeSavedVial).map(normalizeSavedVial);
  if (vials.length === 0) return { ok: false, reason: 'noVials' };

  // Older files have no `owners`; derive any missing people from the vials so
  // every restored vial has somewhere to live.
  const declared =
    Array.isArray(candidate.owners) && candidate.owners.length > 0
      ? normalizeOwners(candidate.owners)
      : [];
  const implied = ownersFromVials(vials).map((id) => ({ id, name: '' }));

  return { ok: true, vials, owners: mergeOwners(declared, implied) };
}

/** Filename for a download, e.g. `pepcalculator-backup-2026-10-10.json`. */
export function backupFileName(isoDate: string): string {
  return `pepcalculator-backup-${isoDate}.json`;
}
