import { LOCALES, interpolate } from '../i18n';
import type { Strings } from '../i18n/types';
import { useI18n } from '../i18n/I18nContext';
import { unitsPerMlOf } from '../lib/calc';
import { fmt, formatDate, weekdayShort } from '../lib/format';
import {
  intervalOf,
  intervalPresetId,
  normalizeTimes,
  planEndDate,
  totalPlannedDoses,
  vialsNeeded,
  type IntervalPresetId,
  type VialSchedule,
} from '../lib/schedule';
import { vialKind, vialStatus, type SavedVial } from '../lib/vials';

interface PrintSheetProps {
  /** Live vials for one person (the scope the rest of the app uses). */
  vials: SavedVial[];
  /** Display name of the selected person, for the "prepared for" line. */
  ownerName: string;
  todayIso: string;
}

const INTERVAL_COPY: Record<IntervalPresetId, keyof Strings['schedule']> = {
  eod: 'intervalEod',
  e3d: 'intervalE3d',
  e4d: 'intervalE4d',
  weekly: 'intervalWeekly',
  biweekly: 'intervalBiweekly',
};

/** "Every other day", "Mon Wed Fri", "Daily" — whatever the plan actually says. */
function repeatLabel(schedule: VialSchedule, strings: Strings, locale: string): string {
  if (schedule.repeat === 'interval') {
    const preset = intervalPresetId(schedule);
    if (preset) return strings.schedule[INTERVAL_COPY[preset]];
    return `${intervalOf(schedule)}`;
  }
  if (schedule.repeat === 'weekdays') {
    if (schedule.weekdays.length === 0) return '';
    return schedule.weekdays.map((day) => weekdayShort(locale, day)).join(' ');
  }
  return strings.schedule.repeatDaily;
}

/**
 * The printable protocol sheet and vial labels.
 *
 * Hidden on screen and only revealed by `@media print` (see `global.css`), so
 * the button on the Calendar page is all the UI needs. Every value comes from
 * the saved plans — nothing is retyped — which means the copy in the fridge
 * cannot disagree with the app.
 */
export function PrintSheet({ vials, ownerName, todayIso }: PrintSheetProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];
  const copy = strings.print;

  const planned = vials.filter((vial) => vial.schedule);
  if (planned.length === 0) return null;

  const totalVials = planned.reduce((sum, vial) => {
    if (!vial.schedule) return sum;
    const plannedDoses = totalPlannedDoses(vial.schedule);
    if (plannedDoses === null) return sum;
    return sum + vialsNeeded(plannedDoses, vialStatus(vial, todayIso).totalDoses);
  }, 0);

  return (
    <section className="print-sheet" aria-hidden="true">
      <header className="print-sheet__head">
        <h1 className="print-sheet__title">{copy.title}</h1>
        <p className="print-sheet__meta">
          {interpolate(copy.forPerson, { name: ownerName })} ·{' '}
          {interpolate(copy.generated, { date: formatDate(todayIso, locale) })}
        </p>
      </header>

      <table className="print-sheet__table">
        <thead>
          <tr>
            <th>{copy.plan}</th>
            <th>{copy.draw}</th>
            <th>{copy.times}</th>
            <th>{copy.days}</th>
            <th>{copy.period}</th>
            <th>{copy.vials}</th>
          </tr>
        </thead>
        <tbody>
          {planned.map((vial) => (
            <PlanRow key={vial.id} vial={vial} todayIso={todayIso} />
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>{copy.vials}</td>
            <td>{totalVials}</td>
          </tr>
        </tfoot>
      </table>

      <h2 className="print-sheet__subtitle">{copy.labels}</h2>
      <ul className="print-sheet__labels">
        {planned.map((vial) => (
          <LabelSticker key={vial.id} vial={vial} todayIso={todayIso} />
        ))}
      </ul>

      <p className="print-sheet__note">{strings.disclaimer.body}</p>
    </section>
  );
}

/** One row of the protocol table. */
function PlanRow({ vial, todayIso }: { vial: SavedVial; todayIso: string }) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];

  const schedule = vial.schedule as VialSchedule;
  const status = vialStatus(vial, todayIso);
  const anabolic = vialKind(vial) === 'anabolic';
  const draw = anabolic
    ? `${fmt.volume(status.volumePerDoseMl)} ${strings.units.ml}`
    : `${fmt.units(status.volumePerDoseMl * unitsPerMlOf(vial.syringeType))} ${
        strings.results.unitsWord
      }`;

  const end = planEndDate(schedule);
  const plannedDoses = totalPlannedDoses(schedule);

  return (
    <tr>
      <td>{vial.name || strings.vials.untitled}</td>
      <td>{draw}</td>
      <td>{normalizeTimes(schedule.times).join(', ')}</td>
      <td>{repeatLabel(schedule, strings, locale)}</td>
      <td>
        {formatDate(schedule.startsOn, locale)}
        {end ? ` – ${formatDate(end, locale)}` : ` · ${strings.schedule.planOngoing}`}
      </td>
      <td>
        {plannedDoses === null
          ? strings.results.notApplicable
          : vialsNeeded(plannedDoses, status.totalDoses)}
      </td>
    </tr>
  );
}

/** A sticker for the vial in the fridge: ratio, draw amount and use-by date. */
function LabelSticker({ vial, todayIso }: { vial: SavedVial; todayIso: string }) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];
  const copy = strings.print;

  const status = vialStatus(vial, todayIso);
  const anabolic = vialKind(vial) === 'anabolic';

  return (
    <li className="print-label">
      <p className="print-label__name">{vial.name || strings.vials.untitled}</p>
      <p className="print-label__ratio">
        {anabolic
          ? `${fmt.concentration(status.concentrationMgPerMl)} mg/${strings.units.ml}`
          : interpolate(copy.labelRatio, {
              amount: `${fmt.mass(vial.vialAmount)} ${vial.vialUnit}`,
              water: fmt.volume(vial.waterMl),
            })}
      </p>
      <p className="print-label__draw">
        {anabolic
          ? `${copy.draw} ${fmt.volume(status.volumePerDoseMl)} ${strings.units.ml}`
          : `${copy.draw} ${fmt.units(
              status.volumePerDoseMl * unitsPerMlOf(vial.syringeType),
            )} ${strings.results.unitsWord}`}
      </p>
      {status.expiresOn ? (
        <p className="print-label__expiry">
          {interpolate(strings.vials.useBy, { date: formatDate(status.expiresOn, locale) })}
        </p>
      ) : null}
    </li>
  );
}
