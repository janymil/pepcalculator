import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import type { WhatsAppPlan } from '../hooks/useWhatsAppReminders';
import { ruleFromSchedule } from '../lib/whatsapp';
import { RemindersPanel, type RemindersPanelProps } from './RemindersPanel';

const copy = DICTIONARIES.en.reminders;

const SCHEDULE = {
  times: ['08:00'],
  repeat: 'daily' as const,
  weekdays: [] as number[],
  intervalDays: 0,
  startsOn: '2026-01-01',
  durationValue: 0,
  durationUnit: 'ongoing' as const,
};

/** One vial's plan, as the panel receives it. */
const PLAN: WhatsAppPlan = {
  id: 'vial-1',
  label: 'Testosterone',
  person: '',
  doses: [{ from: '2026-01-01', dose: '250 mg', draw: 'Draw to 25 units' }],
  rule: ruleFromSchedule(SCHEDULE),
};

/** Every prop the panel needs, with the WhatsApp channel at a chosen state. */
function render(overrides: Partial<RemindersPanelProps> = {}): string {
  const props: RemindersPanelProps = {
    enabled: false,
    permission: 'default',
    next: null,
    pushStatus: 'off',
    todayIso: '2026-01-01',
    installed: false,
    onToggle: () => {},
    onRequestPermission: () => {},
    whatsappStatus: 'needs-code',
    whatsappLink: null,
    whatsappCode: '',
    whatsappNumber: '',
    whatsappPlans: [],
    whatsappBusy: false,
    onConnectWhatsApp: () => {},
    onDisconnectWhatsApp: () => {},
    ...overrides,
  };
  return renderToString(
    <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
      <RemindersPanel {...props} />
    </I18nProvider>,
  );
}

describe('RemindersPanel — the WhatsApp steps', () => {
  it('says what is missing before it offers a button, instead of a dead one', () => {
    const html = render({ whatsappStatus: 'needs-code' });
    expect(html).toContain(copy.whatsappNeedsCode);
    // Nothing is reachable yet, and the setup button is disabled rather than
    // pressable-but-useless — the old panel showed a live button that did
    // nothing and explained itself only in prose further down.
    expect(html).toContain('wa-step is-todo');
    expect(html).toContain('disabled');
  });

  it('never shows a link or a code before a reminder exists', () => {
    // The old panel put the tap-to-start link, the code and the fallback
    // sentence on screen in the `ready` state — before anything had been set up.
    const html = render({ whatsappStatus: 'ready', whatsappLink: 'https://wa.me/1?text=x', whatsappCode: 'GFXTJM' });
    expect(html).not.toContain('https://wa.me');
    expect(html).not.toContain('GFXTJM');
  });

  it('shows the plan being subscribed to, so the tap is not blind', () => {
    const html = render({ whatsappStatus: 'ready', whatsappPlans: [PLAN] });
    expect(html).toContain('Testosterone');
    expect(html).toContain('250 mg');
    expect(html).toContain('Every day at 08:00');
  });

  it('names the weekday names the plan actually uses', () => {
    const html = render({
      whatsappStatus: 'ready',
      whatsappPlans: [
        {
          ...PLAN,
          label: 'X',
          doses: [{ from: '2026-01-01', dose: '1 mg', draw: '' }],
          rule: { ...PLAN.rule, repeat: 'weekdays', weekdays: [1, 3] },
        },
      ],
    });
    // `0` is Sunday, so 1 and 3 are Monday and Wednesday, and the names come
    // from `Intl` rather than seven strings per dictionary.
    expect(html).toContain('Mon');
    expect(html).toContain('Wed');
  });

  it('hands over the link, the code and a number a person can read', () => {
    const html = render({
      whatsappStatus: 'waiting',
      whatsappLink: 'https://wa.me/16728899397?text=START%20GFXTJM',
      whatsappCode: 'GFXTJM',
      whatsappNumber: '16728899397',
      whatsappPlans: [PLAN],
    });
    expect(html).toContain('https://wa.me/16728899397');
    expect(html).toContain('START GFXTJM');
    // Bare digits read as a typo; the country code has to be there.
    expect(html).toContain('+16728899397');
    expect(html).toContain(copy.whatsappWaiting);
  });

  it('reports the link from a stored reminder, not only from this session', () => {
    // This is the reload case: `pairing` is gone but the reminder row carries a
    // link, so the user is not stranded at "waiting" with nothing to tap.
    const html = render({
      whatsappStatus: 'waiting',
      whatsappLink: 'https://wa.me/16728899397?text=START%20GFXTJM',
      whatsappCode: 'GFXTJM',
      whatsappNumber: '16728899397',
    });
    expect(html).toContain('https://wa.me/16728899397');
    expect(html).toContain('START GFXTJM');
  });

  it('closes the flow out when the number is linked', () => {
    const html = render({
      whatsappStatus: 'linked',
      whatsappLink: 'https://wa.me/16728899397?text=START%20GFXTJM',
      whatsappCode: 'GFXTJM',
      whatsappNumber: '16728899397',
      whatsappPlans: [PLAN],
    });
    expect(html).toContain(copy.whatsappLinked);
    expect(html).not.toContain(copy.whatsappWaiting);
    expect(html).toContain(copy.whatsappDisconnect);
  });

  it('says which server-side reason stopped it, rather than going quiet', () => {
    const html = render({ whatsappStatus: 'not-configured' });
    expect(html).toContain(copy.whatsappNotConfigured);
  });
});
