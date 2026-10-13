import { useI18n } from '../i18n/I18nContext';

interface PairNoticeProps {
  /** iOS and not installed: Web Push needs the app on the Home Screen first. */
  needsInstall: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}

/**
 * The banner shown right after a phone is paired: one tap to turn reminders on.
 *
 * Browsers only raise the notification-permission prompt in response to a tap,
 * so this button **is** the prompt — tapping it enables reminders and asks for
 * permission in the same gesture.
 */
export function PairNotice({ needsInstall, onEnable, onDismiss }: PairNoticeProps) {
  const { strings } = useI18n();
  const copy = strings.pair;

  return (
    <div className="pair-notice" role="status">
      <div className="pair-notice__body">
        <p className="pair-notice__title">{copy.noticeTitle}</p>
        <p className="pair-notice__text">
          {needsInstall ? copy.noticeInstalled : copy.noticeBody}
        </p>
      </div>
      <div className="pair-notice__actions">
        {needsInstall ? null : (
          <button type="button" className="btn btn--sm btn--accent" onClick={onEnable}>
            {copy.noticeEnable}
          </button>
        )}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onDismiss}>
          {copy.noticeDismiss}
        </button>
      </div>
    </div>
  );
}
