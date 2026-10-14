import { describe, expect, it } from 'vitest';
import { DICTIONARIES } from '../i18n';
import type { VialSchedule } from './schedule';
import type { SavedVial } from './vials';
import { whatsappPlansFrom } from './whatsappPlan';

const strings = DICTIONARIES.en;
const TODAY = '2024-01-01';

function schedule(overrides: Partial<VialSchedule> = {}): VialSchedule {
  return {
    times: ['09:00'],
    repeat: 'daily',
    weekdays: [],
    startsOn: TODAY,
    durationValue: 4,
    durationUnit: 'weeks',
    ...overrides,
  };
}

/** 5 mg in 2 mL, so 2.5 mg/mL — and 250 mcg is 10 units on a U100 syringe. */
function peptide(overrides: Partial<SavedVial> = {}): SavedVial {
  return {
    id: 'p1',
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

const build = (vials: SavedVial[], personNameOf: (vial: SavedVial) => string = () => '') =>
  whatsappPlansFrom(vials, { todayIso: TODAY, strings, personNameOf });

describe('whatsappPlansFrom', () => {
  it('turns a vial into the plan the server stores', () => {
    const [plan] = build([peptide()]);
    expect(plan.id).toBe('p1');
    expect(plan.label).toBe('BPC-157');
    expect(plan.rule).toEqual({
      times: ['09:00'],
      repeat: 'daily',
      weekdays: [],
      intervalDays: 0,
      startsOn: TODAY,
      durationValue: 4,
      durationUnit: 'weeks',
    });
    expect(plan.doses).toEqual([
      { from: TODAY, dose: '250 mcg', draw: 'Draw to 10 units' },
    ]);
  });

  it('skips a vial with no schedule, because there is nothing to remind about', () => {
    expect(build([peptide({ schedule: undefined })])).toEqual([]);
  });

  it('names the person a vial belongs to, so a digest can divide by them', () => {
    const [plan] = build([peptide()], () => 'Ana');
    expect(plan.person).toBe('Ana');
  });

  it('names an unnamed vial rather than sending a blank line', () => {
    const [plan] = build([peptide({ name: '   ' })]);
    expect(plan.label).toBe(strings.vials.untitled);
  });

  it('leaves the draw out when there is nothing to work it from', () => {
    // No water means no concentration, so no number can be read off a syringe.
    // A missing draw is fine; an invented one is not.
    const [plan] = build([peptide({ waterMl: 0 })]);
    expect(plan.doses[0].dose).toBe('250 mcg');
    expect(plan.doses[0].draw).toBe('');
  });

  /*
   * The reason the whole timeline travels. A step-up plan changes dose partway
   * through, and the reminder goes on arriving whether or not the app is ever
   * opened again — so quoting one dose for the whole plan would be wrong from
   * the second week onward.
   */
  it('sends every step of a titration, with the dose and draw for each', () => {
    const titrated = peptide({
      schedule: schedule({
        phases: [
          { days: 7, doseAmount: 250 },
          { days: 0, doseAmount: 500 },
        ],
      }),
    });

    const [plan] = build([titrated]);
    expect(plan.doses).toEqual([
      { from: '2024-01-01', dose: '250 mcg', draw: 'Draw to 10 units' },
      { from: '2024-01-08', dose: '500 mcg', draw: 'Draw to 20 units' },
    ]);
  });

  it('keeps one plan per vial, not one per device', () => {
    const plans = build([peptide(), peptide({ id: 'p2', name: 'TB-500' })]);
    expect(plans.map((plan) => plan.label)).toEqual(['BPC-157', 'TB-500']);
  });

});
