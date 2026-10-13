import { describe, expect, it } from 'vitest';
import type { VialSchedule } from './schedule';
import {
  isShareDate,
  isShared,
  makeShare,
  normalizeShares,
  participantIds,
  shareDose,
  shareDoseUnit,
  shareFor,
  shareSchedule,
  sharesOf,
  viewVial,
  type ShareableVial,
  type VialShare,
} from './shares';

/** A 5 mg vial in 2 mL, dosed at 250 mcg by its owner, mixed on 10 Oct. */
function vial(overrides: Partial<ShareableVial> = {}): ShareableVial {
  return {
    ownerId: 'me',
    reconstitutedOn: '2026-10-10',
    doseAmount: 250,
    doseUnit: 'mcg',
    schedule: daily('2026-10-10'),
    ...overrides,
  };
}

function daily(startsOn: string, times = ['09:00']): VialSchedule {
  return { times, repeat: 'daily', weekdays: [], startsOn, durationValue: 4, durationUnit: 'weeks' };
}

function share(overrides: Partial<VialShare> = {}): VialShare {
  return { ownerId: 'ana', from: '2026-10-20', ...overrides };
}

describe('isShareDate', () => {
  it('accepts a plain yyyy-mm-dd day and nothing else', () => {
    expect(isShareDate('2026-10-20')).toBe(true);
    expect(isShareDate(' 2026-10-20 ')).toBe(true);
    expect(isShareDate('2026-10-20T10:00:00Z')).toBe(false);
    expect(isShareDate('20-10-2026')).toBe(false);
    expect(isShareDate('')).toBe(false);
    expect(isShareDate(undefined)).toBe(false);
    expect(isShareDate(20261020)).toBe(false);
  });
});

describe('normalizeShares', () => {
  it('returns nothing for a vial nobody shares', () => {
    expect(normalizeShares(undefined, 'me', '2026-10-10')).toEqual([]);
    expect(normalizeShares([], 'me', '2026-10-10')).toEqual([]);
  });

  it('drops entries that cannot describe a person', () => {
    const shares = normalizeShares(
      [null, 'ana', 42, {}, { ownerId: '' }, { ownerId: '   ' }, { ownerId: 7 }],
      'me',
      '2026-10-10',
    );
    expect(shares).toEqual([]);
  });

  it('never lets a vial be shared with its own owner', () => {
    expect(normalizeShares([{ ownerId: 'me', from: '2026-10-20' }], 'me', '2026-10-10')).toEqual([]);
  });

  it('keeps one entry per person, in the order given', () => {
    const shares = normalizeShares(
      [
        { ownerId: 'ana', from: '2026-10-20' },
        { ownerId: 'tom', from: '2026-10-22' },
        { ownerId: 'ana', from: '2026-10-25' },
      ],
      'me',
      '2026-10-10',
    );
    expect(shares.map((entry) => entry.ownerId)).toEqual(['ana', 'tom']);
    expect(shares[0].from).toBe('2026-10-20');
  });

  it('pulls a start date forward to the day the powder was mixed', () => {
    // Nobody can draw from a bottle before it existed.
    const shares = normalizeShares([{ ownerId: 'ana', from: '2026-10-01' }], 'me', '2026-10-10');
    expect(shares[0].from).toBe('2026-10-10');
  });

  it('falls back to the mix date when the start is missing or malformed', () => {
    expect(normalizeShares([{ ownerId: 'ana' }], 'me', '2026-10-10')[0].from).toBe('2026-10-10');
    expect(
      normalizeShares([{ ownerId: 'ana', from: 'yesterday' }], 'me', '2026-10-10')[0].from,
    ).toBe('2026-10-10');
  });

  it('keeps a usable dose, with its unit', () => {
    const [entry] = normalizeShares(
      [{ ownerId: 'ana', from: '2026-10-20', doseAmount: 500, doseUnit: 'mcg' }],
      'me',
      '2026-10-10',
    );
    expect(entry.doseAmount).toBe(500);
    expect(entry.doseUnit).toBe('mcg');
  });

  it('refuses a dose that is not a positive number', () => {
    for (const doseAmount of [0, -5, Number.NaN, '500', null]) {
      const [entry] = normalizeShares(
        [{ ownerId: 'ana', from: '2026-10-20', doseAmount }],
        'me',
        '2026-10-10',
      );
      expect(entry.doseAmount).toBeUndefined();
      expect(entry.doseUnit).toBeUndefined();
    }
  });

  it('keeps their own plan, anchored to the day they joined', () => {
    const [entry] = normalizeShares(
      [
        {
          ownerId: 'ana',
          from: '2026-10-20',
          schedule: { ...daily('2026-10-21'), repeat: 'interval', intervalDays: 3 },
        },
      ],
      'me',
      '2026-10-10',
    );
    expect(entry.schedule?.repeat).toBe('interval');
    expect(entry.schedule?.intervalDays).toBe(3);
    // The cadence can never disagree with `from` about when sharing began.
    expect(entry.schedule?.startsOn).toBe('2026-10-20');
  });

  it('drops a plan that is not a plan at all', () => {
    const [entry] = normalizeShares(
      [{ ownerId: 'ana', from: '2026-10-20', schedule: { times: 'not-a-list' } }],
      'me',
      '2026-10-10',
    );
    expect(entry.schedule).toBeUndefined();
  });
});

describe('sharesOf', () => {
  it('is empty for a vial nobody else holds', () => {
    expect(sharesOf(vial())).toEqual([]);
    expect(isShared(vial())).toBe(false);
  });

  it('is sanitised, so raw stored data is safe to read', () => {
    const raw = vial({
      shares: [{ ownerId: 'ana', from: '2026-10-20', doseAmount: -1 } as VialShare],
    });
    expect(sharesOf(raw)).toEqual([{ ownerId: 'ana', from: '2026-10-20' }]);
    expect(isShared(raw)).toBe(true);
  });
});

