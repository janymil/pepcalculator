/**
 * Pairing payloads — the content of the QR code.
 *
 * A phone reads one of these out of the URL **hash** after its camera scans the
 * code. The hash never reaches a server, so the sync code travels screen →
 * camera → address bar and nowhere else, exactly as if it had been typed.
 *
 * Pure: no DOM. Base64url (not plain JSON) keeps the payload short and free of
 * characters the URL or the QR byte stream would have to escape.
 */

import { formatSyncCode, isValidSyncCode, normalizeSyncCode } from './sync';

export const PAIR_PAYLOAD_VERSION = 1;
/** The hash key: a link looks like `https://app.example/#pair=<base64url>`. */
export const PAIR_HASH_KEY = 'pair';

export interface PairPayload {
  /** The sync code, canonical (`PC-XXXX-…`). */
  code: string;
  /** The sync server to point the phone at — empty means "use the built-in default". */
  server: string;
  /** The person who created it, when known. Informational. */
  name?: string;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** The URL hash (leading `#`) that carries a pairing code. */
export function buildPairHash(code: string, server: string, name = ''): string {
  const payload = JSON.stringify({
    v: PAIR_PAYLOAD_VERSION,
    c: normalizeSyncCode(code),
    s: server.trim(),
    ...(name.trim() ? { n: name.trim() } : {}),
  });
  return `#${PAIR_HASH_KEY}=${toBase64Url(payload)}`;
}

/**
 * Reads a pairing payload from a location hash, or null when there is none or it
 * does not survive validation. A payload with an invalid code or a nonsense
 * server is refused rather than half-applied.
 */
export function parsePairHash(hash: string): PairPayload | null {
  const segment = hash
    .replace(/^#/, '')
    .split('&')
    .find((part) => part.startsWith(`${PAIR_HASH_KEY}=`));
  if (!segment) return null;

  const decoded = fromBase64Url(segment.slice(PAIR_HASH_KEY.length + 1));
  if (decoded === null) return null;

  let data: unknown;
  try {
    data = JSON.parse(decoded);
  } catch {
    return null;
  }

  const payload = data as Partial<{ v: number; c: string; s: string; n: string }>;
  if (payload.v !== PAIR_PAYLOAD_VERSION) return null;
  if (typeof payload.c !== 'string' || !isValidSyncCode(payload.c)) return null;

  const server = typeof payload.s === 'string' ? payload.s.trim() : '';
  if (server !== '' && !/^https?:\/\/\S+$/i.test(server)) return null;

  const name = typeof payload.n === 'string' ? payload.n.trim() : '';
  return {
    code: formatSyncCode(payload.c),
    server,
    ...(name ? { name } : {}),
  };
}
