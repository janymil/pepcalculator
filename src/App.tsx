import { useEffect, useMemo, useRef, useState } from 'react';
import { AgendaPage } from './components/AgendaPage';
import { CalculatorForm } from './components/CalculatorForm';
import { Footer } from './components/Footer';
import { FirstRunCard, type ExampleSet } from './components/FirstRunCard';
import { Header } from './components/Header';
import { MobileSummaryBar } from './components/MobileSummaryBar';
import { ModeTabs } from './components/ModeTabs';
import { ReferencePage } from './components/ReferencePage';
import { ResultPanel } from './components/ResultPanel';
import { SaveVialForm } from './components/SaveVialForm';
import { SavedVials } from './components/SavedVials';
import { SettingsPage } from './components/SettingsPage';
import { TodayDoseCard } from './components/TodayDose';
import { Toast } from './components/Toast';
import { ViewTabs } from './components/ViewTabs';
import {
  DEFAULT_ANABOLIC_FORM,
  DEFAULT_PEPTIDE_FORM,
  DEFAULT_SYRINGE,
  DEFAULT_SYNC_SERVER,
  STORAGE_KEYS,
} from './config/defaults';
import { DEFAULT_MODE, modeMeta, resolveCapacity } from './config/modes';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useDoseReminders } from './hooks/useDoseReminders';
import { DICTIONARIES, detectLang, interpolate } from './i18n';
import { I18nProvider } from './i18n/I18nContext';
import type { Lang } from './i18n/types';
import { calculateAnabolic, calculatePeptide, type ModeId } from './lib/calc';
import { parseNumber } from './lib/format';
import { toIsoDate } from './lib/dates';
import type { VialSchedule } from './lib/schedule';
import { isStandalone } from './lib/pwa';
import { syncWithServer, pushVials, type SyncFailure } from './lib/sync';
import { hashForView, viewFromHash, type ViewId } from './lib/views';
import {
  canSaveVial,
  clearAllVials,
  createVialId,
  liveVials,
  mergeVials,
  purgeTombstones,
  tombstoneVial,
  vialKind,
  type SavedVial,
} from './lib/vials';

/** Snapshot of the vials, used to detect whether anything actually changed. */
function vialsSnapshot(vials: SavedVial[]): string {
  return JSON.stringify(vials);
}
import type { AnabolicForm, PeptideForm, SyringeSettings, ThemeName } from './types';

