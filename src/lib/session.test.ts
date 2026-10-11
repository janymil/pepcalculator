import { describe, expect, it } from 'vitest';
import type { VialSchedule } from './schedule';
import { groupSessions, nextSession, sessionsOnDate } from './session';
import type { TodayDose } from './today';
import type { SavedVial } from './vials';

const TODAY = '2026-01-05';

function schedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['21:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: TODAY,
    durationValue: 4,
    durationUnit: 'weeks',
    ...overrides,
  };
}

/** 5 mg in 2 mL: 2.5 mg/mL, so a 250 mcg dose is 10 units on a U-100 syringe. */
function vial(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'v1',
    name: 'BPC-157',
    kind: 'peptide',
    reconstitutedOn: TODAY,
    vialAmount: 5,
    vialUnit: 'mg',
    waterMl: 2,
    doseAmount: 250,
    doseUnit: 'mcg',
    dosesTaken: 0,
    syringeType: 'U100',
    syringeCapacityMl: 1,
    schedule: schedule(),
    ...overrides,
  };
}

/** A hand-made dose, for testing the grouping without a schedule in the way. */
function dose(overrides: Partial<TodayDose> = {}): TodayDose {
  return {
    vialId: 'v1',
    name: 'BPC-157',
    kind: 'peptide',
    measure: 'insulin',
    date: TODAY,
    time: '21:00',
    volumeMl: 0.1,
    drawValue: 10,
    taken: false,
    vial: vial(),
    ...overrides,
  };
}

describe('groupSessions', () => {
  it('puts two vials taken at the same time into one sitting', () => {
    const sessions = groupSessions([
      dose({ vialId: 'a', time: '21:00' }),
      dose({ vialId: 'b', time: '21:00' }),
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0].combined).toBe(true);
    expect(sessions[0].items.map((item) => item.vialId)).toEqual(['a', 'b']);
  });

  it('keeps different times apart, and orders them', () => {
    const sessions = groupSessions([
      dose({ vialId: 'a', time: '21:00' }),
      dose({ vialId: 'b', time: '07:30' }),
    ]);

    expect(sessions.map((session) => session.time)).toEqual(['07:30', '21:00']);
    expect(sessions.every((session) => !session.combined)).toBe(true);
  });

  it('never puts one vial into a sitting twice', () => {
    // Two entries for the same bottle would read as "draw it twice".
    const sessions = groupSessions([
      dose({ vialId: 'a', time: '21:00' }),
      dose({ vialId: 'a', time: '21:00' }),
    ]);

    expect(sessions[0].items).toHaveLength(1);
    expect(sessions[0].combined).toBe(false);
  });

  it('lets one vial be two doses a day, in two sittings', () => {
    const sessions = groupSessions([
      dose({ vialId: 'a', time: '08:00' }),
      dose({ vialId: 'a', time: '20:00' }),
    ]);

    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.items.length === 1)).toBe(true);
  });
});

describe('sessionsOnDate', () => {
  it('groups the vials planned at the same time on the same day', () => {
    const sessions = sessionsOnDate(
      [
        vial({ id: 'a', name: 'BPC-157' }),
        vial({ id: 'b', name: 'TB-500', doseAmount: 2, doseUnit: 'mg', vialAmount: 10 }),
      ],
      TODAY,
      TODAY,
      '20:00',
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0].items.map((item) => item.name)).toEqual(['BPC-157', 'TB-500']);
  });

  it("carries each vial's own draw into the sitting", () => {
    const sessions = sessionsOnDate(
      [
        vial({ id: 'a' }),
        vial({ id: 'o', name: 'Test E', kind: 'anabolic', concentrationMgPerMl: 250, vialMl: 10, doseAmount: 250, doseUnit: 'mg' }),
      ],
      TODAY,
      TODAY,
      '20:00',
    );

    const [peptide, oil] = sessions[0].items;
    expect([peptide.measure, peptide.drawValue]).toEqual(['insulin', 10]);
    expect([oil.measure, oil.drawValue]).toEqual(['volume', 1]);
  });

  it('marks the sitting as taken once its time has passed', () => {
    const before = sessionsOnDate([vial()], TODAY, TODAY, '20:00');
    const after = sessionsOnDate([vial()], TODAY, TODAY, '22:00');

    expect(before[0].dose.taken).toBe(false);
    expect(after[0].dose.taken).toBe(true);
  });
});

describe('nextSession', () => {
  it('returns the whole sitting, not just its first dose', () => {
    const session = nextSession(
      [vial({ id: 'a' }), vial({ id: 'b', name: 'TB-500' })],
      TODAY,
      '20:00',
    );

    expect(session?.combined).toBe(true);
    expect(session?.items).toHaveLength(2);
  });

  it('looks past today when everything today is done', () => {
    const session = nextSession([vial()], TODAY, '23:00', 7);

    expect(session?.date).toBe('2026-01-06');
  });

  it('gives nothing back when there is no plan at all', () => {
    expect(nextSession([vial({ schedule: undefined })], TODAY, '20:00')).toBeNull();
  });
});
