import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import { I18nProvider } from '../i18n/I18nContext';
import { SettingsPage } from './SettingsPage';

const html = renderToString(
  <I18nProvider value={{ lang: 'en', setLang: () => {}, strings: DICTIONARIES.en }}>
    <SettingsPage
      code=""
      serverUrl="http://localhost:8787"
      isSyncing={false}
      lastSyncedAt=""
      error={null}
      onSetCode={() => {}}
      onSetServerUrl={() => {}}
      onSyncNow={() => {}}
      onForget={() => {}}
      syncConflicts={0}
      remindersEnabled={false}
      permission="default"
      nextReminder={null}
      todayIso="2024-01-01"
      installed={false}
      onToggleReminders={() => {}}
      onRequestPermission={() => {}}
      hasVials={false}
      onClearAll={() => {}}
      owners={[{ id: 'me', name: '' }]}
      vialCounts={{ me: 0 }}
      onRenameOwner={() => {}}
      onRemoveOwner={() => {}}
    />
  </I18nProvider>,
);

describe('SettingsPage (server render smoke test)', () => {
  it('gathers the sync and reminder panels on their own page', () => {
    expect(html).toContain('settings-title');
    expect(html).toContain('sync-title');
    expect(html).toContain('reminders-title');
  });

  it('explains how long deleted vials are remembered before the sweep', () => {
    // `{days}` must be interpolated with the tombstone retention window.
    expect(html).toContain('hidden marker for 90 days');
  });
});
