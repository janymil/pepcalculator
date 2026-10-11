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

/* ---------- encrypted backups ---------- */

export const ENCRYPTED_BACKUP_VERSION = 2;

/**
 * PBKDF2 work factor. Deliberately slow: the passphrase is the only thing
 * between a stolen backup file and the user's data, and a backup is exactly the
 * kind of file that ends up in a mail attachment or a cloud drive.
 */
export const PBKDF2_ITERATIONS = 200_000;

/** The file that is written when the user supplies a passphrase. */
export interface EncryptedBackup {
  app: typeof BACKUP_APP_ID;
  version: number;
  /** Marks this as a passphrase-protected envelope rather than a plain backup. */
  encrypted: true;
  /** Recorded so a future change can still read files written today. */
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  /** base64 salt for the key derivation. */
  salt: string;
  /** base64 initialisation vector for AES-GCM. */
  iv: string;
  /** base64 AES-GCM ciphertext of the plain JSON backup. */
  data: string;
}

export type BackupCryptoError =
  /** Not an encrypted backup at all. */
  | 'badEnvelope'
  /** WebCrypto is missing (any non-secure context). */
  | 'noCrypto'
  /** Wrong passphrase — AES-GCM's authentication tag fails, which is the point. */
  | 'badPassphrase';

export type BackupDecryptResult =
  | { ok: true; text: string }
  | { ok: false; reason: BackupCryptoError };

/** WebCrypto, or null when the page is not a secure context. */
export function cryptoSubtle(): SubtleCrypto | null {
  const subtle = globalThis.crypto?.subtle;
  return subtle ?? null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * `BufferSource` for WebCrypto.
 *
 * Newer TypeScript lib types distinguish `Uint8Array<ArrayBuffer>` from
 * `Uint8Array<ArrayBufferLike>`, so a plainly-constructed byte array is no
 * longer assignable. The cast is kept in one place, with the reason, rather
 * than sprinkled through every call.
 */
function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = cryptoSubtle() as SubtleCrypto;
  const material = await subtle.importKey(
    'raw',
    asBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: asBufferSource(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** True when the text looks like a passphrase-protected backup envelope. */
export function isEncryptedBackup(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const envelope = value as Partial<EncryptedBackup>;
  return (
    envelope.app === BACKUP_APP_ID &&
    envelope.encrypted === true &&
    typeof envelope.salt === 'string' &&
    typeof envelope.iv === 'string' &&
    typeof envelope.data === 'string'
  );
}

/**
 * Wraps an already-serialised backup in a passphrase-protected envelope.
 * `iterations` is injectable so tests do not have to pay for the real work
 * factor.
 */
export async function encryptBackup(
  text: string,
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const subtle = cryptoSubtle();
  if (!subtle) throw new Error('noCrypto');

  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const cipher = await subtle.encrypt(
    { name: 'AES-GCM', iv: asBufferSource(iv) },
    key,
    asBufferSource(new TextEncoder().encode(text)),
  );

  const envelope: EncryptedBackup = {
    app: BACKUP_APP_ID,
    version: ENCRYPTED_BACKUP_VERSION,
    encrypted: true,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(cipher)),
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Unwraps an encrypted backup. A wrong passphrase is reported rather than
 * thrown: AES-GCM cannot be decrypted with the wrong key, so the failure is
 * unambiguous.
 */
export async function decryptBackup(text: string, passphrase: string): Promise<BackupDecryptResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'badEnvelope' };
  }
  if (!isEncryptedBackup(parsed)) return { ok: false, reason: 'badEnvelope' };

  const envelope = parsed as EncryptedBackup;
  const subtle = cryptoSubtle();
  if (!subtle) return { ok: false, reason: 'noCrypto' };

  try {
    const key = await deriveKey(passphrase, base64ToBytes(envelope.salt), envelope.iterations);
    const plain = await subtle.decrypt(
      { name: 'AES-GCM', iv: asBufferSource(base64ToBytes(envelope.iv)) },
      key,
      asBufferSource(base64ToBytes(envelope.data)),
    );
    return { ok: true, text: new TextDecoder().decode(plain) };
  } catch {
    return { ok: false, reason: 'badPassphrase' };
  }
}
