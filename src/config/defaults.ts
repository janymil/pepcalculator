import type { AnabolicForm, HormoneForm, PeptideForm, SyringeSettings } from '../types';

/** Sensible starting values so the app is usable the moment it opens. */
export const DEFAULT_PEPTIDE_FORM: PeptideForm = {
  vialAmount: '5',
  vialUnit: 'mg',
  waterMl: '2',
  doseAmount: '250',
  doseUnit: 'mcg',
};

/**
 * HGH/HCG defaults: a 10 IU vial dissolved in 1 mL, dosed at 2 IU — which is
 * 0.2 mL, i.e. 20 graduations on a U-100 syringe.
 */
export const DEFAULT_HORMONE_FORM: HormoneForm = {
  vialAmount: '10',
  vialUnit: 'IU',
  waterMl: '1',
  doseAmount: '2',
  doseUnit: 'IU',
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
  hormone: 'pepcalc.v1.hormone',
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
