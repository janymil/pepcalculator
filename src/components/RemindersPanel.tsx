import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { PushStatus } from '../hooks/usePushReminders';
import type { WhatsAppPlan, WhatsAppStatus } from '../hooks/useWhatsAppReminders';
import { addDays } from '../lib/dates';
import { formatDate } from '../lib/format';
import type { NotificationPermissionState } from '../lib/pwa';
import type { UpcomingDose } from '../lib/reminders';
import { formatWhatsappNumber, type WhatsappRule } from '../lib/whatsapp';

export interface RemindersPanelProps {
  enabled: boolean;
  permission: NotificationPermissionState;
  /** The next dose across all scheduled vials, or null when there is none. */
  next: UpcomingDose | null;
  /** How the server-side (app-closed) reminders are doing. */
  pushStatus: PushStatus;
  todayIso: string;
  /** True when running as an installed PWA. */
  installed: boolean;
  onToggle: (enabled: boolean) => void;
  onRequestPermission: () => void;
  /** The optional WhatsApp channel (see `PROPOSAL-whatsapp-reminders.md`). */
  whatsappStatus: WhatsAppStatus;
  whatsappLink: string | null;
  whatsappCode: string;
  whatsappNumber: string;
  /** Every vial with a schedule, so step one can name them all. */
  whatsappPlans: WhatsAppPlan[];
  whatsappBusy: boolean;
  onConnectWhatsApp: () => void;
  onDisconnectWhatsApp: () => void;
}

/**
 * Dose reminders: one switch, the browser permission, and a live "next dose"
 * read-out. The actual timer lives in `useDoseReminders` so this stays pure UI.
 */
