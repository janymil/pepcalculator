import { useI18n } from '../i18n/I18nContext';
import type { NotificationPermissionState } from '../lib/pwa';
import type { UpcomingDose } from '../lib/reminders';
import type { SyncFailure } from '../lib/sync';
import { DangerZone } from './DangerZone';
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
  remindersEnabled,
  permission,
  nextReminder,
  todayIso,
  installed,
  onToggleReminders,
  onRequestPermission,
  hasVials,
  onClearAll,
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

      <RemindersPanel
        enabled={remindersEnabled}
        permission={permission}
        next={nextReminder}
        todayIso={todayIso}
        installed={installed}
        onToggle={onToggleReminders}
        onRequestPermission={onRequestPermission}
      />

      <DangerZone hasData={hasVials} onClearAll={onClearAll} />
    </section>
  );
}
