import { useEffect, useMemo, useRef, useState } from 'react';
import type { NotificationPermissionState } from '../lib/pwa';
import {
  fetchVapidPublicKey,
  getPushSubscription,
  isPushSupported,
  removePushRegistration,
  savePushRegistration,
} from '../lib/push';
import { pushQueue, type PushScheduleEntry } from '../lib/reminders';
import type { SavedVial } from '../lib/vials';

/** What the Settings panel shows about closed-app (server) reminders. */
export type PushStatus =
  | 'off'
  | 'needs-code'
  | 'unsupported'
  | 'blocked'
  | 'inactive'
  | 'active'
  | 'error';

interface UsePushRemindersOptions {
  vials: SavedVial[];
  now: Date;
  enabled: boolean;
  /** Trusted once, from `Notification.permission`, so a change re-runs the hook. */
  permission: NotificationPermissionState;
  /**
   * The sync code is also the device identity: the subscription and the schedule
   * are stored server-side under its hash — the same key the vials use.
   */
  syncCode: string;
  serverUrl: string;
  /** Changes with the language, so the queue is re-uploaded localised. */
  lang: string;
  title: string;
  body: (vialName: string, time: string) => string;
}

/**
 * Keeps the server's copy of this device's upcoming notifications in step, so a
 * reminder can be delivered while the app is closed.
 *
 * The schedule maths stays local: this hook only uploads the *result* — a queue
 * of already-rendered notifications, each with an absolute instant. With no sync
 * code, no server, or no permission, it quietly reports why and uploads nothing.
 */
export function usePushReminders({
  vials,
  now,
  enabled,
  permission,
  syncCode,
  serverUrl,
  lang,
  title,
  body,
}: UsePushRemindersOptions): { status: PushStatus } {
  const [status, setStatus] = useState<PushStatus>('off');

  const queue = useMemo(
    () => (enabled ? pushQueue(vials, now, title, body) : []),
    [enabled, vials, now, title, body],
  );

  // A stable signature of what would be uploaded, so the once-a-minute clock
  // only causes an upload when the queue (or its language) actually changed.
  const signature = useMemo(
    () => `${lang}|${title}|${queue.map((entry) => `${entry.at}|${entry.tag}`).join(';')}`,
    [lang, title, queue],
  );

  const queueRef = useRef<PushScheduleEntry[]>(queue);
  queueRef.current = queue;
  const uploadedRef = useRef('');
  const lastKeyRef = useRef('');
  const inFlightRef = useRef(false);
  const prevEnabled = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    if (!syncCode.trim()) {
      setStatus('needs-code');
      return;
    }
    if (!isPushSupported()) {
      setStatus('unsupported');
      return;
    }
    if (permission === 'denied') {
      setStatus('blocked');
      return;
    }
    if (permission !== 'granted') {
      setStatus('inactive');
      return;
    }
    if (inFlightRef.current || uploadedRef.current === signature) return;

    let cancelled = false;
    inFlightRef.current = true;
    void (async () => {
      // A changed sync code is a changed identity: forget the old record first,
      // or the device would be pushed to twice.
      if (lastKeyRef.current && lastKeyRef.current !== syncCode) {
        await removePushRegistration(serverUrl, lastKeyRef.current);
        uploadedRef.current = '';
      }

      const publicKey = await fetchVapidPublicKey(serverUrl);
      const subscription = publicKey ? await getPushSubscription(publicKey) : null;
      const outcome = subscription
        ? await savePushRegistration(serverUrl, syncCode, subscription, queueRef.current)
        : null;

      inFlightRef.current = false;
      if (cancelled) return;
      if (outcome?.ok) {
        lastKeyRef.current = syncCode;
        uploadedRef.current = signature;
        setStatus('active');
      } else {
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, permission, syncCode, serverUrl, signature]);

  // Turning reminders off tells the server to stop pushing to this device.
  useEffect(() => {
    const wasEnabled = prevEnabled.current;
    prevEnabled.current = enabled;
    if (wasEnabled && !enabled && syncCode.trim() && serverUrl.trim()) {
      uploadedRef.current = '';
      lastKeyRef.current = '';
      void removePushRegistration(serverUrl, syncCode);
    }
  }, [enabled, syncCode, serverUrl]);

  return { status };
}