export function RemindersPanel({
  enabled,
  permission,
  next,
  pushStatus,
  todayIso,
  installed,
  onToggle,
  onRequestPermission,
  whatsappStatus,
  whatsappLink,
  whatsappCode,
  whatsappNumber,
  whatsappPlans,
  whatsappBusy,
  onConnectWhatsApp,
  onDisconnectWhatsApp,
}: RemindersPanelProps) {
  const { lang, strings } = useI18n();
  const copy = strings.reminders;

  /**
   * Why the flow cannot start, or '' when it can.
   *
   * Every one of these used to be a sentence printed next to a button that
   * looked like it should work. Saying which one it is, before the steps, is the
   * difference between "this is broken" and "there is one thing to do first".
   */
  const blockedReason = (): string => {
    if (whatsappStatus === 'needs-code') return copy.whatsappNeedsCode;
    if (whatsappStatus === 'no-plan') return copy.whatsappNoPlan;
    if (whatsappStatus === 'not-configured') return copy.whatsappNotConfigured;
    if (whatsappStatus === 'error') return copy.whatsappError;
    return '';
  };

  const blocked = blockedReason() !== '';
  const linked = whatsappStatus === 'linked';
  const waiting = whatsappStatus === 'waiting';
  /** A reminder exists, so there is a link to send and something to confirm. */
  const started = waiting || linked;

  /**
   * Which of the three steps is where.
   *
   * `done` is behind, `active` is what to do now, `todo` is not reachable yet.
   * Only ever one `active`, which is the whole point of showing steps: the old
   * panel put a link, a code, a fallback sentence and two buttons on screen at
   * once, in an order that did not match the order of the work.
   */
  const stepState = (index: 0 | 1 | 2): 'done' | 'active' | 'todo' => {
    if (blocked) return 'todo';
    if (linked) return 'done';
    if (index === 0) return 'done';
    if (index === 1) return 'active';
    return 'todo';
  };

  /** "Every day at 08:00" — the plan as a person would say it. */
  const describeRule = (rule: WhatsappRule): string => {
    const times = [...rule.times].sort().join(', ');
    if (rule.repeat === 'interval' && rule.intervalDays > 0) {
      return interpolate(copy.whatsappPlanInterval, { days: rule.intervalDays, times });
    }
    if (rule.repeat === 'weekdays' && rule.weekdays.length > 0) {
      return interpolate(copy.whatsappPlanWeekdays, { days: weekdayNames(rule.weekdays), times });
    }
    return interpolate(copy.whatsappPlanDaily, { times });
  };

  /**
   * Localised short weekday names, so no dictionary has to carry seven more
   * strings that `Intl` already knows. `0` is Sunday, so the week starts on
   * 2024-01-07 — a Sunday — and stays in UTC so a time zone cannot shift it.
   */
  const weekdayNames = (days: number[]): string => {
    const format = new Intl.DateTimeFormat(LOCALES[lang], { weekday: 'short', timeZone: 'UTC' });
    return [...days]
      .sort((a, b) => a - b)
      .map((day) => format.format(new Date(Date.UTC(2024, 0, 7 + day))))
      .join(', ');
  };

  const formattedNumber = formatWhatsappNumber(whatsappNumber);
  /** More than one person on the device, so a name is worth printing. */
  const multiPerson = new Set(whatsappPlans.map((plan) => plan.person)).size > 1;
  /**
   * Whether pressing "set up" could do anything useful. `not-configured` and
   * `error` are included on purpose: those are the two states where trying
   * again is exactly what the user should do.
   */
  const canStart = whatsappStatus === 'ready' || whatsappStatus === 'not-configured' || whatsappStatus === 'error';
  const canDisconnect = started;

  const permissionNote = (): string => {
    if (permission === 'granted') return copy.permissionGranted;
    if (permission === 'denied') return copy.permissionDenied;
    if (permission === 'unsupported') return copy.permissionUnsupported;
    return copy.permissionDefault;
  };

  /** The background (server) reminder line, or '' when there is nothing to say. */
  const pushNote = (): string => {
    if (pushStatus === 'active') return copy.pushActive;
    if (pushStatus === 'needs-code') return copy.pushNeedsCode;
    if (pushStatus === 'unsupported') return copy.pushUnsupported;
    if (pushStatus === 'blocked') return copy.pushBlocked;
    if (pushStatus === 'inactive') return copy.pushInactive;
    if (pushStatus === 'error') return copy.pushError;
    return '';
  };

  const pushMessage = enabled ? pushNote() : '';

  const dayLabel = next
    ? next.date === todayIso
      ? copy.today
      : next.date === addDays(todayIso, 1)
        ? copy.tomorrow
        : formatDate(next.date, LOCALES[lang])
    : '';

  return (
    <section className="reminders" aria-labelledby="reminders-title">
      <p className="reminders__title" id="reminders-title">
        {copy.title}
      </p>
      <p className="reminders__text">{copy.intro}</p>

      <div className="reminders__row">
        <button
          type="button"
          className={`btn btn--sm${enabled ? ' btn--ghost' : ' btn--accent'}`}
          onClick={() => onToggle(!enabled)}
          disabled={permission === 'unsupported'}
          aria-pressed={enabled}
        >
          {enabled ? copy.disable : copy.enable}
        </button>

        {enabled && permission === 'default' && (
          <button type="button" className="btn btn--sm btn--accent" onClick={onRequestPermission}>
            {copy.allow}
          </button>
        )}
      </div>

      <p className={`reminders__status${permission === 'denied' ? ' is-error' : ''}`}>
        {permissionNote()}
      </p>

      {pushMessage ? (
        <p
          className={`reminders__status${
            pushStatus === 'error' || pushStatus === 'blocked' ? ' is-error' : ''
          }`}
        >
          {pushMessage}
        </p>
      ) : null}

      {enabled && permission === 'granted' && (
        <p className="reminders__next">
          {next
            ? `${interpolate(copy.nextUp, {
                name: next.name || strings.vials.untitled,
              })} — ${dayLabel} ${next.time}`
            : copy.noneUpcoming}
        </p>
      )}

      <p className="reminders__hint">{installed ? copy.keepOpenHint : copy.installedHint}</p>

      {/*
        * The second channel, and deliberately the smaller one. Three numbered
        * steps, because the work really is three steps — and the risk line is
        * not boilerplate: this goes through an unofficial gateway, so the number
        * can be blocked and take the reminders with it.
        */}
      <hr className="reminders__divider" />
      <p className="reminders__title">{copy.whatsappTitle}</p>
      <p className="reminders__text">{copy.whatsappIntro}</p>

      {blocked ? (
        <p className={`reminders__status${whatsappStatus === 'error' ? ' is-error' : ''}`}>
          {blockedReason()}
        </p>
      ) : null}

      <ol className="wa-steps">
        {/* 1 — what the reminder is about, so the tap is never blind. */}
        <li className={`wa-step is-${stepState(0)}`}>
          <span className="wa-step__num" aria-hidden="true">
            1
          </span>
          <div className="wa-step__body">
            <p className="wa-step__title">{copy.whatsappStepPlan}</p>
            {whatsappPlans.length > 0 ? (
              <ul className="wa-plans">
                {whatsappPlans.map((plan) => (
                  <li className="wa-plan" key={plan.id}>
                    {/* Whose it is, but only when there is somebody else it
                        could be — one person does not need a label. */}
                    {multiPerson ? (
                      <span className="wa-plan__who">{plan.person || strings.people.me}</span>
                    ) : null}
                    <span className="wa-plan__name">
                      {plan.label}
                      {plan.doses.length > 0 ? ` · ${plan.doses[plan.doses.length - 1].dose}` : ''}
                    </span>
                    <span className="wa-plan__when">{describeRule(plan.rule)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </li>

        {/* 2 — the message. The link only exists once a reminder has been made. */}
        <li className={`wa-step is-${stepState(1)}`}>
          <span className="wa-step__num" aria-hidden="true">
            2
          </span>
          <div className="wa-step__body">
            <p className="wa-step__title">{copy.whatsappStepChat}</p>
            <p className="wa-step__hint">{copy.whatsappStepChatBody}</p>

            {started ? (
              <>
                {whatsappLink ? (
                  <p className="wa-step__actions">
                    <a
                      className="btn btn--sm btn--accent"
                      href={whatsappLink}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {copy.whatsappOpen}
                    </a>
                  </p>
                ) : null}
                {whatsappCode && formattedNumber ? (
                  <>
                    <p className="wa-step__hint">
                      {interpolate(copy.whatsappFallbackTo, { number: formattedNumber })}
                    </p>
                    <p className="wa-step__code">
                      {/* One text node, not two: React inserts a comment
                          between adjacent expressions, which can make a phone's
                          long-press copy take only half the code. */}
                      <code>{`START ${whatsappCode}`}</code>
                    </p>
                  </>
                ) : null}
              </>
            ) : (
              <p className="wa-step__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--accent"
                  onClick={onConnectWhatsApp}
                  disabled={whatsappBusy || !canStart}
                >
                  {whatsappBusy ? copy.whatsappBusy : copy.whatsappConnect}
                </button>
              </p>
            )}
          </div>
        </li>

        {/* 3 — confirmation, and the only place waiting/linked is reported. */}
        <li className={`wa-step is-${stepState(2)}`}>
          <span className="wa-step__num" aria-hidden="true">
            3
          </span>
          <div className="wa-step__body">
            <p className="wa-step__title">{copy.whatsappStepConfirm}</p>
            {started ? (
              <p className={`wa-step__state${linked ? ' is-ok' : ''}`}>
                {linked ? copy.whatsappLinked : copy.whatsappWaiting}
              </p>
            ) : null}
          </div>
        </li>
      </ol>

      {canDisconnect ? (
        <div className="reminders__row">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={onDisconnectWhatsApp}
            disabled={whatsappBusy}
          >
            {copy.whatsappDisconnect}
          </button>
        </div>
      ) : null}

    </section>
  );
}
