/**
 * The only file that talks to Evolution API.
 *
 * Evolution is an unofficial WhatsApp gateway: it runs a real WhatsApp client
 * under the hood, so nothing here can promise the number will not be banned.
 * That risk is documented in `PROPOSAL-whatsapp-reminders.md` and is why Web
 * Push stays the default channel.
 *
 * Kept to a single seam, in the same spirit as `webpush.mjs`: `fetch` is
 * injected, so `evolution.test.mjs` drives every path — success, a 400, a
 * timeout, a group message — without a socket or a running instance.
 *
 * Two things this file deliberately does **not** do:
 *   - it does not import anything. Node 24's built-in `fetch` is enough, so the
 *     server keeps its zero-dependency promise.
 *   - it does not guess the payload shape. Evolution's v1 and v2 differ, so the
 *     send path is configurable (`WHATSAPP_SEND_PATH`) and the webhook reader
 *     accepts both the single-object and the batched-array form. Check the
 *     instance's own `/docs` — not a snippet from the internet, including this
 *     one.
 */

import { timingSafeEqual } from 'node:crypto';

/** Evolution's phone identifiers, as they arrive in a webhook. */
const GROUP_SUFFIX = '@g.us';
const STATUS_JID = 'status@broadcast';

/**
 * The digits of a WhatsApp JID: `421901234567@s.whatsapp.net` -> `421901234567`.
 *
 * A device suffix (`421901234567:12@…`) is dropped, because the number is what
 * identifies a person, not the phone they happen to be writing from.
 */
export function phoneFromJid(jid) {
  const bare = String(jid ?? '').split('@')[0].split(':')[0];
  return bare.replace(/[^0-9]/g, '');
}

/** True for a group chat. Groups have no dose schedule and must be ignored. */
export function isGroupJid(jid) {
  return String(jid ?? '').endsWith(GROUP_SUFFIX);
}

/** True for the status/broadcast feed, which is not a conversation. */
export function isBroadcastJid(jid) {
  const value = String(jid ?? '');
  return value === STATUS_JID || value.endsWith('@broadcast');
}

/** True when the server is configured to send at all. */
export function isWhatsAppConfigured(config) {
  return Boolean(config?.whatsappUrl && config?.whatsappApiKey && config?.whatsappInstance);
}

/**
 * The URL a message is posted to.
 *
 * `WHATSAPP_SEND_PATH` may contain `{instance}`; the default is Evolution v2's.
 */
export function sendUrl(config) {
  const base = String(config.whatsappUrl).trim().replace(/\/+$/, '');
  const path = String(config.whatsappSendPath ?? '/message/sendText/{instance}').replace(
    '{instance}',
    encodeURIComponent(config.whatsappInstance),
  );
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** The plain text of an Evolution message body, or '' when it carries none. */
function textOf(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.conversation === 'string') return message.conversation;
  if (typeof message.extendedTextMessage?.text === 'string') {
    return message.extendedTextMessage.text;
  }
  // Not relied on anywhere — unofficial clients have been unstable about
  // buttons for a long time — but if one does arrive, reading it costs nothing.
  if (typeof message.buttonsResponseMessage?.selectedDisplayText === 'string') {
    return message.buttonsResponseMessage.selectedDisplayText;
  }
  return '';
}

/** Evolution sends seconds; some builds send milliseconds. Normalise to ms. */
function toMillis(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number < 100_000_000_000 ? number * 1000 : number;
}

/**
 * Every message-shaped object in a webhook, whether it arrived singly or
 * batched. Evolution has shipped both, and a payload we cannot read is a
 * reminder that silently never stops.
 */
function candidates(payload) {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages)) return data.messages;
  if (data && typeof data === 'object') return [data];
  return [];
}

/**
 * The single inbound text message worth acting on, or null.
 *
 * Returns `{ phone, text, messageId, pushName, atMs }`.
 *
 * The three filters here are the difference between a working bot and a loop:
 *   - **our own messages** come back through the webhook. Without the `fromMe`
 *     check, every reply we send triggers another reply, forever.
 *   - **groups** have no plan attached, and would let a stranger's chat drive a
 *     subscriber's schedule.
 *   - **status/broadcast** is not a conversation at all.
 */
