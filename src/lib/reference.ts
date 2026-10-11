/**
 * A small, deliberately conservative reference layer.
 *
 * IMPORTANT: this is **educational only** and is *not* medical advice. Every
 * entry carries publicly documented, commonly-cited starting ranges and
 * half-lives so the calculator can offer context — never a prescription, and
 * never a target the app recommends. The UI always shows the disclaimer next
 * to this data.
 */

import { isPositive, toBase } from './calc';

export type CompoundClass = 'peptide' | 'anabolic';

export interface CompoundReference {
  id: string;
  /** Display name (a brand is never assumed). */
  name: string;
  klass: CompoundClass;
  /** Commonly cited starting range, in the compound's usual unit. */
  typicalLowMg: number;
  typicalHighMg: number;
  /** The unit those figures are expressed in. */
  unit: 'mg' | 'mcg';
  /** Bacteriostatic water volumes people commonly reconstitute with (mL). */
  commonWaterMl: number[];
  /** Rough elimination half-life in hours (for the PK chart). */
  halfLifeHours: number;
  /** Typical dosing cadence, as a short, factual note. */
  cadence: string;
}

/**
 * Reference data. Values are rounded, widely published, community figures used
 * for illustration; they do not replace a clinician's guidance.
 */
export const COMPOUNDS: readonly CompoundReference[] = [
  {
    id: 'bpc157',
    name: 'BPC-157',
    klass: 'peptide',
    typicalLowMg: 0.25,
    typicalHighMg: 0.5,
    unit: 'mg',
    commonWaterMl: [1, 2],
    halfLifeHours: 4,
    cadence: '1–2× per day',
  },
  {
    id: 'tb500',
    name: 'TB-500 (Thymosin β4)',
    klass: 'peptide',
    typicalLowMg: 2,
    typicalHighMg: 5,
    unit: 'mg',
    commonWaterMl: [1, 2],
    halfLifeHours: 2,
    cadence: '2× per week',
  },
  {
    id: 'ipamorelin',
    name: 'Ipamorelin',
    klass: 'peptide',
    typicalLowMg: 100,
    typicalHighMg: 300,
    unit: 'mcg',
    commonWaterMl: [1, 2],
    halfLifeHours: 2,
    cadence: '1–3× per day',
  },
  {
    id: 'cjc1295',
    name: 'CJC-1295 (no DAC)',
    klass: 'peptide',
    typicalLowMg: 100,
    typicalHighMg: 200,
    unit: 'mcg',
    commonWaterMl: [1, 2],
    halfLifeHours: 0.5,
    cadence: '1–3× per day',
  },
  {
    id: 'semaglutide',
    name: 'Semaglutide',
    klass: 'peptide',
    typicalLowMg: 250,
    typicalHighMg: 1000,
    unit: 'mcg',
    commonWaterMl: [1, 2],
    halfLifeHours: 168,
    cadence: '1× per week',
  },
  {
    id: 'tirzepatide',
    name: 'Tirzepatide',
    klass: 'peptide',
    typicalLowMg: 2500,
    typicalHighMg: 5000,
    unit: 'mcg',
    commonWaterMl: [1, 2],
    halfLifeHours: 120,
    cadence: '1× per week',
  },
  {
    id: 'melanotan2',
    name: 'Melanotan II',
    klass: 'peptide',
    typicalLowMg: 250,
    typicalHighMg: 500,
    unit: 'mcg',
    commonWaterMl: [1, 2],
    halfLifeHours: 1,
    cadence: '1× per day',
  },
  {
    id: 'ghkcu',
    name: 'GHK-Cu',
    klass: 'peptide',
    typicalLowMg: 1,
    typicalHighMg: 2,
    unit: 'mg',
    commonWaterMl: [2, 3],
    halfLifeHours: 1,
    cadence: '1–2× per day',
  },
  {
    id: 'test-e',
    name: 'Testosterone enanthate',
    klass: 'anabolic',
    typicalLowMg: 100,
    typicalHighMg: 250,
    unit: 'mg',
    commonWaterMl: [],
    halfLifeHours: 108,
    cadence: 'every 3–7 days',
  },
  {
    id: 'test-c',
    name: 'Testosterone cypionate',
    klass: 'anabolic',
    typicalLowMg: 100,
    typicalHighMg: 250,
    unit: 'mg',
    commonWaterMl: [],
    halfLifeHours: 192,
    cadence: 'every 4–7 days',
  },
  {
    id: 'npp',
    name: 'Nandrolone phenylpropionate (NPP)',
    klass: 'anabolic',
    typicalLowMg: 50,
    typicalHighMg: 150,
    unit: 'mg',
    commonWaterMl: [],
    halfLifeHours: 60,
    cadence: 'every 2–3 days',
  },
  {
    id: 'tren-a',
    name: 'Trenbolone acetate',
    klass: 'anabolic',
    typicalLowMg: 25,
    typicalHighMg: 75,
    unit: 'mg',
    commonWaterMl: [],
    halfLifeHours: 48,
    cadence: 'every other day',
  },
  {
    id: 'mast-p',
    name: 'Masteron propionate',
    klass: 'anabolic',
    typicalLowMg: 50,
    typicalHighMg: 100,
    unit: 'mg',
    commonWaterMl: [],
    halfLifeHours: 60,
    cadence: 'every other day',
  },
];

