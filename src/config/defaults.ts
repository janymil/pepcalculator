import type { AnabolicForm, PeptideForm, SyringeSettings } from '../types';

/** Sensible starting values so the app is usable the moment it opens. */
export const DEFAULT_PEPTIDE_FORM: PeptideForm = {
  vialAmount: '5',
  vialUnit: 'mg',
  waterMl: '2',
  doseAmount: '250',
  doseUnit: 'mcg',
};

export const DEFAULT_ANABOLIC_FORM: AnabolicForm = {
  concentration: '250',
  doseAmount: '250',
  doseUnit: 'mg',
  vialMl: '10',
};

export const DEFAULT_SYRINGE: SyringeSettings = {
  type: 'U100',
  capacityMl: 1,
};

/**
 * Where the recovery-code sync server lives. Overridable in the UI — see
 * `server/README.md` for how to run it.
 *
 * `VITE_SYNC_SERVER` is baked in at build time, so a freshly installed phone
 * points at your deployed server instead of `localhost`. Copy `.env.example`
 * to `.env` (or set it in your host's dashboard) before `npm run build`.
 */
export const DEFAULT_SYNC_SERVER: string =
  import.meta.env.VITE_SYNC_SERVER ?? 'http://localhost:8787';

/** localStorage keys — versioned so a future schema change can migrate cleanly. */
export const STORAGE_KEYS = {
  peptide: 'pepcalc.v1.peptide',
  anabolic: 'pepcalc.v1.anabolic',
  syringe: 'pepcalc.v1.syringe',
  lang: 'pepcalc.v1.lang',
  theme: 'pepcalc.v1.theme',
  mode: 'pepcalc.v1.mode',
  vials: 'pepcalc.v1.vials',
  syncCode: 'pepcalc.v1.syncCode',
  syncServer: 'pepcalc.v1.syncServer',
  syncLast: 'pepcalc.v1.syncLast',
  reminders: 'pepcalc.v1.reminders',
  view: 'pepcalc.v1.view',
  firstRunDone: 'pepcalc.v1.firstRunDone',
  kindFilter: 'pepcalc.v1.kindFilter',
  owners: 'pepcalc.v1.owners',
  activeOwner: 'pepcalc.v1.activeOwner',
  /** When the user last downloaded a JSON backup — drives the backup reminder. */
  lastBackup: 'pepcalc.v1.lastBackup',
} as const;
