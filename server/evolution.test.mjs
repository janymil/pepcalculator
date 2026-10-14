import { describe, expect, it } from 'vitest';
import {
  createWhatsAppSender,
  extractConnectionUpdate,
  extractInbound,
  isBroadcastJid,
  isConnectionOpen,
  isGroupJid,
  isWhatsAppConfigured,
  phoneFromJid,
  secretMatches,
  sendUrl,
} from './evolution.mjs';

const CONFIG = {
  whatsappUrl: 'http://127.0.0.1:8080',
  whatsappApiKey: 'a-very-long-key',
  whatsappInstance: 'pepstool',
  whatsappSendPath: '/message/sendText/{instance}',
  whatsappTimeoutMs: 5_000,
};

/** A `fetch` that records what it was asked, and answers however we say. */
function fakeFetch(response = { ok: true, status: 200, body: '{}' }) {
  const calls = [];
  const impl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: response.ok,
      status: response.status,
      text: async () => response.body,
    };
  };
  impl.calls = calls;
  return impl;
}

/** A webhook body in the shape Evolution actually posts. */
function webhook(overrides = {}) {
  return {
    event: 'messages.upsert',
    instance: 'pepstool',
    data: {
      key: {
        remoteJid: '421900000000@s.whatsapp.net',
        fromMe: false,
        id: '3A1B2C3D',
      },
      pushName: 'Alex',
      message: { conversation: 'STOP' },
      messageTimestamp: 1_768_000_000,
      ...overrides,
    },
  };
}

describe('reading a WhatsApp identifier', () => {
  it('takes the number out of a JID', () => {
    expect(phoneFromJid('421900000000@s.whatsapp.net')).toBe('421900000000');
    // Older clients and some builds append the device.
    expect(phoneFromJid('421900000000:12@s.whatsapp.net')).toBe('421900000000');
  });

  it('answers empty for anything that is not a number', () => {
    expect(phoneFromJid(undefined)).toBe('');
    expect(phoneFromJid('status@broadcast')).toBe('');
    expect(phoneFromJid('@s.whatsapp.net')).toBe('');
  });

  it('recognises a group', () => {
    expect(isGroupJid('120363000000000000@g.us')).toBe(true);
    expect(isGroupJid('421900000000@s.whatsapp.net')).toBe(false);
  });

  it('recognises the status feed and other broadcasts', () => {
    expect(isBroadcastJid('status@broadcast')).toBe(true);
    expect(isBroadcastJid('1234@broadcast')).toBe(true);
    expect(isBroadcastJid('421900000000@s.whatsapp.net')).toBe(false);
  });
});

describe('configuration', () => {
  it('is off until the URL, the key and the instance are all there', () => {
    expect(isWhatsAppConfigured(CONFIG)).toBe(true);
    expect(isWhatsAppConfigured({ ...CONFIG, whatsappApiKey: '' })).toBe(false);
    expect(isWhatsAppConfigured({ ...CONFIG, whatsappUrl: '' })).toBe(false);
    expect(isWhatsAppConfigured({ ...CONFIG, whatsappInstance: undefined })).toBe(false);
    expect(isWhatsAppConfigured({})).toBe(false);
  });

  it('builds the send URL, tolerating a trailing slash and a custom path', () => {
    expect(sendUrl(CONFIG)).toBe('http://127.0.0.1:8080/message/sendText/pepstool');
    expect(sendUrl({ ...CONFIG, whatsappUrl: 'http://127.0.0.1:8080/' })).toBe(
      'http://127.0.0.1:8080/message/sendText/pepstool',
    );
    // v1 and v2 have differed, so the path is the operator's to set.
    expect(sendUrl({ ...CONFIG, whatsappSendPath: '/send/text' })).toBe(
      'http://127.0.0.1:8080/send/text',
    );
  });
});

describe('reading an inbound message', () => {
  it('reads a plain text message', () => {
    expect(extractInbound(webhook())).toEqual({
      phone: '421900000000',
      text: 'STOP',
      messageId: '3A1B2C3D',
      pushName: 'Alex',
      atMs: 1_768_000_000_000,
    });
  });

  it('reads the extended-text form too', () => {
    const payload = webhook({ message: { extendedTextMessage: { text: '  PAUSE  ' } } });
    expect(extractInbound(payload).text).toBe('PAUSE');
  });

  it('drops our own messages, so a reply can never answer itself', () => {
    // Without this the bot talks to itself forever: every send comes back.
    expect(extractInbound(webhook({ key: { remoteJid: '421900000000@s.whatsapp.net', fromMe: true, id: 'x' } }))).toBeNull();
  });

  it('drops group messages', () => {
    const group = webhook({ key: { remoteJid: '120363000000000000@g.us', fromMe: false, id: 'x' } });
    expect(extractInbound(group)).toBeNull();
  });

  it('drops the status feed', () => {
    const status = webhook({ key: { remoteJid: 'status@broadcast', fromMe: false, id: 'x' } });
    expect(extractInbound(status)).toBeNull();
  });

  it('drops a message that carries no text at all', () => {
    expect(extractInbound(webhook({ message: { imageMessage: {} } }))).toBeNull();
    expect(extractInbound(webhook({ message: {} }))).toBeNull();
  });

  it('reads a batched payload, taking the first usable message', () => {
    const batched = {
      event: 'messages.upsert',
      data: [
        { key: { remoteJid: '421900000000@s.whatsapp.net', fromMe: true, id: 'a' } },
        { key: { remoteJid: '120363@g.us', fromMe: false, id: 'b' }, message: { conversation: 'x' } },
        {
          key: { remoteJid: '421911111111@s.whatsapp.net', fromMe: false, id: 'c' },
          message: { conversation: 'STATUS' },
        },
      ],
    };
    expect(extractInbound(batched)).toMatchObject({ phone: '421911111111', text: 'STATUS' });
  });

  it('normalises a millisecond timestamp, and leaves a silly one alone', () => {
    expect(extractInbound(webhook({ messageTimestamp: 1_768_000_000_000 })).atMs).toBe(
      1_768_000_000_000,
    );
    expect(extractInbound(webhook({ messageTimestamp: 0 })).atMs).toBeNull();
    expect(extractInbound(webhook({ messageTimestamp: 'nonsense' })).atMs).toBeNull();
  });

  it('never throws, whatever Evolution posts', () => {
    for (const payload of [null, undefined, {}, { data: null }, { data: 'x' }, { data: [] }]) {
      expect(() => extractInbound(payload)).not.toThrow();
      expect(extractInbound(payload)).toBeNull();
    }
  });
});

