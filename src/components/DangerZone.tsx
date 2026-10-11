import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';

interface DangerZoneProps {
  /** True when there is at least one saved vial to clear. */
  hasData: boolean;
  /** Deletes every live vial (soft delete, so the removal can sync). */
  onClearAll: () => void;
}

/**
 * "Your data" — the escape hatch the app was missing. Clearing is a two-tap
 * action (no modal needed) and it only ever touches this device's vials, which
 * is exactly what the note explains.
 */
export function DangerZone({ hasData, onClearAll }: DangerZoneProps) {
  const { strings } = useI18n();
  const copy = strings.danger;
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const handleClear = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onClearAll();
    setConfirming(false);
    setDone(true);
  };

  return (
    <section className="danger" aria-labelledby="danger-title">
      <p className="danger__title" id="danger-title">
        {copy.title}
      </p>
      <p className="danger__note">{copy.note}</p>

      <div className="danger__actions">
        <button
          type="button"
          className="btn btn--sm btn--danger"
          disabled={!hasData}
          onClick={handleClear}
          onBlur={() => setConfirming(false)}
        >
          {copy.clear}
        </button>
        {confirming ? (
          <span className="danger__confirm" role="status">
            {copy.confirm}
          </span>
        ) : null}
        {done ? <span className="danger__done">{copy.cleared}</span> : null}
      </div>
    </section>
  );
}
