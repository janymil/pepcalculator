import { useState } from 'react';
import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import {
  formatSyncCode,
  generateSyncCode,
  isValidSyncCode,
  type SyncFailure,
} from '../lib/sync';
import { TOMBSTONE_TTL_DAYS } from '../lib/vials';

interface SyncPanelProps {
  /** Empty string means "not syncing on this device". */
  code: string;
  serverUrl: string;
  isSyncing: boolean;
  lastSyncedAt: string;
  error: SyncFailure | null;
  onSetCode: (code: string) => void;
  onSetServerUrl: (url: string) => void;
  onSyncNow: () => void;
  onForget: () => void;
}

/**
 * Recovery-code sync UI. No email, no password — the user writes one long code
 * down and types it on their other devices.
 */
export function SyncPanel({
  code,
  serverUrl,
  isSyncing,
  lastSyncedAt,
  error,
  onSetCode,
  onSetServerUrl,
  onSyncNow,
  onForget,
}: SyncPanelProps) {
  const { lang, strings } = useI18n();
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const errorMessage = (reason: SyncFailure): string => {
    if (reason === 'invalidCode') return strings.sync.errorInvalidCode;
    if (reason === 'network') return strings.sync.errorNetwork;
    if (reason === 'badPayload') return strings.sync.errorBadPayload;
    if (reason === 'unavailable') return strings.sync.errorUnavailable;
    return strings.sync.errorServer;
  };

  const syncedWhen = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString(LOCALES[lang], {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const handleCopy = () => {
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleUseDraft = () => {
    if (!isValidSyncCode(draft)) return;
    onSetCode(formatSyncCode(draft));
    setDraft('');
  };

  return (
    <section className="sync" aria-labelledby="sync-title">
      <p className="sync__title" id="sync-title">
        {strings.sync.title}
      </p>
      <p className="sync__text">{strings.sync.intro}</p>

      <div className="field">
        <span className="field__label">{strings.sync.serverLabel}</span>
        <input
          className="field__input"
          type="url"
          inputMode="url"
          autoComplete="off"
          value={serverUrl}
          placeholder="http://localhost:8787"
          onChange={(event) => onSetServerUrl(event.target.value)}
        />
      </div>

      {code ? (
        <>
          <div className="field">
            <span className="field__label">{strings.sync.codeLabel}</span>
            <div className="sync__row">
              <code className="sync__code">{code}</code>
              <button type="button" className="btn btn--sm" onClick={handleCopy}>
                {copied ? strings.sync.copied : strings.sync.copy}
              </button>
            </div>
          </div>

          <p className="sync__warning">{strings.sync.warning}</p>

          <div className="sync__row">
            <button
              type="button"
              className="btn btn--sm btn--accent"
              onClick={onSyncNow}
              disabled={isSyncing}
            >
              {isSyncing ? strings.sync.syncing : strings.sync.syncNow}
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={onForget}>
              {strings.sync.forget}
            </button>
          </div>

          <p className={`sync__status${error ? ' is-error' : ''}`}>
            {error
              ? errorMessage(error)
              : syncedWhen
                ? interpolate(strings.sync.lastSynced, { when: syncedWhen })
                : strings.sync.never}
          </p>
        </>
      ) : (
        <>
          <div className="sync__row">
            <button
              type="button"
              className="btn btn--sm btn--accent"
              onClick={() => onSetCode(generateSyncCode())}
            >
              {strings.sync.create}
            </button>
          </div>

          <div className="field">
            <span className="field__label">{strings.sync.codeInputLabel}</span>
            <div className="sync__row">
              <input
                className="field__input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={draft}
                placeholder={strings.sync.codePlaceholder}
                onChange={(event) => setDraft(event.target.value)}
              />
              <button
                type="button"
                className="btn btn--sm"
                onClick={handleUseDraft}
                disabled={!isValidSyncCode(draft)}
              >
                {strings.sync.useExisting}
              </button>
            </div>
          </div>

          <p className="sync__warning">{strings.sync.warning}</p>
        </>
      )}

      <p className="sync__note">
        {interpolate(strings.sync.retention, { days: TOMBSTONE_TTL_DAYS })}
      </p>
    </section>
  );
}
