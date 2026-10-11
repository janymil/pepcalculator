import { useEffect, useMemo, useRef, useState } from 'react';
import { AgendaPage } from './components/AgendaPage';
import { CalculatorForm } from './components/CalculatorForm';
import { Footer } from './components/Footer';
import { FirstRunCard, type ExampleSet } from './components/FirstRunCard';
import { Glp1Page, type MeasurementDraft } from './components/Glp1Page';
import { GuidePage } from './components/GuidePage';
import { Header } from './components/Header';
import { MobileSummaryBar } from './components/MobileSummaryBar';
import { ModeTabs } from './components/ModeTabs';
import { OwnerTabs } from './components/OwnerTabs';
import { PrintSheet } from './components/PrintSheet';
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
  DEFAULT_GLP1_FORM,
  DEFAULT_HORMONE_FORM,
  DEFAULT_PEN,
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
import { calculateAnabolic, calculateHormone, calculatePeptide, suggestWaterMl, unitsPerMlOf, SYRINGE_TYPES, type ModeId } from './lib/calc';
import { parseNumber } from './lib/format';
import { createMeasurementId, liveMeasurements, mergeMeasurements, type Measurement } from './lib/measure';
import { toIsoDate } from './lib/dates';
import type { VialSchedule } from './lib/schedule';
import { isStandalone } from './lib/pwa';
import { syncWithServer, pushVials, type SyncFailure } from './lib/sync';
import { hashForView, viewFromHash, type ViewId } from './lib/views';
import {
  DEFAULT_OWNER_ID,
  countVialsForOwner,
  createOwnerId,
  defaultOwners,
  filterByOwner,
  mergeOwners,
  ownerName,
  resolveOwnerId,
  vialOwnerId,
  type Owner,
} from './lib/owners';
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
import type { AnabolicForm, Glp1Form, HormoneForm, PenSettings, PeptideForm, SyringeSettings, ThemeName } from './types';

