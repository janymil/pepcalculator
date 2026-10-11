/**
 * PWA platform helpers — service worker registration and notifications.
 *
 * Every function is guarded so it is safe to call during server rendering
 * (`renderToString`) and on browsers that lack the API: the app must never
 * crash because a phone is old or the page is rendered headless. Nothing here
 * is imported by the pure maths, so it stays a thin platform seam.
 */

export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/** Registration URL + scope follow `BASE_URL`, so hosting under a subpath works. */
const BASE = import.meta.env.BASE_URL;

export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/** Registers the offline service worker. Returns null when unsupported/failed. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    return await navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
  } catch {
    return null;
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermissionState {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return Notification.permission as NotificationPermissionState;
  } catch {
    return 'unsupported';
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    return (await Notification.requestPermission()) as NotificationPermissionState;
  } catch {
    return 'denied';
  }
}

/** True when the app is running as an installed PWA rather than a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
    return displayMode || iosStandalone === true;
  } catch {
    return false;
  }
}

export interface DoseNotification {
  title: string;
  body: string;
  /** Stable identity so a re-fire replaces the previous notification. */
  tag: string;
}

/**
 * Shows a dose reminder. Prefers the service worker (it survives the page being
 * backgrounded on Android) and falls back to a plain `Notification`.
 */
export async function showDoseNotification(dose: DoseNotification): Promise<boolean> {
  if (notificationPermission() !== 'granted') return false;

  // `renotify` exists in browsers but not in every TS DOM lib, so it is added
  // explicitly rather than fighting the lib version.
  const options: NotificationOptions & { renotify?: boolean } = {
    body: dose.body,
    tag: dose.tag,
    icon: `${BASE}icons/icon-192.png`,
    badge: `${BASE}icons/icon-192.png`,
    renotify: true,
  };

  try {
    if (isServiceWorkerSupported()) {
      // `getRegistration` only — `serviceWorker.ready` never settles when no
      // worker is registered (e.g. plain `npm run dev`), which would hang here.
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(dose.title, options);
        return true;
      }
    }
    new Notification(dose.title, options);
    return true;
  } catch {
    return false;
  }
}
