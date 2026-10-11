import { useEffect } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { Icon } from './Icon';

interface ToastProps {
  /** The message to show; an empty string hides the toast. */
  message: string;
  /** Optional action label + handler (e.g. "Undo"). */
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** How long the toast stays on screen before auto-dismissing. */
  durationMs?: number;
}

/**
 * A tiny, dependency-free snackbar used for undoable actions. It is purely
 * presentational: the caller owns the message and decides what the action does.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 6000,
}: ToastProps) {
  const { strings } = useI18n();

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast__message">{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="toast__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="toast__close"
        aria-label={strings.toast.dismiss}
        onClick={onDismiss}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
