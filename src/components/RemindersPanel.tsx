import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { addDays } from '../lib/dates';
import { formatDate } from '../lib/format';
import type { NotificationPermissionState } from '../lib/pwa';
import type { UpcomingDose } from '../lib/reminders';

interface RemindersPanelProps {
  enabled: boolean;
  permission: NotificationPermissionState;
  /** The next dose across all scheduled vials, or null when there is none. */
  next: UpcomingDose | null;
  todayIso: string;
  /** True when running as an installed PWA. */
  installed: boolean;
  onToggle: (enabled: boolean) => void;
  onRequestPermission: () => void;
}

/**
 * Dose reminders: one switch, the browser permission, and a live "next dose"
 * read-out. The actual timer lives in `useDoseReminders` so this stays pure UI.
 */
export function RemindersPanel({
  enabled,
  permission,
  next,
  todayIso,
  installed,
  onToggle,
  onRequestPermission,
}: RemindersPanelProps) {
  const { lang, strings } = useI18n();
  const copy = strings.reminders;

  const permissionNote = (): string => {
    if (permission === 'granted') return copy.permissionGranted;
    if (permission === 'denied') return copy.permissionDenied;
    if (permission === 'unsupported') return copy.permissionUnsupported;
    return copy.permissionDefault;
  };

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
    </section>
  );
}
