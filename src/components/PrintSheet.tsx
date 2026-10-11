import { LOCALES, interpolate } from '../i18n';
import type { RoutineCopy, Strings } from '../i18n/types';
import { useI18n } from '../i18n/I18nContext';
import { unitsPerMlOf } from '../lib/calc';
import { fmt, formatDate, weekdayShort } from '../lib/format';
import { toBase } from '../lib/calc';
import {
  intervalOf,
  intervalPresetId,
  normalizeTimes,
  phaseWindows,
  planEndDate,
  totalPlannedDoses,
  vialsNeeded,
  type IntervalPresetId,
  type VialSchedule,
} from '../lib/schedule';
import { kindMeasure, vialKind, vialStatus, type SavedVial } from '../lib/vials';

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

  /*
   * A step-up plan gets **one row per step**, each with its own dose and dates.
   * Printing a single "draw to X" line for a titration would be actively
   * misleading — this sheet ends up taped to a fridge.
   */
  const rows = planned.flatMap((vial) => {
    const schedule = vial.schedule as VialSchedule;
    const windows = phaseWindows(schedule);
    if (windows.length === 0) {
      return [
        {
          key: vial.id,
          vial,
          dose: vial.doseAmount,
          start: schedule.startsOn,
          end: planEndDate(schedule),
        },
      ];
    }
    return windows.map((window, index) => ({
      key: `${vial.id}-${index}`,
      vial,
      dose: window.phase.doseAmount,
      start: window.start,
      end: window.end,
    }));
  });

  /*
   * The routines are printed for the route actually in use: a pen user gets the
   * pen steps, a vial user the vial steps, and a household with both gets both.
   * The check list is identical either way, so it is printed once.
   */
  const glp1 = planned.filter((vial) => vialKind(vial) === 'glp1');
  const routines: RoutineCopy[] = [];
  if (glp1.some((vial) => vial.device === 'pen')) routines.push(strings.glp1.routine.pen);
  if (glp1.some((vial) => vial.device !== 'pen')) routines.push(strings.glp1.routine.vial);

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
          {rows.map((row) => (
            <PlanRow
              key={row.key}
              vial={row.vial}
              dose={row.dose}
              start={row.start}
              end={row.end}
              todayIso={todayIso}
            />
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

      {/*
        A checklist belongs on the fridge, and this class is used at home with no
        clinician in the room. Printed only when one of the plans is a GLP-1 vial
        — on any other sheet it would be noise.
      */}
      {glp1.length > 0 ? (
        <section className="print-sheet__glp1">
          <h2 className="print-sheet__subtitle">{copy.glp1Title}</h2>
          <p className="print-sheet__glp1-note">{copy.glp1Hint}</p>

          <div className="print-sheet__cols">
            {routines.map((routine) => (
              <div className="print-sheet__col" key={routine.title}>
                <h3 className="print-sheet__h3">{routine.title}</h3>
                <ol className="print-sheet__steps">
                  {routine.steps.map((step, index) => (
                    <li key={`${step.title}-${index}`}>
                      <span className="print-sheet__num">{index + 1}</span>
                      {step.title}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <h3 className="print-sheet__h3">{strings.glp1.checks.title}</h3>
          <ul className="print-sheet__checks">
            {strings.glp1.checks.items.map((item, index) => (
              <li key={`${item.title}-${index}`}>
                <span className="print-sheet__box" aria-hidden="true" />
                {item.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="print-sheet__note">{strings.disclaimer.body}</p>
    </section>
  );
}

/** One row of the protocol table: one step of one plan. */
function PlanRow({
  vial,
  dose,
  start,
  end,
  todayIso,
}: {
  vial: SavedVial;
  /** The dose in force for this row, in the vial's own dose unit. */
  dose: number;
  start: string;
  end: string | null;
  todayIso: string;
}) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];

  const status = vialStatus(vial, todayIso);
  // A pen dials; peptides read in graduations; everything else in mL.
  const measure = kindMeasure(vialKind(vial), vial.device);
  const volumeMl =
    status.concentrationPerMl > 0 ? toBase(dose, vial.doseUnit) / status.concentrationPerMl : 0;
  const draw =
    measure === 'clicks'
      ? `${fmt.count(volumeMl * (vial.clicksPerMl ?? 0))} ${strings.results.clicksWord}`
      : measure === 'volume'
        ? `${fmt.volume(volumeMl)} ${strings.units.ml}`
        : `${fmt.units(volumeMl * unitsPerMlOf(vial.syringeType))} ${strings.results.unitsWord}`;

  const plannedDoses = totalPlannedDoses(vial.schedule as VialSchedule);

  return (
    <tr>
      <td>{vial.name || strings.vials.untitled}</td>
      <td>{draw}</td>
      <td>{normalizeTimes((vial.schedule as VialSchedule).times).join(', ')}</td>
      <td>{repeatLabel(vial.schedule as VialSchedule, strings, locale)}</td>
      <td>
        {formatDate(start, locale)}
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
  const byVolume = kindMeasure(vialKind(vial)) === 'volume';

  return (
    <li className="print-label">
      <p className="print-label__name">{vial.name || strings.vials.untitled}</p>
      <p className="print-label__ratio">
        {anabolic
          ? `${fmt.concentration(status.concentrationPerMl)} mg/${strings.units.ml}`
          : interpolate(copy.labelRatio, {
              amount: `${fmt.mass(vial.vialAmount)} ${vial.vialUnit}`,
              water: fmt.volume(vial.waterMl),
            })}
      </p>
      <p className="print-label__draw">
        {byVolume
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