export function extractInbound(payload) {
  for (const candidate of candidates(payload)) {
    const key = candidate?.key ?? {};
    if (key.fromMe === true) continue;

    const jid = key.remoteJid;
    if (isGroupJid(jid) || isBroadcastJid(jid)) continue;

    const text = textOf(candidate.message).trim();
    if (!text) continue;

    const phone = phoneFromJid(jid);
    if (!phone) continue;

    return {
      phone,
      text,
      messageId: typeof key.id === 'string' ? key.id : '',
      pushName: String(candidate.pushName ?? '').slice(0, 40),
      atMs: toMillis(candidate.messageTimestamp),
    };
  }
  return null;
}

/**
 * A `connection.update` event, or null when the payload is anything else.
 *
 * This is the event that matters most and is the easiest to forget. Every other
 * failure here is per-subscriber; this one is total. If the link between
 * Evolution and WhatsApp drops — the phone went offline, the session was
 * revoked, someone scanned the code elsewhere — then **every reminder for every
 * user stops**, and nothing on the outside looks wrong. `/api/health` still
 * answers, the worker still ticks, the rows still say `active`. The only signal
 * is this event.
 *
 * Returns `{ instance, state, reason }`, where `state` is Evolution's own word:
 * `open` (linked and working), `connecting`, or `close`.
 */
export function extractConnectionUpdate(payload) {
  const event = String(payload?.event ?? '')
    .toLowerCase()
    .replace(/[._-]/g, '');
  if (event !== 'connectionupdate') return null;

  const data = payload?.data;
  const rawInstance = data?.instance ?? payload?.instance;
  const instance =
    typeof rawInstance === 'string' ? rawInstance : (rawInstance?.instance ?? '');

  // Some builds nest the state under `data.instance`, others put it on `data`.
  const state = typeof data?.state === 'string' ? data.state : rawInstance?.state;
  if (typeof state !== 'string' || state === '') return null;

  return {
    instance: String(instance),
    state: state.toLowerCase(),
    reason: data?.statusReason ?? null,
  };
}

/** Whether a connection state means messages can actually go out. */
export function isConnectionOpen(state) {
  return String(state ?? '').toLowerCase() === 'open';
}

/**
 * Whether a caller presented the webhook's own secret.
 *
 * This matters more than it looks. `isOriginAllowed` in `guard.mjs` treats a
 * **missing** `Origin` as acceptable — correctly, because that is the app's own
 * same-origin fetch — which means the CORS guard gives a webhook nothing at all.
 * Evolution sends no `Origin`, so without this check anyone who learns the path
 * could fake a `STOP` for any number, or a `START` for someone else's code.
 *
 * Compared with `timingSafeEqual` so the comparison itself cannot be measured.
 */
export function secretMatches(given, expected) {
  const a = Buffer.from(String(given ?? ''), 'utf8');
  const b = Buffer.from(String(expected ?? ''), 'utf8');
  if (b.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The `send(phone, text)` the worker calls.
 *
 * A non-2xx answer throws with the status and a slice of the body: a silent
 * failure here is a dose nobody is told about, so the caller must be able to
 * count it and eventually give up (see `shouldPark`).
 */
export function createWhatsAppSender(config, { fetchImpl = fetch } = {}) {
  return async function sendText(phone, text) {
    if (!isWhatsAppConfigured(config)) throw new Error('whatsapp_not_configured');

    const response = await fetchImpl(sendUrl(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.whatsappApiKey,
      },
      body: JSON.stringify({ number: phone, text }),
      signal: AbortSignal.timeout(Number(config.whatsappTimeoutMs ?? 15_000)),
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = String(await response.text()).slice(0, 200);
      } catch {
        /* a body we cannot read is not worth failing differently over */
      }
      throw new Error(`whatsapp_send_failed ${response.status} ${detail}`.trim());
    }

    return true;
  };
}

