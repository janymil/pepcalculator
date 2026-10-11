import { useEffect, useMemo, useRef, useState } from 'react';
import { toIsoDate } from '../lib/dates';
import {
  notificationPermission,
  requestNotificationPermission,
  showDoseNotification,
  type NotificationPermissionState,
} from '../lib/pwa';
import { reminderKey, timerDelay, upcomingDoses, type UpcomingDose } from '../lib/reminders';
import type { SavedVial } from '../lib/vials';

/** `HH:mm` from a `Date`, matching how schedules store their times. */
function clockTime(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

interface UseDoseRemindersOptions {
  vials: SavedVial[];
  /** The app's once-a-minute clock, so reminders stay in step with the UI. */
  now: Date;
  enabled: boolean;
  /** Notification heading (already localised). */
  title: string;
  /** Notification body builder (already localised). */
  body: (vialName: string, time: string) => string;
}

interface UseDoseReminders {
  permission: NotificationPermissionState;
  requestPermission: () => void;
  /** The next dose across every scheduled vial, or null when there is none. */
  next: UpcomingDose | null;
}

/**
 * Fires an OS notification at the next scheduled dose.
 *
 * Honest limitation: a browser timer only runs while the app is alive. This
 * covers the app being open or backgrounded — including an installed PWA on
 * Android — but a fully closed app would need Web Push (a server), which this
 * offline-first app deliberately does not have.
 */
export function useDoseReminders({
  vials,
  now,
  enabled,
  title,
  body,
}: UseDoseRemindersOptions): UseDoseReminders {
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationPermission(),
  );

  const next = useMemo(
    () => upcomingDoses(vials, toIsoDate(now), clockTime(now))[0] ?? null,
    [vials, now],
  );

  const timerRef = useRef<number | null>(null);
  const armedKeyRef = useRef('');
  // Read the latest text inside the timer without re-arming it on every render.
  const notifyRef = useRef({ title, body });
  notifyRef.current = { title, body };

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!enabled || permission !== 'granted' || next === null) {
      clearTimer();
      armedKeyRef.current = '';
      return;
    }

    // Already armed (or already fired) for this exact dose — leave it alone.
    // This is what stops the once-a-minute clock from re-arming every tick.
    const key = reminderKey(next);
    if (armedKeyRef.current === key) return;

    clearTimer();
    armedKeyRef.current = key;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const { title: heading, body: makeBody } = notifyRef.current;
      void showDoseNotification({ title: heading, body: makeBody(next.name, next.time), tag: key });
    }, timerDelay(next, now));
    // No cleanup here on purpose: returning one would clear the timer on every
    // minute-tick (the effect re-runs when `now` changes). Unmount is handled
    // by the dedicated effect below.
  }, [enabled, permission, next, now]);

  // Clear the timer only when the hook goes away.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const requestPermission = () => {
    void requestNotificationPermission().then(setPermission);
  };

  return { permission, requestPermission, next };
}