describe('the link state', () => {
  it('reads the state when it sits on the data object', () => {
    expect(
      extractConnectionUpdate({
        event: 'connection.update',
        instance: 'pepstool',
        data: { instance: 'pepstool', state: 'open' },
      }),
    ).toEqual({ instance: 'pepstool', state: 'open', reason: null });
  });

  it('reads the state when it is nested under the instance', () => {
    // v1 and v2 have differed here too, so both shapes are accepted.
    expect(
      extractConnectionUpdate({
        event: 'connection.update',
        data: { instance: { instanceName: 'pepstool', state: 'close' }, statusReason: 401 },
      }),
    ).toMatchObject({ state: 'close', reason: 401 });
  });

  it('spells the event however the build spells it', () => {
    for (const event of ['connection.update', 'CONNECTION_UPDATE', 'connection-update']) {
      expect(extractConnectionUpdate({ event, data: { state: 'open' } }), event).not.toBeNull();
    }
  });

  it('answers nothing for any other event', () => {
    for (const event of ['messages.upsert', 'qrcode.updated', 'messages.update', '', undefined]) {
      expect(extractConnectionUpdate({ event, data: { state: 'open' } }), String(event)).toBeNull();
    }
    expect(extractConnectionUpdate(null)).toBeNull();
    expect(extractConnectionUpdate({ event: 'connection.update' })).toBeNull();
    expect(extractConnectionUpdate({ event: 'connection.update', data: { state: 42 } })).toBeNull();
  });

  it('knows which states can actually deliver a message', () => {
    expect(isConnectionOpen('open')).toBe(true);
    expect(isConnectionOpen('OPEN')).toBe(true);
    expect(isConnectionOpen('close')).toBe(false);
    expect(isConnectionOpen('connecting')).toBe(false);
    expect(isConnectionOpen(undefined)).toBe(false);
  });
});

describe('the webhook secret', () => {
  it('accepts the secret it was configured with, and nothing else', () => {
    expect(secretMatches('s3cret-path', 's3cret-path')).toBe(true);
    expect(secretMatches('s3cret-pat', 's3cret-path')).toBe(false);
    expect(secretMatches('', 's3cret-path')).toBe(false);
    expect(secretMatches(undefined, 's3cret-path')).toBe(false);
    expect(secretMatches('anything', undefined)).toBe(false);
    expect(secretMatches('anything', '')).toBe(false);
  });
});

describe('sending a message', () => {
  it('posts the number and the text, with the key in the header', async () => {
    const impl = fakeFetch();
    const send = createWhatsAppSender(CONFIG, { fetchImpl: impl });
    await send('421900000000', 'hello');

    expect(impl.calls).toHaveLength(1);
    expect(impl.calls[0].url).toBe('http://127.0.0.1:8080/message/sendText/pepstool');
    expect(impl.calls[0].options.method).toBe('POST');
    expect(impl.calls[0].options.headers.apikey).toBe('a-very-long-key');
    expect(JSON.parse(impl.calls[0].options.body)).toEqual({
      number: '421900000000',
      text: 'hello',
    });
  });

  it('refuses to send when it is not configured, rather than failing silently', async () => {
    const send = createWhatsAppSender({}, { fetchImpl: fakeFetch() });
    await expect(send('421900000000', 'hello')).rejects.toThrow('whatsapp_not_configured');
  });

  it('throws with the status and the body when Evolution refuses', async () => {
    // The caller counts these, and parks a reminder that keeps failing.
    const impl = fakeFetch({ ok: false, status: 400, body: '{"message":"bad number"}' });
    const send = createWhatsAppSender(CONFIG, { fetchImpl: impl });
    await expect(send('421900000000', 'hello')).rejects.toThrow(/whatsapp_send_failed 400/);
    await expect(send('421900000000', 'hello')).rejects.toThrow(/bad number/);
  });

  it('lets a network failure through instead of swallowing it', async () => {
    const send = createWhatsAppSender(CONFIG, {
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(send('421900000000', 'hello')).rejects.toThrow('ECONNREFUSED');
  });
});

