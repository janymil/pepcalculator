/**
 * The conversions people do in their heads and get wrong.
 *
 * Deliberately tiny and pure: it is the same arithmetic the calculator already
 * uses, exposed so a label or a syringe can be checked without starting a whole
 * calculation. There is deliberately **no mg↔IU path** — the two are different
 * kinds of quantity (see `unitFamily`), and inventing a factor would be worse
 * than refusing.
 */

import { fromBase, toBase } from './calc';

export interface MassConversion {
  mg: number;
  mcg: number;
}

/** Milligrams ↔ micrograms, the one conversion that is always safe. */
export function convertMass(amount: number, from: 'mg' | 'mcg'): MassConversion {
  const mg = toBase(amount, from);
  return { mg, mcg: fromBase(mg, 'mcg') };
}

export interface DrawConversion {
  ml: number;
  /** Graduations on the given insulin scale. */
  units: number;
  /** Dial clicks, when the pen's resolution is known. */
  clicks: number | null;
}

function drawFrom(ml: number, unitsPerMl: number, clicksPerMl?: number): DrawConversion {
  return {
    ml,
    units: unitsPerMl > 0 ? ml * unitsPerMl : 0,
    clicks: clicksPerMl !== undefined && clicksPerMl > 0 ? ml * clicksPerMl : null,
  };
}

/** Millilitres into every other way of reading the same draw. */
export function fromMl(ml: number, unitsPerMl: number, clicksPerMl?: number): DrawConversion {
  return drawFrom(ml, unitsPerMl, clicksPerMl);
}

/** Syringe graduations back into millilitres (and clicks). */
export function fromUnits(units: number, unitsPerMl: number, clicksPerMl?: number): DrawConversion {
  return drawFrom(unitsPerMl > 0 ? units / unitsPerMl : 0, unitsPerMl, clicksPerMl);
}

/** Pen dial clicks back into millilitres (and graduations). */
export function fromClicks(clicks: number, clicksPerMl: number, unitsPerMl = 100): DrawConversion {
  return drawFrom(clicksPerMl > 0 ? clicks / clicksPerMl : 0, unitsPerMl, clicksPerMl);
}

/** The strength of a mixed vial: base units (mg or IU) per mL. */
export function concentrationOf(amountBase: number, waterMl: number): number {
  return waterMl > 0 ? amountBase / waterMl : 0;
}

/** How much to draw for a dose, given a concentration. */
export function drawForDose(doseBase: number, concentrationPerMl: number): number {
  return concentrationPerMl > 0 ? doseBase / concentrationPerMl : 0;
}