export default function App() {
  const [mode, setMode] = useLocalStorage<ModeId>(STORAGE_KEYS.mode, DEFAULT_MODE);
  const [lang, setLang] = useLocalStorage<Lang>(STORAGE_KEYS.lang, detectLang());
  const [theme, setTheme] = useLocalStorage<ThemeName>(STORAGE_KEYS.theme, 'light');
  /**
   * Readability mode: larger type, stronger borders and a non-colour marker on
   * every vial dot. Opt-in, because it costs screen space.
   */
  const [readable, setReadable] = useLocalStorage<boolean>(STORAGE_KEYS.readable, false);
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
  // HGH/HCG keep their own inputs: same shape as a peptide, different units.
  const [hormone, setHormone] = useLocalStorage<HormoneForm>(
    STORAGE_KEYS.hormone,
    DEFAULT_HORMONE_FORM,
  );
  // GLP-1 pens: described by the strength on the pen, dialled in clicks.
  const [glp1, setGlp1] = useLocalStorage<Glp1Form>(STORAGE_KEYS.glp1, DEFAULT_GLP1_FORM);
  const [pen, setPen] = useLocalStorage<PenSettings>(STORAGE_KEYS.pen, DEFAULT_PEN);
  const [savedVials, setSavedVials] = useLocalStorage<SavedVial[]>(STORAGE_KEYS.vials, []);
  /**
   * The body-measurement log. It belongs to a person, exactly like a vial, so it
   * is scoped by the same owner switch rather than mixed into one list.
   */
  const [measurements, setMeasurements] = useLocalStorage<Measurement[]>(
    STORAGE_KEYS.measurements,
    [],
  );
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
  // Whose stack the app is showing. Exactly one person at a time — never mixed.
  const [owners, setOwners] = useLocalStorage<Owner[]>(STORAGE_KEYS.owners, defaultOwners());
  const [activeOwnerId, setActiveOwnerId] = useLocalStorage<string>(
    STORAGE_KEYS.activeOwner,
    DEFAULT_OWNER_ID,
  );
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<SyncFailure | null>(null);
  /** How many vials both devices had edited since they last agreed. */
  const [syncConflicts, setSyncConflicts] = useState(0);

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

  // ---- whose stack is on screen -------------------------------------------
  // The selected person, resolved so it can never point at someone removed.
  const ownerId = resolveOwnerId(owners, activeOwnerId);
  /** Every view (vials, calendar, today) renders from this, never from the mix. */
  const scopedVials = useMemo(() => filterByOwner(liveVialList, ownerId), [liveVialList, ownerId]);
  /** The measurement log for the selected person, removals hidden. */
  const scopedMeasurements = useMemo(
    () => filterByOwner(liveMeasurements(measurements), ownerId),
    [measurements, ownerId],
  );
  /** Live vial counts per person — shown in Settings, and guards removal. */
  const vialCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const vial of liveVialList) {
      const key = vialOwnerId(vial);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [liveVialList]);

  const strings = DICTIONARIES[lang];

  /** How the selected person is written on the printable sheet. */
  const ownerLabel =
    ownerName(owners, ownerId) ||
    (ownerId === DEFAULT_OWNER_ID ? strings.people.me : strings.vials.untitled);

  // Each workflow has its own syringe setup (see src/config/modes.ts). Resolving
  // the capacity guards against a remembered value that doesn't fit the current
  // mode — e.g. a 0.3 mL insulin barrel while viewing anabolic oils.
  const capacityMl = resolveCapacity(mode, syringe.capacityMl);
  const measure = modeMeta(mode).measure;

  // Peptides and hormones both reconstitute, so they share one set of inputs
  // and one maths path — only the units and the reading of the draw differ.
  const reconstituted = mode === 'hormone' ? hormone : peptide;
  /** GLP-1 and oils are both described by a strength printed on the label. */
  const labelled = mode === 'glp1' ? glp1 : anabolic;
  /** The base unit the engine works in for this workflow: mg, or IU. */
  const baseUnitLabel = reconstituted.vialUnit === 'IU' ? strings.units.IU : strings.units.mg;

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
    // Drives the type scale and the vial-dot pattern in `global.css`.
    root.dataset.readable = readable ? 'true' : 'false';
    root.lang = lang;
    root.style.colorScheme = theme;

    // Keep the browser/PWA chrome (status bar) in step with the active theme.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', strings.theme.themeColor);
  }, [theme, mode, lang, strings, readable]);

  /*
   * The pages live in the URL hash (`#calendar`), so the browser back button
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
        setSyncConflicts(outcome.conflicts.length);
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
    if (mode === 'anabolic' || mode === 'glp1') {
      return calculateAnabolic({
        concentrationMgPerMl: parseNumber(labelled.concentration),
        doseAmount: parseNumber(labelled.doseAmount),
        doseUnit: labelled.doseUnit,
        vialMl: labelled.vialMl.trim() === '' ? null : parseNumber(labelled.vialMl),
        syringeType: syringe.type,
        syringeCapacityMl: capacityMl,
        // A pen is dialled in clicks; an oil barrel is read in mL.
        measure: mode === 'glp1' ? 'clicks' : 'volume',
        clicksPerMl: mode === 'glp1' ? pen.clicksPerMl : undefined,
      });
    }

    // Peptides and hormones share the reconstitution maths; only how the draw
    // is read back differs (see `calculateHormone`).
    const input = {
      vialAmount: parseNumber(reconstituted.vialAmount),
      vialUnit: reconstituted.vialUnit,
      waterMl: parseNumber(reconstituted.waterMl),
      doseAmount: parseNumber(reconstituted.doseAmount),
      doseUnit: reconstituted.doseUnit,
      syringeType: syringe.type,
      syringeCapacityMl: capacityMl,
    };
    return mode === 'hormone' ? calculateHormone(input) : calculatePeptide(input);
  }, [mode, peptide, hormone, glp1, anabolic, labelled, syringe, capacityMl, reconstituted, pen]);

  /*
   * The "hard to measure" warning is only useful with a fix attached, so when
   * that warning fires we look for a water volume that would make the draw
   * bigger. `suggestWaterMl` returns null when more water would not help, so
   * this stays quiet for every other case.
   */
  const waterHint = useMemo(() => {
    if (mode === 'anabolic') return null;
    if (!result.warnings.some((warning) => warning.code === 'doseTooSmall')) return null;

    return suggestWaterMl({
      vialAmount: parseNumber(reconstituted.vialAmount),
      vialUnit: reconstituted.vialUnit,
      doseAmount: parseNumber(reconstituted.doseAmount),
      doseUnit: reconstituted.doseUnit,
      unitsPerMl: unitsPerMlOf(syringe.type),
      currentWaterMl: parseNumber(reconstituted.waterMl),
    });
  }, [mode, reconstituted, syringe.type, result.warnings]);

  const handleReset = () => {
    setPeptide(DEFAULT_PEPTIDE_FORM);
    setAnabolic(DEFAULT_ANABOLIC_FORM);
    setHormone(DEFAULT_HORMONE_FORM);
    setGlp1(DEFAULT_GLP1_FORM);
    setPen(DEFAULT_PEN);
    setSyringe(DEFAULT_SYRINGE);
  };

  /* ---------- saved vials ("My vials") ---------- */

  // A vial can be saved once its numbers are complete — and what counts as
  // complete differs by workflow (reconstituted: vial + water; oils: mg/mL).
  const canSaveCurrentVial =
    mode === 'anabolic' || mode === 'glp1'
      ? canSaveVial({
          kind: mode,
          concentrationMgPerMl: parseNumber(labelled.concentration),
          doseAmount: parseNumber(labelled.doseAmount),
        })
      : canSaveVial({
          kind: mode,
          vialAmount: parseNumber(reconstituted.vialAmount),
          waterMl: parseNumber(reconstituted.waterMl),
          doseAmount: parseNumber(reconstituted.doseAmount),
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
      // New vials join the stack of the person currently being viewed.
      ownerId,
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
      mode === 'anabolic' || mode === 'glp1'
        ? {
            ...base,
            kind: mode,
            // A label-driven vial is not reconstituted, so the water side stays empty.
            vialAmount: 0,
            vialUnit: 'mg',
            waterMl: 0,
            concentrationMgPerMl: parseNumber(labelled.concentration),
            vialMl: labelled.vialMl.trim() === '' ? undefined : parseNumber(labelled.vialMl),
            doseAmount: parseNumber(labelled.doseAmount),
            doseUnit: labelled.doseUnit,
            // Remember that this one is dialled, so the card can say so later.
            device: mode === 'glp1' ? 'pen' : undefined,
            clicksPerMl: mode === 'glp1' ? pen.clicksPerMl : undefined,
          }
        : {
            ...base,
            kind: mode,
            vialAmount: parseNumber(reconstituted.vialAmount),
            vialUnit: reconstituted.vialUnit,
            waterMl: parseNumber(reconstituted.waterMl),
            doseAmount: parseNumber(reconstituted.doseAmount),
            doseUnit: reconstituted.doseUnit,
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

    const kind = vialKind(vial);
    if (kind === 'anabolic' || kind === 'glp1') {
      const form = {
        concentration: String(vial.concentrationMgPerMl ?? ''),
        doseAmount: String(vial.doseAmount),
        doseUnit: vial.doseUnit,
        vialMl: vial.vialMl === undefined ? '' : String(vial.vialMl),
      };
      setMode(kind);
      if (kind === 'glp1') {
        setGlp1(form);
        // Restore the pen's dial too, or every saved pen would read as U-100.
        if (vial.device === 'pen' && vial.clicksPerMl) setPen({ clicksPerMl: vial.clicksPerMl });
      } else {
        setAnabolic(form);
      }
    } else {
      const form = {
        vialAmount: String(vial.vialAmount),
        vialUnit: vial.vialUnit,
        waterMl: String(vial.waterMl),
        doseAmount: String(vial.doseAmount),
        doseUnit: vial.doseUnit,
      };
      setMode(kind);
      if (kind === 'hormone') setHormone(form);
      else setPeptide(form);
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
    const measurementSnapshot = measurements;
    setSavedVials((previous) => clearAllVials(previous, now));
    // "Clear all data" means all of it, so the measurement log goes too.
    setMeasurements((previous) =>
      previous.map((entry) => ({ ...entry, deletedAt: now, updatedAt: now })),
    );
    showUndo(strings.toast.deletedAll, () => {
      setSavedVials(snapshot);
      setMeasurements(measurementSnapshot);
    });
  };

  const handleUpdateVial = (updated: SavedVial) => {
    // Stamping the edit time lets sync pick the newest copy per vial.
    const stamped: SavedVial = { ...updated, updatedAt: new Date().toISOString() };
    setSavedVials((previous) =>
      previous.map((vial) => (vial.id === stamped.id ? stamped : vial)),
    );
  };

  /** Logs one measurement for the selected person. */
  const handleAddMeasurement = (draft: MeasurementDraft) => {
    const now = new Date().toISOString();
    setMeasurements((previous) => [
      ...previous,
      {
        id: createMeasurementId(),
        ownerId,
        date: draft.date,
        ...draft.fields,
        updatedAt: now,
      },
    ]);
  };

  /** Soft-deletes one entry, so the removal is undoable like a vial deletion. */
  const handleRemoveMeasurement = (id: string) => {
    const snapshot = measurements;
    const now = new Date().toISOString();
    setMeasurements((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, deletedAt: now, updatedAt: now } : entry,
      ),
    );
    showUndo(strings.toast.measurementDeleted, () => setMeasurements(snapshot));
  };

  const handleRestoreVials = (
    restored: SavedVial[],
    restoredOwners: Owner[],
    restoredMeasurements: Measurement[],
  ) => {
    // Restoring is an explicit "bring these back": revive anything tombstoned
    // and stamp them as the newest copies so they win the merge.
    const now = new Date().toISOString();
    const revived = restored.map((vial) => ({ ...vial, deletedAt: undefined, updatedAt: now }));
    setSavedVials((previous) => purgeTombstones(mergeVials(previous, revived)));
    // The people travel with the vials, so their stacks stay separate.
    setOwners((previous) => mergeOwners(previous, restoredOwners));
    // The measurement log comes back the same way, on the same rule.
    if (restoredMeasurements.length > 0) {
      const revivedLog = restoredMeasurements.map((entry) => ({
        ...entry,
        deletedAt: undefined,
        updatedAt: now,
      }));
      setMeasurements((previous) => mergeMeasurements(previous, revivedLog));
    }
  };

  const handleSelectOwner = (id: string) => setActiveOwnerId(id);

  /** Adds a person and switches to them, so the next vial lands in their stack. */
  const handleAddOwner = (name: string) => {
    const id = createOwnerId();
    setOwners((previous) => [...previous, { id, name }]);
    setActiveOwnerId(id);
  };

  const handleRenameOwner = (id: string, name: string) =>
    setOwners((previous) =>
      previous.map((owner) => (owner.id === id ? { ...owner, name } : owner)),
    );

  /** Removes an empty person. Someone who still holds vials cannot be removed. */
  const handleRemoveOwner = (id: string) => {
    if (countVialsForOwner(savedVials, id) > 0) return;
    setOwners((previous) => {
      const next = previous.filter((owner) => owner.id !== id);
      return next.length > 0 ? next : defaultOwners();
    });
  };

  const runSync = async () => {
    if (!syncCode) return;
    setSyncing(true);
    setSyncError(null);
    const outcome = await syncWithServer(syncServer, syncCode, savedVials, { owners });
    setSyncing(false);
    if (outcome.ok) {
      // Same as the on-open sync: prune, then let the background push re-upload.
      setSavedVials(purgeTombstones(outcome.vials));
      setOwners((previous) => mergeOwners(previous, outcome.owners));
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
      void pushVials(syncServer, syncCode, savedVials, { owners }).then((outcome) => {
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
  }, [savedVials, owners, syncCode, syncServer]);

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
          <OwnerTabs
            owners={owners}
            activeId={ownerId}
            onSelect={handleSelectOwner}
            onAdd={handleAddOwner}
          />

          <ViewTabs view={view} onChange={changeView} />

          <div className="view-enter" key={view}>
            {view === 'calendar' ? (
            <AgendaPage
              vials={scopedVials}
              todayIso={todayIso}
              nowTime={nowTime}
              onGoToCalculator={() => changeView('calculator')}
            />
          ) : view === 'vials' ? (
            <SavedVials
              vials={scopedVials}
              owners={owners}
              measurements={scopedMeasurements}
              /* A backup copies the whole device, not the stack on screen. */
              allVials={liveVialList}
              allMeasurements={liveMeasurements(measurements)}
              todayIso={todayIso}
              nowTime={nowTime}
              onUpdate={handleUpdateVial}
              onRestore={handleRestoreVials}
              onLoad={handleLoadVial}
              onAddDose={handleAddDose}
              onRemoveDose={handleRemoveDose}
              onDelete={handleDeleteVial}
              onGoToCalculator={() => changeView('calculator')}
              onOpenGlp1={() => changeView('glp1')}
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
              syncConflicts={syncConflicts}
              readable={readable}
              onToggleReadable={setReadable}
              remindersEnabled={remindersEnabled}
              permission={reminders.permission}
              nextReminder={reminders.next}
              todayIso={todayIso}
              installed={installed}
              onToggleReminders={setRemindersEnabled}
              onRequestPermission={reminders.requestPermission}
              hasVials={liveVialList.length > 0}
              onClearAll={handleClearAll}
              owners={owners}
              vialCounts={vialCounts}
              onRenameOwner={handleRenameOwner}
              onRemoveOwner={handleRemoveOwner}
            />
          ) : view === 'glp1' ? (
            <Glp1Page
              measurements={scopedMeasurements}
              todayIso={todayIso}
              onAdd={handleAddMeasurement}
              onRemove={handleRemoveMeasurement}
            />
          ) : view === 'reference' ? (
            <ReferencePage vials={savedVials} todayIso={todayIso} />
          ) : view === 'guide' ? (
            <GuidePage />
          ) : (
            <>
              {showFirstRun ? (
                <FirstRunCard onApply={handleApplyExample} onDismiss={() => setFirstRunDone(true)} />
              ) : null}

              <TodayDoseCard
                vials={scopedVials}
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
                  hormone={hormone}
                  onHormoneChange={(patch) => setHormone((prev) => ({ ...prev, ...patch }))}
                  glp1={glp1}
                  onGlp1Change={(patch) => setGlp1((prev) => ({ ...prev, ...patch }))}
                  pen={pen}
                  onPenChange={(patch) => setPen((prev) => ({ ...prev, ...patch }))}
                  syringe={syringe}
                  onSyringeChange={(patch) => setSyringe((prev) => ({ ...prev, ...patch }))}
                  onReset={handleReset}
                />

                {/* Only an IU workflow needs the graduation count spelled out:
                    there the headline is mL, but the barrel is read in units. */}
                <ResultPanel
                  result={result}
                  capacityMl={capacityMl}
                  measure={measure}
                  doseUnit={
                    mode === 'anabolic' || mode === 'glp1'
                      ? labelled.doseUnit
                      : reconstituted.doseUnit
                  }
                  baseUnitLabel={baseUnitLabel}
                  scaleLabel={
                    mode === 'hormone'
                      ? (SYRINGE_TYPES.find((type) => type.id === syringe.type)?.label ?? 'U-100')
                      : undefined
                  }
                  waterHint={waterHint}
                  onApplyWater={(waterMl) => {
                    const withWater = (prev: PeptideForm) => ({
                      ...prev,
                      waterMl: String(waterMl),
                    });
                    if (mode === 'hormone') setHormone(withWater);
                    else setPeptide(withWater);
                  }}
                />
              </div>

              {canSaveCurrentVial ? (
                <SaveVialForm kind={mode} todayIso={todayIso} onSave={handleSaveVial} />
              ) : null}
            </>
          )}
          </div>
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

      {/*
       * The printable sheet lives *outside* the app shell on purpose: `@media
       * print` hides `.app` and reveals this, which keeps every screen style out
       * of the printout without a portal or a second document.
       */}
      <PrintSheet vials={scopedVials} ownerName={ownerLabel} todayIso={todayIso} />
    </I18nProvider>
  );
}
