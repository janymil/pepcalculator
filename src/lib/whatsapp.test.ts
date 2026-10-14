import { describe, expect, it } from 'vitest';
import {
  fetchWhatsappReminders,
  formatWhatsappNumber,
  localTimeZone,
  planSignature,
  reminderIsStale,
  removeWhatsappReminder,
  ruleFromSchedule,
  saveWhatsappReminder,
  type WhatsappPlan,
  type WhatsappReminder,
} from './whatsapp';
import type { VialSchedule } from './schedule';

const CODE = 'PC-7K2M-9QXA-4BCD-EFGH-JKLM-NPQR';
const BASE = 'https://sync.example';

const SCHEDULE: VialSchedule = {
  times: ['08:00', '20:00'],
  repeat: 'interval',
  weekdays: [],
  intervalDays: 2,
  phases: [
    { days: 14, doseAmount: 250 },
    { days: 0, doseAmount: 500 },
  ],
  startsOn: '2026-01-05',
  durationValue: 0,
  durationUnit: 'ongoing',
};

/** A `fetch` that records what it was asked and answers however we say. */
function recordingFetch(response: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return response;
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('ruleFromSchedule', () => {
  it('carries only what decides when a dose falls', () => {
    expect(ruleFromSchedule(SCHEDULE)).toEqual({
      times: ['08:00', '20:00'],
      repeat: 'interval',
      weekdays: [],
      intervalDays: 2,
      startsOn: '2026-01-05',
      durationValue: 0,
      durationUnit: 'ongoing',
    });
  });

  it('leaves the titration phases behind', () => {
    // Phases change the *dose*. A reminder only needs the *time*, so sending
    // them would hand the server a plan it cannot act on.
    expect(ruleFromSchedule(SCHEDULE)).not.toHaveProperty('phases');
  });

  it('fills in a missing interval rather than sending undefined', () => {
    const legacy: VialSchedule = { ...SCHEDULE, intervalDays: undefined };
    expect(ruleFromSchedule(legacy).intervalDays).toBe(0);
  });
});

describe('localTimeZone', () => {
  it('reports a zone name, or an empty string, but never throws', () => {
    const zone = localTimeZone();
    expect(typeof zone).toBe('string');
  });
});

describe('planSignature', () => {
  const RULE = ruleFromSchedule(SCHEDULE);

  /** A plan with everything the signature looks at. */
  const plan = (over: Partial<WhatsappPlan> = {}): WhatsappPlan => ({
    id: 'vial-1',
    label: 'Morning',
    person: '',
    doses: [{ from: '2026-01-01', dose: '10 units', draw: 'Draw to 10 units' }],
    rule: RULE,
    ...over,
  });

  it('is the same for the same plan, and different for a different one', () => {
    expect(planSignature(plan())).toBe(planSignature(plan()));
    expect(planSignature(plan())).not.toBe(planSignature(plan({ label: 'Evening' })));
    expect(planSignature(plan())).not.toBe(
      planSignature(plan({ doses: [{ from: '2026-01-01', dose: '5 units', draw: '' }] })),
    );
  });

  it('ignores the order of times and weekdays', () => {
    // The server sorts them, the app may not. A signature that cared would
    // re-upload on every render, for ever.
    expect(planSignature(plan({ rule: { ...RULE, times: ['20:00', '08:00'] } }))).toBe(
      planSignature(plan({ rule: { ...RULE, times: ['08:00', '20:00'] } })),
    );
    const mon = plan({ rule: { ...RULE, repeat: 'weekdays', weekdays: [5, 1] } });
    const mon2 = plan({ rule: { ...RULE, repeat: 'weekdays', weekdays: [1, 5] } });
    expect(planSignature(mon)).toBe(planSignature(mon2));
  });

  it('notices every field that decides when a dose falls', () => {
    const changes = [
      { times: ['09:00', '20:00'] },
      { repeat: 'interval' as const, intervalDays: 3 },
      { startsOn: '2026-02-01' },
      { durationValue: 4, durationUnit: 'weeks' as const },
    ];
    for (const change of changes) {
      const other = plan({ rule: { ...RULE, ...change } });
      expect(planSignature(other), JSON.stringify(change)).not.toBe(planSignature(plan()));
    }
  });

  it('notices a change to the draw, because that number is printed', () => {
    const other = plan({
      doses: [{ from: '2026-01-01', dose: '10 units', draw: 'Draw to 12 units' }],
    });
    expect(planSignature(other)).not.toBe(planSignature(plan()));
  });

  it('notices whose vial it is', () => {
    // A name that changed has to reach the message, or two people stay divided
    // under one heading for ever.
    expect(planSignature(plan({ person: 'Ana' }))).not.toBe(planSignature(plan()));
  });

  it('answers nothing for a plan with no rule', () => {
    expect(planSignature({ label: 'x', person: '', doses: [], rule: null })).toBe('');
  });
});

describe('reminderIsStale', () => {
  const plan: WhatsappPlan = {
    id: 'vial-1',
    label: 'Morning protocol',
    person: '',
    doses: [{ from: '2026-01-01', dose: '10 units', draw: '' }],
    rule: ruleFromSchedule(SCHEDULE),
  };

  /** The stored reminder, matching `plan` unless told otherwise. */
  const stored = (overrides: Partial<WhatsappReminder> = {}): WhatsappReminder => ({
    code: 'K7M2QP',
    slot: plan.id,
    link: 'https://wa.me/421900000000?text=START%20K7M2QP',
    label: plan.label,
    dose: '10 units',
    draw: '',
    person: '',
    doses: plan.doses,
    status: 'active',
    linked: true,
    nextRunAt: '2026-01-16T07:00:00.000Z',
    rule: plan.rule,
    timeZone: 'Europe/Bratislava',
    lang: 'en',
    ...overrides,
  });

  it('says nothing to do when the server already matches the plan', () => {
    expect(reminderIsStale(plan, stored(), 'en')).toBe(false);
  });

  it('notices a changed time, cadence or dose', () => {
    expect(reminderIsStale(plan, stored({ rule: { ...plan.rule, times: ['07:00'] } }), 'en')).toBe(true);
    expect(reminderIsStale(plan, stored({ rule: { ...plan.rule, intervalDays: 3 } }), 'en')).toBe(true);
    // The dose lives in the timeline now, not in one field.
    expect(
      reminderIsStale(plan, stored({ doses: [{ from: '2026-01-01', dose: '5 units', draw: '' }] }), 'en'),
    ).toBe(true);
    expect(reminderIsStale({ ...plan, label: 'Renamed' }, stored(), 'en')).toBe(true);
  });

  it('never touches an unclaimed code', () => {
    // Nothing is linked, so there is no subscriber to correct — and pushing
    // would create noise for a link the user never finished setting up.
    expect(reminderIsStale(plan, stored({ linked: false }), 'en')).toBe(false);
    expect(reminderIsStale(plan, null, 'en')).toBe(false);
    expect(reminderIsStale(null, stored(), 'en')).toBe(false);
  });

  it('assumes the worst when the server did not say what it holds', () => {
    // An older server answers without a rule. Re-uploading costs one request;
    // assuming it is fine costs a wrong reminder every day.
    expect(reminderIsStale(plan, stored({ rule: null }), 'en')).toBe(true);
  });

  it('re-uploads when the language has changed, or it would never change back', () => {
    // Every word of the message comes from the language stored on the row, and
    // nothing else would ever refresh it: switching to Spanish would leave
    // English arriving for ever, with nothing saying so.
    expect(reminderIsStale(plan, stored({ lang: 'en' }), 'es')).toBe(true);
    expect(reminderIsStale(plan, stored({ lang: 'es' }), 'es')).toBe(false);
  });
});

describe('saveWhatsappReminder', () => {
  it('puts the rule under the hashed identity, never the code itself', async () => {
    const { calls, impl } = recordingFetch(
      jsonResponse({ code: 'K7M2QP', link: 'https://wa.me/421900000000?text=START%20K7M2QP' }),
    );

    const result = await saveWhatsappReminder(
      BASE,
      CODE,
      {
        label: 'Morning protocol',
        dose: '10 units',
        draw: '',
        person: '',
        slot: 'vial-1',
        doses: [{ from: '2026-01-01', dose: '10 units', draw: '' }],
        rule: ruleFromSchedule(SCHEDULE),
        timeZone: 'Europe/Bratislava',
        lang: 'en',
      },
      impl,
    );

    expect(result.ok).toBe(true);
    expect(calls[0].url).toMatch(/^https:\/\/sync\.example\/api\/wa\/[a-f0-9]{64}$/);
    expect(calls[0].url).not.toContain('7K2M');
    expect(calls[0].init?.method).toBe('PUT');

    const sent = JSON.parse(String(calls[0].init?.body));
    expect(sent.label).toBe('Morning protocol');
    expect(sent.timeZone).toBe('Europe/Bratislava');
    expect(sent.rule).not.toHaveProperty('phases');
  });

  it('hands back the code and the link the user taps', async () => {
    const { impl } = recordingFetch(
      jsonResponse({
        code: 'K7M2QP',
        link: 'https://wa.me/421900000000?text=START%20K7M2QP',
        expiresAt: '2026-01-22T00:00:00.000Z',
        status: 'pending',
        linked: false,
        whatsappNumber: '421900000000',
      }),
    );

    const result = await saveWhatsappReminder(
      BASE,
      CODE,
      { slot: 'vial-1', label: 'x', person: '', dose: 'y', draw: '', doses: [], rule: ruleFromSchedule(SCHEDULE), timeZone: 'UTC', lang: 'en' },
      impl,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        code: 'K7M2QP',
        link: 'https://wa.me/421900000000?text=START%20K7M2QP',
        expiresAt: '2026-01-22T00:00:00.000Z',
        status: 'pending',
        linked: false,
        whatsappNumber: '421900000000',
      },
    });
  });

  it('says WhatsApp is switched off rather than pretending it worked', async () => {
    const { impl } = recordingFetch(jsonResponse({ error: 'whatsapp_not_configured' }, 503));
    const result = await saveWhatsappReminder(
      BASE,
      CODE,
      { slot: 'vial-1', label: 'x', person: '', dose: 'y', draw: '', doses: [], rule: ruleFromSchedule(SCHEDULE), timeZone: 'UTC', lang: 'en' },
      impl,
    );
    expect(result).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('reports a server error, a bad body and a dead network without throwing', async () => {
    const server = recordingFetch(jsonResponse({}, 500));
    const invalid = recordingFetch(jsonResponse({ code: 'K7M2QP' }));
    const offline = recordingFetch(null);

    const body = { slot: 'vial-1', label: 'x', person: '', dose: 'y', draw: '', doses: [], rule: ruleFromSchedule(SCHEDULE), timeZone: 'UTC', lang: 'en' };
    expect(await saveWhatsappReminder(BASE, CODE, body, server.impl)).toEqual({
      ok: false,
      reason: 'server',
    });
    expect(await saveWhatsappReminder(BASE, CODE, body, invalid.impl)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(
      await saveWhatsappReminder(BASE, CODE, body, (() => {
        throw new Error('offline');
      }) as unknown as typeof fetch),
    ).toEqual({ ok: false, reason: 'network' });
    expect(
      await saveWhatsappReminder('', CODE, body, offline.impl),
    ).toEqual({ ok: false, reason: 'no-code' });
  });
});

describe('formatWhatsappNumber', () => {
  it('adds the plus a person expects to see', () => {
    // The server stores bare digits because that is what `wa.me` needs, and a
    // number shown as `16728899397` reads as a typo rather than a phone number.
    expect(formatWhatsappNumber('16728899397')).toBe('+16728899397');
  });

  it('does not double a plus that is already there', () => {
    expect(formatWhatsappNumber('+421900000000')).toBe('+421900000000');
  });

  it('answers nothing for nothing, rather than a lone plus', () => {
    expect(formatWhatsappNumber('')).toBe('');
  });

  it('ignores surrounding whitespace', () => {
    expect(formatWhatsappNumber('  16728899397  ')).toBe('+16728899397');
  });
});

describe('fetchWhatsappReminders', () => {
  it('reads the list back, including the rule the server is working from', async () => {
    const { calls, impl } = recordingFetch(
      jsonResponse({
        whatsappNumber: '421900000000',
        reminders: [
          {
            code: 'K7M2QP',
            link: 'https://wa.me/421900000000?text=START%20K7M2QP',
            label: 'Morning protocol',
            dose: '10 units',
            draw: '',
            person: '',
            slot: 'vial-1',
            doses: [{ from: '2026-01-01', dose: '10 units', draw: '' }],
            lang: 'en',
            status: 'active',
            linked: true,
            nextRunAt: '2026-01-16T07:00:00.000Z',
            rule: {
              times: ['08:00'],
              repeat: 'daily',
              weekdays: [],
              intervalDays: 0,
              startsOn: '2020-01-01',
              durationValue: 0,
              durationUnit: 'ongoing',
            },
            timeZone: 'Europe/Bratislava',
          },
        ],
      }),
    );

    const result = await fetchWhatsappReminders(BASE, CODE, impl);
    expect(result).toEqual({
      ok: true,
      value: {
        // The number comes back so the panel can show it with a `+`, for anyone
        // whose phone will not open the link.
        whatsappNumber: '421900000000',
        reminders: [
          {
            code: 'K7M2QP',
            // The link is rebuilt server-side on every read, so a reloaded page
            // still has one to offer for a reminder that was never claimed.
            link: 'https://wa.me/421900000000?text=START%20K7M2QP',
            label: 'Morning protocol',
            dose: '10 units',
            draw: '',
            person: '',
            slot: 'vial-1',
            doses: [{ from: '2026-01-01', dose: '10 units', draw: '' }],
            lang: 'en',
            status: 'active',
            linked: true,
            nextRunAt: '2026-01-16T07:00:00.000Z',
            // The rule round-trips, which is what lets the app notice a stale one.
            rule: {
              times: ['08:00'],
              repeat: 'daily',
              weekdays: [],
              intervalDays: 0,
              startsOn: '2020-01-01',
              durationValue: 0,
              durationUnit: 'ongoing',
            },
            timeZone: 'Europe/Bratislava',
          },
        ],
      },
    });
    expect(calls[0].url).toMatch(/^https:\/\/sync\.example\/api\/wa\/[a-f0-9]{64}$/);
  });

  it('refuses a rule that is not shaped like one, rather than trusting it', async () => {
    // A `null` rule reads as stale in `reminderIsStale`, which means "upload
    // again" — the safe direction to be wrong in.
    const { impl } = recordingFetch(
      jsonResponse({ reminders: [{ code: 'K7M2QP', rule: { nonsense: true } }] }),
    );
    const result = await fetchWhatsappReminders(BASE, CODE, impl);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.reminders[0].rule).toBeNull();
  });

  it('drops anything that is not shaped like a reminder', async () => {
    const { impl } = recordingFetch(
      jsonResponse({ reminders: [null, 'nope', { label: 'no code' }, { code: 'K7M2QP' }] }),
    );

    const result = await fetchWhatsappReminders(BASE, CODE, impl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reminders).toHaveLength(1);
      expect(result.value.reminders[0]).toEqual({
        code: 'K7M2QP',
        link: '',
        slot: '',
        label: '',
        dose: '',
        draw: '',
        person: '',
        doses: [],
        status: 'pending',
        linked: false,
        nextRunAt: null,
        rule: null,
        timeZone: '',
        lang: '',
      });
    }
  });

  it('treats a missing list as nothing stored', async () => {
    const { impl } = recordingFetch(jsonResponse({}));
    const result = await fetchWhatsappReminders(BASE, CODE, impl);
    expect(result).toEqual({ ok: true, value: { reminders: [], whatsappNumber: '' } });
  });

  it('reports being switched off, and a dead network, without throwing', async () => {
    const off = recordingFetch(jsonResponse({}, 503));
    expect(await fetchWhatsappReminders(BASE, CODE, off.impl)).toEqual({
      ok: false,
      reason: 'not-configured',
    });
    expect(
      await fetchWhatsappReminders(
        BASE,
        CODE,
        (() => {
          throw new Error('offline');
        }) as unknown as typeof fetch,
      ),
    ).toEqual({ ok: false, reason: 'network' });
  });
});