/** All compounds of a kind, in list order. */
export function compoundsOfKind(klass: CompoundClass): CompoundReference[] {
  return COMPOUNDS.filter((compound) => compound.klass === klass);
}

/** Look up one compound by id (undefined when unknown). */
export function compoundById(id: string): CompoundReference | undefined {
  return COMPOUNDS.find((compound) => compound.id === id);
}

/** Formats a range with the right unit, e.g. "0.25–0.5 mg" or "100–300 mcg". */
export function formatRange(compound: CompoundReference): string {
  const { typicalLowMg, typicalHighMg, unit } = compound;
  const value = typicalLowMg === typicalHighMg ? `${typicalLowMg}` : `${typicalLowMg}–${typicalHighMg}`;
  return `${value} ${unit}`;
}

/** Letters and digits only, lower-cased — so `BPC-157`, `bpc 157` and `bpc157` agree. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the reference entry a user's vial name refers to, if any.
 *
 * Matching is deliberately forgiving about punctuation and spacing (`BPC 157`,
 * `bpc-157`, `bpc157` all match) but still tight: a full match, or a prefix of
 * at least four characters. That way "TB-500" finds `TB-500 (Thymosin β4)`
 * without a loose "contains" search quietly matching the wrong compound.
 */
export function matchCompound(name: string): CompoundReference | undefined {
  const needle = normalizeName(name);
  if (needle.length < 3) return undefined;

  const exact = COMPOUNDS.find(
    (compound) =>
      normalizeName(compound.id) === needle || normalizeName(compound.name) === needle,
  );
  if (exact) return exact;

  if (needle.length < 4) return undefined;
  return COMPOUNDS.find(
    (compound) =>
      normalizeName(compound.id).startsWith(needle) ||
      normalizeName(compound.name).startsWith(needle),
  );
}

/** Where a dose sits against a compound's commonly cited range. */
export type RangeVerdict = 'wellBelow' | 'below' | 'within' | 'above';

/**
 * A deliberately neutral read of a dose against the cited range — used only to
 * offer context ("this is well outside the range usually discussed"), never to
 * advise. Returns null when there is nothing sensible to compare.
 */
export function rangeHint(compound: CompoundReference, doseMg: number): RangeVerdict | null {
  if (!isPositive(doseMg)) return null;

  const low = toBase(compound.typicalLowMg, compound.unit);
  const high = toBase(compound.typicalHighMg, compound.unit);
  if (!isPositive(low) || !isPositive(high)) return null;

  if (doseMg < low * 0.5) return 'wellBelow';
  if (doseMg < low) return 'below';
  if (doseMg > high) return 'above';
  return 'within';
}
