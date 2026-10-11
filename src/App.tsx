import { useEffect, useMemo, useRef, useState } from 'react';
import { CalculatorForm } from './components/CalculatorForm';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { ModeTabs } from './components/ModeTabs';
import { ResultPanel } from './components/ResultPanel';
import { SavedVials } from './components/SavedVials';
import { SyncPanel } from './components/SyncPanel';
import {
  DEFAULT_ANABOLIC_FORM,
  DEFAULT_PEPTIDE_FORM,
  DEFAULT_SYRINGE,
  DEFAULT_SYNC_SERVER,
  STORAGE_KEYS,
} from './config/defaults';
import { DEFAULT_MODE, modeMeta, resolveCapacity } from './config/modes';
import { useLocalStorage } from './hooks/useLocalStorage';
import { DICTIONARIES, detectLang } from './i18n';
import { I18nProvider } from './i18n/I18nContext';
import type { Lang } from './i18n/types';
import { calculateAnabolic, calculatePeptide, type ModeId } from './lib/calc';
import { parseNumber } from './lib/format';
import { toIsoDate } from './lib/dates';
import type { VialSchedule } from './lib/schedule';
import { syncWithServer, pushVials, type SyncFailure } from './lib/sync';
import {
  canSaveVial,
  createVialId,
  liveVials,
  mergeVials,
  tombstoneVial,
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
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<SyncFailure | null>(null);

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

  // Keep the <html> element in sync so CSS variables and a11y match the UI.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    root.lang = lang;
    root.style.colorScheme = theme;
  }, [theme, mode, lang]);

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
        setSavedVials(outcome.vials);
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

  /* ---------- saved vials ("My reconstituted vials") ---------- */

  // Only reconstituted peptides make sense to save, and only once the
  // reconstitution itself is complete (vial + water + dose).
  const vialDraft = {
    vialAmount: parseNumber(peptide.vialAmount),
    waterMl: parseNumber(peptide.waterMl),
    doseAmount: parseNumber(peptide.doseAmount),
  };
  const canSaveCurrentVial = mode === 'peptide' && canSaveVial(vialDraft);

  const handleSaveVial = (name: string, reconstitutedOn: string, schedule: VialSchedule) => {
    if (!canSaveCurrentVial) return;
    const vial: SavedVial = {
      id: createVialId(),
      name,
      reconstitutedOn,
      vialAmount: vialDraft.vialAmount,
      vialUnit: peptide.vialUnit,
      waterMl: vialDraft.waterMl,
      doseAmount: vialDraft.doseAmount,
      doseUnit: peptide.doseUnit,
      dosesTaken: 0,
      syringeType: syringe.type,
      syringeCapacityMl: capacityMl,
      schedule,
      updatedAt: new Date().toISOString(),
    };
    setSavedVials((previous) => [vial, ...previous]);
  };

  const handleLoadVial = (vial: SavedVial) => {
    setMode('peptide');
    setPeptide({
      vialAmount: String(vial.vialAmount),
      vialUnit: vial.vialUnit,
      waterMl: String(vial.waterMl),
      doseAmount: String(vial.doseAmount),
      doseUnit: vial.doseUnit,
    });
    setSyringe({ type: vial.syringeType, capacityMl: vial.syringeCapacityMl });
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
    setSavedVials((previous) =>
      previous.map((vial) => (vial.id === id ? tombstoneVial(vial, now) : vial)),
    );
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
    setSavedVials((previous) => mergeVials(previous, revived));
  };

  const runSync = async () => {
    if (!syncCode) return;
    setSyncing(true);
    setSyncError(null);
    const outcome = await syncWithServer(syncServer, syncCode, savedVials);
    setSyncing(false);
    if (outcome.ok) {
      setSavedVials(outcome.vials);
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

  return (
    <I18nProvider value={{ lang, setLang, strings }}>
      <div className="app">
        <Header
          theme={theme}
          onThemeToggle={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
        />

        <main className="app__main">
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

            <ResultPanel result={result} capacityMl={capacityMl} measure={measure} />
          </div>

          <SavedVials
            vials={liveVialList}
            canSave={canSaveCurrentVial}
            todayIso={todayIso}
            nowTime={nowTime}
            onSave={handleSaveVial}
            onUpdate={handleUpdateVial}
            onRestore={handleRestoreVials}
            onLoad={handleLoadVial}
            onAddDose={handleAddDose}
            onRemoveDose={handleRemoveDose}
            onDelete={handleDeleteVial}
          />

          <SyncPanel
            code={syncCode}
            serverUrl={syncServer}
            isSyncing={syncing}
            lastSyncedAt={syncLast}
            error={syncError}
            onSetCode={setSyncCode}
            onSetServerUrl={setSyncServer}
            onSyncNow={() => void runSync()}
            onForget={handleForgetSync}
          />
        </main>

        <Footer />
      </div>
    </I18nProvider>
  );
}
