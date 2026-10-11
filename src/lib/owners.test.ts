import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OWNER_ID,
  countVialsForOwner,
  createOwnerId,
  defaultOwners,
  filterByOwner,
  mergeOwners,
  normalizeOwners,
  ownerName,
  ownersFromVials,
  resolveOwnerId,
  vialOwnerId,
  type Owner,
} from './owners';

describe('owners', () => {
  it('starts with one (unnamed) person', () => {
    expect(defaultOwners()).toEqual([{ id: DEFAULT_OWNER_ID, name: '' }]);
  });

  it('mints unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createOwnerId()));
    expect(ids.size).toBe(50);
  });

  it('falls back to one person for garbage input', () => {
    expect(normalizeOwners(null)).toEqual(defaultOwners());
    expect(normalizeOwners([])).toEqual(defaultOwners());
    expect(normalizeOwners([{ id: '' }, { id: 1 } as unknown as Owner])).toEqual(defaultOwners());
  });

  it('de-duplicates, trims names and tolerates a missing name', () => {
    expect(
      normalizeOwners([
        { id: 'me', name: '  Sam  ' },
        { id: 'me', name: 'Other' },
        { id: 'wife' },
      ]),
    ).toEqual([
      { id: 'me', name: 'Sam' },
      { id: 'wife', name: '' },
    ]);
  });
});

describe('vial ownership', () => {
  it('treats a vial without an owner as the default person', () => {
    expect(vialOwnerId({})).toBe(DEFAULT_OWNER_ID);
    expect(vialOwnerId({ ownerId: '  ' })).toBe(DEFAULT_OWNER_ID);
    expect(vialOwnerId({ ownerId: 'wife' })).toBe('wife');
  });

  it('keeps stacks strictly apart', () => {
    const vials = [{ ownerId: 'me' }, {}, { ownerId: 'wife' }];
    expect(filterByOwner(vials, 'me')).toHaveLength(2);
    expect(filterByOwner(vials, 'wife')).toHaveLength(1);
    expect(filterByOwner(vials, 'someone')).toEqual([]);
  });

  it('falls back to the first person when the remembered one is gone', () => {
    const owners: Owner[] = [
      { id: 'me', name: '' },
      { id: 'wife', name: 'Kim' },
    ];
    expect(resolveOwnerId(owners, 'wife')).toBe('wife');
    expect(resolveOwnerId(owners, 'deleted')).toBe('me');
    expect(resolveOwnerId([], 'anything')).toBe(DEFAULT_OWNER_ID);
  });

  it('names people and counts their live vials', () => {
    const owners: Owner[] = [
      { id: 'me', name: '' },
      { id: 'wife', name: 'Kim' },
    ];
    expect(ownerName(owners, 'wife')).toBe('Kim');
    expect(ownerName(owners, 'unknown')).toBe('unknown');

    const vials = [
      { ownerId: 'wife' },
      { ownerId: 'wife', deletedAt: '2026-01-01T00:00:00.000Z' },
      { ownerId: 'me' },
      {},
    ];
    expect(countVialsForOwner(vials, 'wife')).toBe(1);
    expect(countVialsForOwner(vials, 'me')).toBe(2);
  });
});

describe('mergeOwners', () => {
  it('unions by id and keeps an existing name', () => {
    const merged = mergeOwners(
      [{ id: 'me', name: 'Sam' }],
      [
        { id: 'me', name: 'Me' },
        { id: 'wife', name: 'Kim' },
      ],
    );
    expect(merged).toEqual([
      { id: 'me', name: 'Sam' },
      { id: 'wife', name: 'Kim' },
    ]);
  });

  it('adopts an incoming name when the local one is still blank', () => {
    expect(mergeOwners([{ id: 'me', name: '' }], [{ id: 'me', name: 'Sam' }])).toEqual([
      { id: 'me', name: 'Sam' },
    ]);
  });
});

describe('ownersFromVials', () => {
  it('reports every owner present, including the default', () => {
    expect(new Set(ownersFromVials([{ ownerId: 'wife' }, {}]))).toEqual(
      new Set(['wife', DEFAULT_OWNER_ID]),
    );
  });
});