export default function App() {
  const [mode, setMode] = useLocalStorage<ModeId>(STORAGE_KEYS.mode, DEFAULT_MODE);
  const [lang, setLang] = useLocalStorage<Lang>(STORAGE_KEYS.lang, detectLang());
  const [theme, setTheme] = useLocalStorage<ThemeName>(STORAGE_KEYS.theme, 'light');
  const [peptide, setPeptide] = useLocalStorage<PeptideForm>(
    STORAGE_KEYS.peptide,
    DEFAULT_PEPTIDE_FORM,
  );
  const [anabolic, setAnabolic] = useLocalStorage<AnabolicForm>(
    STORAGE_KEYS.anabolic,
    DEFAULT_ANABOLIC_FORM,
  );
  const [syringe, setSyringe] = useLocalStorage<SyringeSettings>(
    STORAGE_KEYS.syringe,
    DEFAULT_SYRINGE,
  );
  const [savedVials, setSavedVials] = useLocalStorage<SavedVial[]>(STORAGE_KEYS.vials, []);
  const [syncCode, setSyncCode] = useLocalStorage<string>(STORAGE_KEYS.syncCode, '');
  const [syncServer, setSyncServer] = useLocalStorage<string>(
    STORAGE_KEYS.syncServer,
    DEFAULT_SYNC_SERVER,
  );
  const [syncLast, setSyncLast] = useLocalStorage<string>(STORAGE_KEYS.syncLast, '');
  const [remindersEnabled, setRemindersEnabled] = useLocalStorage<boolean>(
    STORAGE_KEYS.reminders,
    false,
  );
  const [view, setView] = useLocalStorage<ViewId>(STORAGE_KEYS.view, 'calculator');
  const [firstRunDone, setFirstRunDone] = useLocalStorage<boolean>(STORAGE_KEYS.firstRunDone, false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<SyncFailure | null>(null);

  // One small undo toast at a time (delete a vial, clear everything).
  const [toast, setToast] = useState<{ id: number; message: string; undo: () => void } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  /** Shows an undoable toast and auto-clears it after a few seconds. */
  const showUndo = (message: string, undo: () => void) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), message, undo });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 6000);
  };

  const dismissToast = () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  // Read once (matchMedia): true when the app runs as an installed PWA.
  const [installed] = useState(() => isStandalone());

  // Two guards that keep the background push honest: exactly what we last sent,
  // and never two syncs running at once.
  const lastPushedRef = useRef('');
  const inFlightRef = useRef(false);

  // Tombstoned vials stay in state (so deletions can sync) but never reach the UI.
  const liveVialList = useMemo(() => liveVials(savedVials), [savedVials]);

  const strings = DICTIONARIES[lang];

  // Each workflow has its own syringe setup (see src/config/modes.ts). Resolving
  // the capacity guards against a remembered value that doesn't fit the current
  // mode — e.g. a 0.3 mL insulin barrel while viewing anabolic oils.
  const capacityMl = resolveCapacity(mode, syringe.capacityMl);
  const measure = modeMeta(mode).measure;

  // A clock that ticks once a minute keeps "next dose" accurate without the
  // user having to touch anything.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const todayIso = toIsoDate(now);
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  // Shows an OS notification at the next scheduled dose (see useDoseReminders).
  const reminders = useDoseReminders({
    vials: liveVialList,
    now,
    enabled: remindersEnabled,
    title: strings.reminders.notifyTitle,
    body: (name, time) =>
      interpolate(strings.reminders.notifyBody, { name: name || strings.vials.untitled, time }),
  });

  // Keep the <html> element in sync so CSS variables and a11y match the UI.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    root.lang = lang;
    root.style.colorScheme = theme;

    // Keep the browser/PWA chrome (status bar) in step with the active theme.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', strings.theme.themeColor);
  }, [theme, mode, lang, strings]);

  /*
   * The two pages live in the URL hash (`#calendar`), so the browser back button
   * works and an installed PWA reopens on the page you left. An unknown or
   * missing hash leaves the remembered page alone.
   */
  useEffect(() => {
    const applyHash = () => {
      const fromHash = viewFromHash(window.location.hash);
      if (fromHash) setView(fromHash);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, [setView]);

  const changeView = (next: ViewId) => {
    setView(next);
    const hash = hashForView(next);
    if (window.location.hash !== hash) window.location.hash = hash;
  };

  /*
   * Sweep away deletion tombstones that are too old to be useful. A tombstone
   * has to outlive the longest gap between your devices syncing (see
   * `purgeTombstones`), but keeping them forever would grow every payload — so
   * run the sweep on open. Synced copies get the same treatment after a merge.
   */
  useEffect(() => {
    setSavedVials((previous) => {
      const swept = purgeTombstones(previous);
      return swept.length === previous.length ? previous : swept;
    });
    // Runs once, against whatever storage had. The setter is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * When the app opens with a sync code, pull once so this device catches up.
   * Later syncs are manual — that keeps the network completely out of the way
   * while you are actually using the calculator.
   */
  useEffect(() => {
    if (!syncCode || !syncServer) return;
    let cancelled = false;

    setSyncing(true);
    setSyncError(null);
    void syncWithServer(syncServer, syncCode, savedVials).then((outcome) => {
      if (cancelled) return;
      setSyncing(false);
      if (outcome.ok) {
        // Sweep old tombstones, then keep `lastPushedRef` on the *unpurged*
        // merge: the background push sees the difference and re-uploads the
        // pruned list, so the server converges too.
        setSavedVials(purgeTombstones(outcome.vials));
        setSyncLast(outcome.updatedAt);
        lastPushedRef.current = vialsSnapshot(outcome.vials);
      } else {
        setSyncError(outcome.reason);
      }
    });

    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the code only: initial catch-up, not a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncCode]);

  // Recomputed on every keystroke. The engine is pure and cheap, so no debounce.
  const result = useMemo(() => {
    if (mode === 'peptide') {
      return calculatePeptide({
        vialAmount: parseNumber(peptide.vialAmount),
        vialUnit: peptide.vialUnit,
        waterMl: parseNumber(peptide.waterMl),
        doseAmount: parseNumber(peptide.doseAmount),
        doseUnit: peptide.doseUnit,
        syringeType: syringe.type,
        syringeCapacityMl: capacityMl,
      });
    }

    return calculateAnabolic({
      concentrationMgPerMl: parseNumber(anabolic.concentration),
      doseAmount: parseNumber(anabolic.doseAmount),
      doseUnit: anabolic.doseUnit,
      vialMl: anabolic.vialMl.trim() === '' ? null : parseNumber(anabolic.vialMl),
      syringeType: syringe.type,
      syringeCapacityMl: capacityMl,
    });
  }, [mode, peptide, anabolic, syringe]);

  const handleReset = () => {
    setPeptide(DEFAULT_PEPTIDE_FORM);
    setAnabolic(DEFAULT_ANABOLIC_FORM);
    setSyringe(DEFAULT_SYRINGE);
  };

  /* ---------- saved vials ("My vials") ---------- */

  // A vial can be saved once its numbers are complete — and what counts as
  // complete differs by workflow (peptides: vial + water; oils: mg/mL).
  const canSaveCurrentVial =
    mode === 'peptide'
      ? canSaveVial({
          kind: 'peptide',
          vialAmount: parseNumber(peptide.vialAmount),
          waterMl: parseNumber(peptide.waterMl),
          doseAmount: parseNumber(peptide.doseAmount),
        })
      : canSaveVial({
          kind: 'anabolic',
          concentrationMgPerMl: parseNumber(anabolic.concentration),
          doseAmount: parseNumber(anabolic.doseAmount),
        });

  const handleSaveVial = (
    name: string,
    startedOn: string,
    schedule: VialSchedule,
    cost?: { price?: number; currency?: string },
  ) => {
    if (!canSaveCurrentVial) return;

    const base = {
      id: createVialId(),
      name,
      reconstitutedOn: startedOn,
      dosesTaken: 0,
      syringeType: syringe.type,
      syringeCapacityMl: capacityMl,
      schedule,
      price: cost?.price,
      currency: cost?.currency,
      updatedAt: new Date().toISOString(),
    };

    const vial: SavedVial =
      mode === 'anabolic'
        ? {
            ...base,
            kind: 'anabolic',
            // Oils are not reconstituted, so the peptide side stays empty.
            vialAmount: 0,
            vialUnit: 'mg',
            waterMl: 0,
            concentrationMgPerMl: parseNumber(anabolic.concentration),
            vialMl: anabolic.vialMl.trim() === '' ? undefined : parseNumber(anabolic.vialMl),
            doseAmount: parseNumber(anabolic.doseAmount),
            doseUnit: anabolic.doseUnit,
          }
        : {
            ...base,
            kind: 'peptide',
            vialAmount: parseNumber(peptide.vialAmount),
            vialUnit: peptide.vialUnit,
            waterMl: parseNumber(peptide.waterMl),
            doseAmount: parseNumber(peptide.doseAmount),
            doseUnit: peptide.doseUnit,
          };

    setSavedVials((previous) => [vial, ...previous]);
  };

  /** Loads one of the built-in examples, so first-run numbers are a choice. */
  const handleApplyExample = (example: ExampleSet) => {
    if (example.peptide) setPeptide(example.peptide);
    if (example.anabolic) setAnabolic(example.anabolic);
    setMode(example.id);
    setFirstRunDone(true);
    changeView('calculator');
  };

  const handleLoadVial = (vial: SavedVial) => {
    setSyringe({ type: vial.syringeType, capacityMl: vial.syringeCapacityMl });

    if (vialKind(vial) === 'anabolic') {
      setMode('anabolic');
      setAnabolic({
        concentration: String(vial.concentrationMgPerMl ?? ''),
        doseAmount: String(vial.doseAmount),
        doseUnit: vial.doseUnit,
        vialMl: vial.vialMl === undefined ? '' : String(vial.vialMl),
      });
    } else {
      setMode('peptide');
      setPeptide({
        vialAmount: String(vial.vialAmount),
        vialUnit: vial.vialUnit,
        waterMl: String(vial.waterMl),
        doseAmount: String(vial.doseAmount),
        doseUnit: vial.doseUnit,
      });
    }

    // Loading only makes sense on the calculator, so jump there.
    changeView('calculator');
  };

  const handleAddDose = (id: string) => {
    setSavedVials((previous) =>
      previous.map((vial) =>
        vial.id === id ? { ...vial, dosesTaken: vial.dosesTaken + 1 } : vial,
      ),
    );
  };

  const handleRemoveDose = (id: string) => {
    setSavedVials((previous) =>
      previous.map((vial) =>
        vial.id === id ? { ...vial, dosesTaken: Math.max(0, vial.dosesTaken - 1) } : vial,
      ),
    );
  };

  const handleDeleteVial = (id: string) => {
    // Soft delete: keep a tombstone so the removal reaches your other devices.
    const now = new Date().toISOString();
    const target = savedVials.find((vial) => vial.id === id);
    setSavedVials((previous) =>
      previous.map((vial) => (vial.id === id ? tombstoneVial(vial, now) : vial)),
    );

    // Offer a short undo window. The tombstone is reverted to the original
    // record (without `deletedAt`) so the vial comes straight back.
    if (target) {
      showUndo(strings.toast.vialDeleted, () => {
        setSavedVials((previous) =>
          previous.map((vial) => (vial.id === id ? { ...target, deletedAt: undefined } : vial)),
        );
      });
    }
  };

  /** Soft-deletes every live vial — the "clear all data" action. */
  const handleClearAll = () => {
    const now = new Date().toISOString();
    const snapshot = savedVials;
    setSavedVials((previous) => clearAllVials(previous, now));
    showUndo(strings.toast.deletedAll, () => setSavedVials(snapshot));
  };

  const handleUpdateVial = (updated: SavedVial) => {
    // Stamping the edit time lets sync pick the newest copy per vial.
    const stamped: SavedVial = { ...updated, updatedAt: new Date().toISOString() };
    setSavedVials((previous) =>
      previous.map((vial) => (vial.id === stamped.id ? stamped : vial)),
    );
  };

  const handleRestoreVials = (restored: SavedVial[]) => {
    // Restoring is an explicit "bring these back": revive anything tombstoned
    // and stamp them as the newest copies so they win the merge.
    const now = new Date().toISOString();
    const revived = restored.map((vial) => ({ ...vial, deletedAt: undefined, updatedAt: now }));
    setSavedVials((previous) => purgeTombstones(mergeVials(previous, revived)));
  };

  const runSync = async () => {
    if (!syncCode) return;
    setSyncing(true);
    setSyncError(null);
    const outcome = await syncWithServer(syncServer, syncCode, savedVials);
    setSyncing(false);
    if (outcome.ok) {
      // Same as the on-open sync: prune, then let the background push re-upload.
      setSavedVials(purgeTombstones(outcome.vials));
      setSyncLast(outcome.updatedAt);
      lastPushedRef.current = vialsSnapshot(outcome.vials);
    } else {
      setSyncError(outcome.reason);
    }
  };

  const handleForgetSync = () => {
    setSyncCode('');
    setSyncLast('');
    setSyncError(null);
  };

  /*
   * Background push: 1.5 s after the vials change, send the local copy. The
   * snapshot guard makes this loop-proof, because pushing never changes
   * `savedVials` — so a repeat run always sees "nothing new to send".
   */
  useEffect(() => {
    if (!syncCode || !syncServer) return;

    const snapshot = vialsSnapshot(savedVials);
    if (snapshot === lastPushedRef.current) return;

    const timer = window.setTimeout(() => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setSyncing(true);
      setSyncError(null);
      void pushVials(syncServer, syncCode, savedVials).then((outcome) => {
        inFlightRef.current = false;
        setSyncing(false);
        if (outcome.ok) {
          lastPushedRef.current = snapshot;
          setSyncLast(outcome.updatedAt);
        } else {
          setSyncError(outcome.reason);
        }
      });
    }, 1500);

    return () => window.clearTimeout(timer);
    // Keyed on the data only; the refs above stop it from repeating itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedVials, syncCode, syncServer]);

  // The first-run card is only ever a welcome: it disappears once the user
  // loads an example, dismisses it, or saves their first vial.
  const showFirstRun = !firstRunDone && liveVialList.length === 0;

  return (
    <I18nProvider value={{ lang, setLang, strings }}>
      <div className="app">
        <Header
          theme={theme}
          onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />

        <main className="app__main">
          <ViewTabs view={view} onChange={changeView} />

          {view === 'calendar' ? (
            <AgendaPage
              vials={liveVialList}
              todayIso={todayIso}
              nowTime={nowTime}
              onGoToCalculator={() => changeView('calculator')}
            />
          ) : view === 'vials' ? (
            <SavedVials
              vials={liveVialList}
              todayIso={todayIso}
              nowTime={nowTime}
              onUpdate={handleUpdateVial}
              onRestore={handleRestoreVials}
              onLoad={handleLoadVial}
              onAddDose={handleAddDose}
              onRemoveDose={handleRemoveDose}
              onDelete={handleDeleteVial}
              onGoToCalculator={() => changeView('calculator')}
            />
          ) : view === 'settings' ? (
            <SettingsPage
              code={syncCode}
              serverUrl={syncServer}
              isSyncing={syncing}
              lastSyncedAt={syncLast}
              error={syncError}
              onSetCode={setSyncCode}
              onSetServerUrl={setSyncServer}
              onSyncNow={() => void runSync()}
              onForget={handleForgetSync}
              remindersEnabled={remindersEnabled}
              permission={reminders.permission}
              nextReminder={reminders.next}
              todayIso={todayIso}
              installed={installed}
              onToggleReminders={setRemindersEnabled}
              onRequestPermission={reminders.requestPermission}
              hasVials={liveVialList.length > 0}
              onClearAll={handleClearAll}
            />
          ) : view === 'reference' ? (
            <ReferencePage />
          ) : (
            <>
              {showFirstRun ? (
                <FirstRunCard onApply={handleApplyExample} onDismiss={() => setFirstRunDone(true)} />
              ) : null}

              <TodayDoseCard
                vials={liveVialList}
                todayIso={todayIso}
                nowTime={nowTime}
                onLoad={handleLoadVial}
                onAddDose={handleAddDose}
              />

              <ModeTabs mode={mode} onChange={setMode} />

              <div className="app__grid">
                <CalculatorForm
                  mode={mode}
                  peptide={peptide}
                  onPeptideChange={(patch) => setPeptide((prev) => ({ ...prev, ...patch }))}
                  anabolic={anabolic}
                  onAnabolicChange={(patch) => setAnabolic((prev) => ({ ...prev, ...patch }))}
                  syringe={syringe}
                  onSyringeChange={(patch) => setSyringe((prev) => ({ ...prev, ...patch }))}
                  onReset={handleReset}
                />

                <ResultPanel
                  result={result}
                  capacityMl={capacityMl}
                  measure={measure}
                  doseUnit={mode === 'anabolic' ? anabolic.doseUnit : peptide.doseUnit}
                />
              </div>

              {canSaveCurrentVial ? (
                <SaveVialForm kind={mode} todayIso={todayIso} onSave={handleSaveVial} />
              ) : null}
            </>
          )}
        </main>

        <Footer />

        {view === 'calculator' ? <MobileSummaryBar result={result} measure={measure} /> : null}

        <Toast
          key={toast?.id ?? 0}
          message={toast?.message ?? ''}
          actionLabel={strings.toast.undo}
          onAction={() => {
            toast?.undo();
            dismissToast();
          }}
          onDismiss={dismissToast}
        />
      </div>
    </I18nProvider>
  );
}
