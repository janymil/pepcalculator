import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { NotificationPermissionState } from '../lib/pwa';
import type { Owner } from '../lib/owners';
import type { UpcomingDose } from '../lib/reminders';
import type { SyncFailure } from '../lib/sync';
import { DangerZone } from './DangerZone';
import { PeoplePanel } from './PeoplePanel';
import { RemindersPanel } from './RemindersPanel';
import { SyncPanel } from './SyncPanel';

interface SettingsPageProps {
  // --- recovery-code sync ---
  code: string;
  serverUrl: string;
  isSyncing: boolean;
  lastSyncedAt: string;
  error: SyncFailure | null;
  onSetCode: (code: string) => void;
  onSetServerUrl: (url: string) => void;
  onSyncNow: () => void;
  onForget: () => void;
  /** Vials that were edited on two devices since the last sync. */
  syncConflicts: number;
  /** --- display --- */
  readable: boolean;
  onToggleReadable: (enabled: boolean) => void;
  // --- dose reminders ---
  remindersEnabled: boolean;
  permission: NotificationPermissionState;
  nextReminder: UpcomingDose | null;
  todayIso: string;
  installed: boolean;
  onToggleReminders: (enabled: boolean) => void;
  onRequestPermission: () => void;
  // --- danger zone ---
  hasVials: boolean;
  onClearAll: () => void;
  // --- people (whose stack) ---
  owners: Owner[];
  vialCounts: Record<string, number>;
  onRenameOwner: (id: string, name: string) => void;
  onRemoveOwner: (id: string) => void;
}

/**
 * The Settings page: the two device-level panels (sync and reminders) that used
 * to sit below the calculator. Keeping them here makes the calculator page about
 * calculating and the Vials page about the vials.
 */
export function SettingsPage({
  code,
  serverUrl,
  isSyncing,
  lastSyncedAt,
  error,
  onSetCode,
  onSetServerUrl,
  onSyncNow,
  onForget,
  syncConflicts,
  readable,
  onToggleReadable,
  remindersEnabled,
  permission,
  nextReminder,
  todayIso,
  installed,
  onToggleReminders,
  onRequestPermission,
  hasVials,
  onClearAll,
  owners,
  vialCounts,
  onRenameOwner,
  onRemoveOwner,
}: SettingsPageProps) {
  const { strings } = useI18n();

  return (
    <section className="settings" aria-labelledby="settings-title">
      <div className="page-head">
        <h2 className="page-title" id="settings-title">
          {strings.settings.title}
        </h2>
        <p className="page-subtitle">{strings.settings.subtitle}</p>
      </div>

      <SyncPanel
        code={code}
        serverUrl={serverUrl}
        isSyncing={isSyncing}
        lastSyncedAt={lastSyncedAt}
        error={error}
        onSetCode={onSetCode}
        onSetServerUrl={onSetServerUrl}
        onSyncNow={onSyncNow}
        onForget={onForget}
      />

      {/*
       * Merging is last-write-wins, so when both devices edited the same vial one
       * of those edits was discarded. Say so, rather than letting it vanish.
       */}
      {syncConflicts > 0 ? (
        <p className="sync__conflict">
          {interpolate(strings.sync.conflicts, { count: syncConflicts })}
        </p>
      ) : null}

      <section className="card">
        <h2 className="card__title">{strings.settings.display}</h2>
        <label className="settings__toggle">
          <input
            type="checkbox"
            checked={readable}
            onChange={(event) => onToggleReadable(event.target.checked)}
          />
          <span className="settings__toggle-label">{strings.settings.readable}</span>
        </label>
        <p className="field__hint">{strings.settings.readableHint}</p>
      </section>

      <RemindersPanel
        enabled={remindersEnabled}
        permission={permission}
        next={nextReminder}
        todayIso={todayIso}
        installed={installed}
        onToggle={onToggleReminders}
        onRequestPermission={onRequestPermission}
      />

      <PeoplePanel
        owners={owners}
        vialCounts={vialCounts}
        onRename={onRenameOwner}
        onRemove={onRemoveOwner}
      />

      <DangerZone hasData={hasVials} onClearAll={onClearAll} />
    </section>
  );
}
