/**
 * Web Push client seam — the browser side of "a reminder that arrives while the
 * app is closed".
 *
 * Everything here is guarded and wrapped in `try/catch`, exactly like
 * `lib/pwa.ts`: an old browser, a denied permission or a page rendered headless
 * must never make the app throw. The functions take an injectable `fetch` so the
 * request shape is testable without a browser.
 */

import type { PushScheduleEntry } from './reminders';
import { hashSyncCode } from './sync';

export type PushFailure = 'unsupported' | 'noKey' | 'network' | 'server';

export type PushOutcome = { ok: true } | { ok: false; reason: PushFailure };

/** True when this browser can subscribe to push at all. */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** A base URL with any trailing slash removed. */
function trimmedBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

/**
 * The URL-safe base64 VAPID key as bytes. Standard conversion, verbatim from the
 * Push API examples.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

/** The server's VAPID public key, or null when the server has push switched off. */
export async function fetchVapidPublicKey(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!baseUrl.trim()) return null;
  try {
    const response = await fetchImpl(`${trimmedBase(baseUrl)}/api/push/pubkey`);
    if (!response.ok) return null;
    const body = (await response.json()) as { publicKey?: unknown };
    return typeof body.publicKey === 'string' && body.publicKey ? body.publicKey : null;
  } catch {
    return null;
  }
}

/** The push record URL — the same hashed identity the sync route uses. */
async function pushUrl(baseUrl: string, code: string): Promise<string | null> {
  try {
    return `${trimmedBase(baseUrl)}/api/push/${await hashSyncCode(code)}`;
  } catch {
    // `crypto.subtle` needs a secure context; a plain-http LAN phone has none.
    return null;
  }
}

/**
 * The browser's push subscription for this device, reusing an existing one when
 * there is one. Returns null when unsupported, when the service worker is not
 * registered yet, or when the browser refuses.
 */
export async function getPushSubscription(publicKey: string): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;

    const existing = await registration.pushManager.getSubscription();
    if (existing) return existing;

    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  } catch {
    return null;
  }
}

/** Stores the subscription and the queue of upcoming notifications on the server. */
export async function savePushRegistration(
  baseUrl: string,
  code: string,
  subscription: PushSubscription,
  queue: PushScheduleEntry[],
  fetchImpl: typeof fetch = fetch,
): Promise<PushOutcome> {
  const url = await pushUrl(baseUrl, code);
  if (url === null) return { ok: false, reason: 'network' };
  try {
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: subscription.toJSON(), queue }),
    });
    return response.ok ? { ok: true } : { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/** Forgets this device: the server stops pushing to it. */
export async function removePushRegistration(
  baseUrl: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PushOutcome> {
  const url = await pushUrl(baseUrl, code);
  if (url === null) return { ok: false, reason: 'network' };
  try {
    const response = await fetchImpl(url, { method: 'DELETE' });
    return response.ok ? { ok: true } : { ok: false, reason: 'server' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
