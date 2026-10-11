/**
 * Recovery-code sync.
 *
 * The user gets one long random code and writes it down. Their vials are stored
 * server-side under the **SHA-256 hash of that code**, so the server never sees
 * the code itself. Typing the same code on another device pulls the same data
 * in. No email, no password, no account.
 *
 * Stated plainly: the code IS the credential. Anyone who has it can read and
 * write that record, and there is no reset — which is exactly why the JSON
 * backup exists as a safety net.
 */

import {
  looksLikeSavedVial,
  mergeVials,
  normalizeSavedVial,
  type SavedVial,
} from './vials';

export const SYNC_CODE_PREFIX = 'PC';
export const SYNC_CODE_GROUPS = 6;
export const SYNC_CODE_GROUP_LENGTH = 4;
/** Ambiguous characters (I, O, 0, 1) are omitted so codes are easy to retype. */
export const SYNC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const SYNC_PAYLOAD_VERSION = 1;
const HASH_SALT = 'pepcalculator-sync-v1';

export interface SyncPayload {
  version: number;
  vials: SavedVial[];
}

export type SyncFailure = 'invalidCode' | 'network' | 'server' | 'badPayload' | 'unavailable';

export type SyncOutcome =
  | { ok: true; vials: SavedVial[]; updatedAt: string; remoteFound: boolean }
  | { ok: false; reason: SyncFailure };

/* ---------- code ---------- */

/** Builds a code from the given random bytes. Pure, so it is easy to test. */
export function codeFromBytes(bytes: Uint8Array): string {
  const chars = Array.from(bytes, (byte) => SYNC_ALPHABET[byte % SYNC_ALPHABET.length]);
  const groups: string[] = [];
  for (let index = 0; index < chars.length; index += SYNC_CODE_GROUP_LENGTH) {
    groups.push(chars.slice(index, index + SYNC_CODE_GROUP_LENGTH).join(''));
  }
  return [SYNC_CODE_PREFIX, ...groups].join('-');
}

/** A fresh ~120-bit code, e.g. `PC-7K2M-9QXA-...`. */
export function generateSyncCode(): string {
  const bytes = new Uint8Array(SYNC_CODE_GROUPS * SYNC_CODE_GROUP_LENGTH);
  crypto.getRandomValues(bytes);
  return codeFromBytes(bytes);
}

/** Uppercases and strips separators, so any typing style works. */
export function normalizeSyncCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True when the input is a well-formed code (the `PC` prefix is required). */
export function isValidSyncCode(input: string): boolean {
  const raw = normalizeSyncCode(input);
  if (!raw.startsWith(SYNC_CODE_PREFIX)) return false;
  const body = raw.slice(SYNC_CODE_PREFIX.length);
  const expected = SYNC_CODE_GROUPS * SYNC_CODE_GROUP_LENGTH;
  if (body.length !== expected) return false;
  return [...body].every((char) => SYNC_ALPHABET.includes(char));
}

/** Re-formats any accepted input into the canonical `PC-XXXX-XXXX-…` shape. */
export function formatSyncCode(input: string): string {
  const raw = normalizeSyncCode(input);
  const body = raw.startsWith(SYNC_CODE_PREFIX) ? raw.slice(SYNC_CODE_PREFIX.length) : raw;
  const groups = body.match(/.{1,4}/g) ?? [];
  return [SYNC_CODE_PREFIX, ...groups].join('-');
}

/**
 * The lookup key sent to the server: SHA-256 of a salted, normalised code.
 * The salt keeps this from matching a plain hash of the same code anywhere else.
 */
export async function hashSyncCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${HASH_SALT}:${normalizeSyncCode(code)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/* ---------- payload ---------- */

export function serializePayload(vials: SavedVial[]): string {
  const payload: SyncPayload = { version: SYNC_PAYLOAD_VERSION, vials };
  return JSON.stringify(payload);
}

/** Parses a stored payload, discarding malformed entries. */
export function parsePayload(text: string): SyncPayload | null {
  let data: Partial<SyncPayload>;
  try {
    data = JSON.parse(text) as Partial<SyncPayload>;
  } catch {
    return null;
  }
  if (!Array.isArray(data?.vials)) return null;

  return {
    version: typeof data.version === 'number' ? data.version : SYNC_PAYLOAD_VERSION,
    vials: (data.vials as unknown[]).filter(looksLikeSavedVial).map(normalizeSavedVial),
  };
}

/* ---------- client ---------- */

function syncUrl(baseUrl: string, key: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/api/sync/${key}`;
}

/**
 * Builds the request URL, returning null when hashing is impossible.
 * `crypto.subtle` only exists in a secure context, so a plain-http origin
 * (e.g. a phone hitting your laptop over the LAN) would otherwise blow up.
 */
async function safeSyncUrl(baseUrl: string, code: string): Promise<string | null> {
  try {
    return syncUrl(baseUrl, await hashSyncCode(code));
  } catch {
    return null;
  }
}

export type PushOutcome = { ok: true; updatedAt: string } | { ok: false; reason: SyncFailure };

/**
 * Sends the local vials to the server without pulling first — used by the
 * background auto-push, where a pull has just happened anyway.
 */
export async function pushVials(
  baseUrl: string,
  code: string,
  localVials: SavedVial[],
  fetchImpl: typeof fetch = fetch,
): Promise<PushOutcome> {
  if (!isValidSyncCode(code)) return { ok: false, reason: 'invalidCode' };
  if (!baseUrl.trim()) return { ok: false, reason: 'network' };

  const url = await safeSyncUrl(baseUrl, code);
  if (url === null) return { ok: false, reason: 'unavailable' };

  try {
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: serializePayload(localVials) }),
    });
    if (!response.ok) return { ok: false, reason: 'server' };

    const body = (await response.json()) as { updatedAt?: unknown };
    return {
      ok: true,
      updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Pulls the remote copy (if there is one), merges it with the local vials, then
 * pushes the merged result back. Merging is additive and newest-wins — including
 * tombstones — so a sync can never lose anything and deletions still travel.
 */
export async function syncWithServer(
  baseUrl: string,
  code: string,
  localVials: SavedVial[],
  fetchImpl: typeof fetch = fetch,
): Promise<SyncOutcome> {
  if (!isValidSyncCode(code)) return { ok: false, reason: 'invalidCode' };
  if (!baseUrl.trim()) return { ok: false, reason: 'network' };

  const url = await safeSyncUrl(baseUrl, code);
  if (url === null) return { ok: false, reason: 'unavailable' };

  let merged = localVials;
  let remoteFound = false;

  try {
    const response = await fetchImpl(url, { method: 'GET' });
    if (response.status === 200) {
      const body = (await response.json()) as { payload?: unknown };
      const parsed = typeof body.payload === 'string' ? parsePayload(body.payload) : null;
      if (!parsed) return { ok: false, reason: 'badPayload' };
      merged = mergeVials(localVials, parsed.vials);
      remoteFound = true;
    } else if (response.status !== 404) {
      return { ok: false, reason: 'server' };
    }
  } catch {
    return { ok: false, reason: 'network' };
  }

  const pushed = await pushVials(baseUrl, code, merged, fetchImpl);
  if (!pushed.ok) return pushed;

  return { ok: true, vials: merged, updatedAt: pushed.updatedAt, remoteFound };
}

