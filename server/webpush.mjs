/**
 * The one place `web-push` is touched.
 *
 * The import is **lazy**: the base sync server still runs with zero installed
 * dependencies, and only a server with VAPID keys configured — and an actual
 * dose to send — ever loads the library. If it is missing, sending throws, the
 * scheduler logs it once and keeps the queue, exactly as it would for any other
 * transient failure.
 */

let cached = null;

async function loadWebPush() {
  if (!cached) {
    const module = await import('web-push');
    cached = module.default ?? module;
  }
  return cached;
}

/** True when the server is configured to send push at all. */
export function isPushConfigured(config) {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

/**
 * Builds the `send(subscription, payload)` the scheduler calls. `payload` is the
 * `{ title, body, tag }` the service worker shows verbatim.
 */
export function createPushSender(config) {
  return async function send(subscription, payload) {
    if (!isPushConfigured(config)) throw new Error('push_not_configured');
    const webpush = await loadWebPush();
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    await webpush.sendNotification(subscription, JSON.stringify(payload));
  };
}
