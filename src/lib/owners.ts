/**
 * Who a saved vial belongs to — the "whose stack is this?" axis.
 *
 * This is deliberately **separate from the vial kind**: kind says *what* is in
 * the vial (a peptide or an anabolic oil), while an owner says *whose* stack it
 * belongs to (you, your partner, a family member…). The two never mix: the app
 * always shows exactly one person at a time, and the kind filter then narrows
 * *within* that person.
 *
 * Pure module: no React, no DOM, no storage. A vial saved before owners existed
 * has no `ownerId` and belongs to the **default owner**, so nothing is ever
 * orphaned or silently merged.
 */

export interface Owner {
  id: string;
  /** Display name. May be empty — the UI then falls back to a localised "Me". */
  name: string;
}

/** The person every pre-owner vial belongs to (the first tab). */
export const DEFAULT_OWNER_ID = 'me';

/** A fresh install has a single, unnamed person (shown as "Me"). */
export function defaultOwners(): Owner[] {
  return [{ id: DEFAULT_OWNER_ID, name: '' }];
}

/** Collision-resistant id for a new person. */
export function createOwnerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `own-${crypto.randomUUID()}`;
  }
  return `own-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sanitises a stored list of people: drops anything unusable, de-duplicates by
 * id, trims names, and always returns at least one person so the app can never
 * end up with nobody to select.
 */
export function normalizeOwners(value: unknown): Owner[] {
  if (!Array.isArray(value)) return defaultOwners();

  const seen = new Set<string>();
  const owners: Owner[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const { id, name } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || id.trim() === '') continue;
    if (seen.has(id)) continue;
    seen.add(id);
    owners.push({ id, name: typeof name === 'string' ? name.trim() : '' });
  }

  return owners.length > 0 ? owners : defaultOwners();
}

/** The owner a vial belongs to; older vials (no `ownerId`) use the default. */
export function vialOwnerId(vial: { ownerId?: string }): string {
  return typeof vial.ownerId === 'string' && vial.ownerId.trim() !== ''
    ? vial.ownerId
    : DEFAULT_OWNER_ID;
}

/** Only the vials belonging to one person — the core "don't mix stacks" helper. */
export function filterByOwner<T extends { ownerId?: string }>(vials: T[], ownerId: string): T[] {
  return vials.filter((vial) => vialOwnerId(vial) === ownerId);
}

/** The selected owner id, falling back to the first person when it no longer exists. */
export function resolveOwnerId(owners: Owner[], ownerId: string): string {
  if (owners.some((owner) => owner.id === ownerId)) return ownerId;
  return owners[0]?.id ?? DEFAULT_OWNER_ID;
}

/**
 * Merges two owner lists (union by id; an existing person keeps its name so a
 * device that already renamed "Me" is not overwritten by a default payload).
 */
export function mergeOwners(current: Owner[], incoming: Owner[]): Owner[] {
  const byId = new Map(current.map((owner) => [owner.id, owner]));
  for (const owner of incoming) {
    const existing = byId.get(owner.id);
    if (!existing) byId.set(owner.id, owner);
    else if (!existing.name && owner.name) byId.set(owner.id, { ...existing, name: owner.name });
  }
  return [...byId.values()];
}

/** Display name of a person, or the raw id when the person is unknown. */
export function ownerName(owners: Owner[], id: string): string {
  return owners.find((owner) => owner.id === id)?.name ?? id;
}

/** How many live (non-deleted) vials a person still holds — guards removal. */
export function countVialsForOwner<T extends { ownerId?: string; deletedAt?: string }>(
  vials: T[],
  ownerId: string,
): number {
  return vials.filter((vial) => !vial.deletedAt && vialOwnerId(vial) === ownerId).length;
}

/**
 * How many people should be created when a backup/sync introduces vials whose
 * owner is missing locally (e.g. the other device added someone). Keeps the
 * person list in step with the vials it contains.
 */
export function ownersFromVials<T extends { ownerId?: string }>(vials: T[]): string[] {
  const ids = new Set<string>();
  for (const vial of vials) ids.add(vialOwnerId(vial));
  return [...ids];
}
