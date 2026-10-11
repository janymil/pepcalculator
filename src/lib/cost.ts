/**
 * Cost-per-dose and stock helpers.
 *
 * Pure: the caller supplies the numbers (price, how many doses a vial holds,
 * how many are left), so this stays testable and free of React/DOM.
 */

/** Rounds to cents so currency output is stable. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Cost of a single dose: price of the vial divided by how many doses it holds. */
export function costPerDose(price: number | undefined | null, dosesPerVial: number): number | null {
  if (price === undefined || price === null || !Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(dosesPerVial) || dosesPerVial <= 0) return null;
  return round2(price / dosesPerVial);
}

/** Cost of the doses a plan has left, given what each dose costs. */
export function costForDoses(perDose: number | null, doses: number): number | null {
  if (perDose === null || !Number.isFinite(doses) || doses <= 0) return null;
  return round2(perDose * doses);
}

/**
 * What the plan will cost to finish, using the vial's actual capacity — the
 * number people plan around ("this 12-week run costs X").
 */
export function planCost(
  price: number | undefined | null,
  plannedDoses: number | null,
  dosesPerVial: number,
): number | null {
  if (plannedDoses === null || plannedDoses <= 0) return null;
  const perDose = costPerDose(price, dosesPerVial);
  if (perDose === null) return null;
  return round2(perDose * plannedDoses);
}

/** Whether a stock row should read as running low. */
export function isLowStock(dosesLeft: number | null, threshold = 3): boolean {
  return dosesLeft !== null && dosesLeft <= threshold;
}

/**
 * What a protocol costs per month, given what one dose costs and how often it is
 * taken. Weeks are converted with 52/12 so a weekly protocol does not drift.
 */
export function costPerMonth(perDose: number | null, dosesPerWeek: number): number | null {
  if (perDose === null || !Number.isFinite(perDose) || perDose <= 0) return null;
  if (!Number.isFinite(dosesPerWeek) || dosesPerWeek <= 0) return null;
  return round2((perDose * dosesPerWeek * 52) / 12);
}
