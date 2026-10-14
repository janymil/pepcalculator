/**
 * Saved vials → what the reminders API is sent.
 *
 * Pure: no React, no DOM, no fetch. The one thing it must get right is the
 * number the user draws, and it does **not** work that out for itself. It asks
 * `drawOn` in `lib/today.ts` — the same function behind the Today card and the
 * calculator — so a reminder can never quote a number the calculator never
 * showed. That is the one failure this feature cannot survive.
 */

import type { Strings } from '../i18n/types';
import { fmt } from './format';
import { phaseWindows } from './schedule';
import { drawOn } from './today';
import type { SavedVial } from './vials';
import { ruleFromSchedule, type WhatsappDose, type WhatsappPlan } from './whatsapp';

/**
 * What to take, and what to draw, in words — for one vial on one date.
 *
 * Returns `draw: ''` rather than a number when it cannot be worked out: a vial
 * with no concentration yet has nothing to draw from, and "0 units" on a dose
 * line is worse than saying nothing at all.
 */
function wordsFor(
  vial: SavedVial,
  date: string,
  nowIso: string,
  strings: Strings,
): { dose: string; draw: string } {
  const draw = drawOn(vial, date, nowIso);
  const dose = `${draw.doseAmount} ${vial.doseUnit}`;

  if (!(draw.drawValue > 0)) return { dose, draw: '' };

  // The three ways a draw is read, each with the app's own word for it.
  const byClicks = draw.measure === 'clicks';
  const byVolume = draw.measure === 'volume';
  const value = byClicks
    ? fmt.count(draw.drawValue)
    : byVolume
      ? fmt.volume(draw.drawValue)
      : fmt.units(draw.drawValue);
  const word = byClicks
    ? strings.results.clicksWord
    : byVolume
      ? strings.units.ml
      : strings.results.unitsWord;
  const label = byClicks
    ? strings.results.drawClicksLabel
    : byVolume
      ? strings.results.drawVolumeLabel
      : strings.results.drawUnitsLabel;

  return { dose, draw: `${label} ${value} ${word}` };
}

/**
 * The doses this plan will use, as the dates each applies from.
 *
 * A step-up plan changes dose partway through, and the reminder keeps arriving
 * whether or not the app is opened again. Sending today's number alone would
 * quote the starting dose for the rest of the plan — which in month two is
 * simply the wrong amount. So the whole timeline goes, and the server picks the
 * row for the day it is sending.
 */
function dosesFor(vial: SavedVial, todayIso: string, strings: Strings): WhatsappDose[] {
  const schedule = vial.schedule;
  if (!schedule) return [];

  const windows = phaseWindows(schedule);
  if (windows.length === 0) {
    return [{ from: schedule.startsOn, ...wordsFor(vial, todayIso, todayIso, strings) }];
  }

  return windows.map((window) => ({
    from: window.start,
    ...wordsFor(vial, window.start, todayIso, strings),
  }));
}

/**
 * Every vial with a schedule, as a plan to push.
 *
 * One plan per vial, not one per device: each carries its own rule, its own
 * timeline and the person it is for, so the server can work out a day's doses
 * for everybody and divide the message by person. Vials with no schedule are
 * skipped — there is nothing to be reminded about.
 *
 * `personNameOf` is injected rather than importing the owners module, so this
 * stays a pure function of what it is handed.
 */
export function whatsappPlansFrom(
  vials: SavedVial[],
  options: {
    /** The local date, `yyyy-mm-dd`. Concentrations are read as of today. */
    todayIso: string;
    strings: Strings;
    /** The display name of the person a vial belongs to; '' when unnamed. */
    personNameOf: (vial: SavedVial) => string;
  },
): WhatsappPlan[] {
  const plans: WhatsappPlan[] = [];

  for (const vial of vials) {
    if (!vial.schedule) continue;
    plans.push({
      id: vial.id,
      label: vial.name.trim() || options.strings.vials.untitled,
      person: options.personNameOf(vial).trim(),
      doses: dosesFor(vial, options.todayIso, options.strings),
      rule: ruleFromSchedule(vial.schedule),
    });
  }

  return plans;
}