describe('removeWhatsappReminder', () => {
  it('deletes under the same hashed identity', async () => {
    const { calls, impl } = recordingFetch(jsonResponse({ ok: true }));
    const result = await removeWhatsappReminder(BASE, CODE, { fetchImpl: impl });

    expect(result).toEqual({ ok: true, value: true });
    // No `slot`: the whole channel, which is what "turn it off" means.
    expect(calls[0].url).toMatch(/^https:\/\/sync\.example\/api\/wa\/[a-f0-9]{64}$/);
    expect(calls[0].init?.method).toBe('DELETE');
  });

  it('names one vial when given a slot, so the others keep their reminders', async () => {
    const { calls, impl } = recordingFetch(jsonResponse({ ok: true }));
    await removeWhatsappReminder(BASE, CODE, { slot: 'vial-1', fetchImpl: impl });

    expect(calls[0].url).toMatch(/^https:\/\/sync\.example\/api\/wa\/[a-f0-9]{64}\?slot=vial-1$/);
  });

  it('reports a failure rather than claiming success', async () => {
    const { impl } = recordingFetch(jsonResponse({}, 500));
    expect(await removeWhatsappReminder(BASE, CODE, { fetchImpl: impl })).toEqual({
      ok: false,
      reason: 'server',
    });
  });
});