describe('participantIds', () => {
  it('names the owner first, then everyone sharing it', () => {
    const shared = vial({ shares: [share(), share({ ownerId: 'tom' })] });
    expect(participantIds(shared)).toEqual(['me', 'ana', 'tom']);
  });

  it('is just the owner when nobody else draws from it', () => {
    expect(participantIds(vial())).toEqual(['me']);
  });
});

describe('shareFor', () => {
  it('finds one person’s row, and nobody else’s', () => {
    const shared = vial({ shares: [share()] });
    expect(shareFor(shared, 'ana')?.from).toBe('2026-10-20');
    // The owner has no share of their own bottle, and a stranger has none either.
    expect(shareFor(shared, 'me')).toBeNull();
    expect(shareFor(shared, 'stranger')).toBeNull();
  });
});

describe('shareDose and shareDoseUnit', () => {
  it('falls back to the vial’s own dose', () => {
    expect(shareDose(vial(), null)).toBe(250);
    expect(shareDoseUnit(vial(), null)).toBe('mcg');
    expect(shareDose(vial(), share())).toBe(250);
    expect(shareDoseUnit(vial(), share())).toBe('mcg');
  });

  it('prefers the person’s own dose when they have one', () => {
    const entry = share({ doseAmount: 500, doseUnit: 'mcg' });
    expect(shareDose(vial(), entry)).toBe(500);
    expect(shareDoseUnit(vial(), entry)).toBe('mcg');
  });
});

describe('shareSchedule', () => {
  it('uses the owner’s plan for the owner', () => {
    expect(shareSchedule(vial(), null)?.startsOn).toBe('2026-10-10');
  });

  it('re-anchors the owner’s cadence to the day a sharer joined', () => {
    const plan = shareSchedule(vial(), share());
    expect(plan?.repeat).toBe('daily');
    expect(plan?.times).toEqual(['09:00']);
    // Same cadence, their own first day — the whole point of a start date.
    expect(plan?.startsOn).toBe('2026-10-20');
  });

  it('prefers their own plan when they set one', () => {
    const entry = share({ schedule: { ...daily('2026-10-20'), times: ['20:00'] } });
    expect(shareSchedule(vial(), entry)?.times).toEqual(['20:00']);
  });

  it('has nothing to say when the vial has no plan at all', () => {
    expect(shareSchedule(vial({ schedule: undefined }), share())).toBeUndefined();
  });
});

describe('viewVial', () => {
  it('gives the owner the vial itself, untouched', () => {
    const owned = vial();
    expect(viewVial(owned, 'me')).toBe(owned);
  });

  it('gives a stranger the vial too — they simply are not on it', () => {
    const owned = vial({ shares: [share()] });
    expect(viewVial(owned, 'nobody')).toBe(owned);
  });

  it('resolves a sharer’s dose and cadence, and leaves the bottle itself alone', () => {
    const owned = {
      ...vial({
        shares: [
          share({
            doseAmount: 500,
            doseUnit: 'mcg',
            schedule: { ...daily('2026-10-20'), times: ['20:00'] },
          }),
        ],
      }),
      // The physical half of a real vial, which a sharer's view must not touch.
      name: 'BPC-157',
      vialAmount: 5,
      waterMl: 2,
    };

    const view = viewVial(owned, 'ana');
    expect(view.doseAmount).toBe(500);
    expect(view.doseUnit).toBe('mcg');
    expect(view.schedule?.times).toEqual(['20:00']);
    expect(view.schedule?.startsOn).toBe('2026-10-20');
    // The bottle is the same bottle: mixed once, one strength, one price.
    expect(view.name).toBe('BPC-157');
    expect(view.vialAmount).toBe(5);
    expect(view.waterMl).toBe(2);
    expect(view.reconstitutedOn).toBe('2026-10-10');
    expect(view.ownerId).toBe('me');
    expect(view.shares).toBe(owned.shares);
  });

  it('keeps the owner’s dose for a sharer who follows the same plan', () => {
    const view = viewVial(vial({ shares: [share()] }), 'ana');
    expect(view.doseAmount).toBe(250);
    expect(view.schedule?.startsOn).toBe('2026-10-20');
  });
});

describe('makeShare', () => {
  const base = { ownerId: 'ana', from: '2026-10-20', reconstitutedOn: '2026-10-10' };

  it('stores only the start date when the plan is the same as the owner’s', () => {
    // Copying the owner's dose here would freeze it; leaving it out means a later
    // change to the owner's plan carries the sharer with it.
    expect(makeShare({ ...base, samePlan: true })).toEqual({ ownerId: 'ana', from: '2026-10-20' });
  });

  it('stores their own dose and cadence when they have one', () => {
    const entry = makeShare({
      ...base,
      samePlan: false,
      doseAmount: 500,
      doseUnit: 'mcg',
      schedule: daily('2026-10-20'),
    });
    expect(entry.doseAmount).toBe(500);
    expect(entry.doseUnit).toBe('mcg');
    expect(entry.schedule?.startsOn).toBe('2026-10-20');
  });

  it('clamps the start date to the day the vial was mixed', () => {
    expect(makeShare({ ...base, from: '2026-09-01', samePlan: true }).from).toBe('2026-10-10');
  });

  it('ignores an unusable dose but still keeps the cadence', () => {
    const entry = makeShare({
      ...base,
      samePlan: false,
      doseAmount: 0,
      schedule: daily('2026-10-20'),
    });
    expect(entry.doseAmount).toBeUndefined();
    expect(entry.schedule).toBeDefined();
  });
});
