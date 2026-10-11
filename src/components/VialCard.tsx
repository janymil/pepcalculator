import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { unitsPerMlOf } from '../lib/calc';
import { addDays } from '../lib/dates';
import { fmt, formatDate } from '../lib/format';
import {
  elapsedDoses,
  nextDose,
  planEndDate,
  totalPlannedDoses,
  vialsNeeded,
  type DoseSlot,
} from '../lib/schedule';
import { vialStatus, type SavedVial } from '../lib/vials';
import { DoseCalendar } from './DoseCalendar';

export interface VialCardProps {
  vial: SavedVial;
  locale: string;
  todayIso: string;
  nowTime: string;
  onLoad: (vial: SavedVial) => void;
  onEdit: (vial: SavedVial) => void;
  onAddDose: (id: string) => void;
  onRemoveDose: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * One saved vial.
 *
 * The headline is always "draw X units", so the reconstitution ratio never has
 * to be remembered. Everything about progress is derived from the schedule, so
 * there is nothing to log after an injection.
 */
export function VialCard({
  vial,
  locale,
  todayIso,
  nowTime,
  onLoad,
  onEdit,
  onAddDose,
  onRemoveDose,
  onDelete,
}: VialCardProps) {
  const { strings } = useI18n();
  const status = vialStatus(vial, todayIso);
  const schedule = vial.schedule;

  /** The single most important number: the units this dose needs. */
  const unitsPerDose = status.volumePerDoseMl * unitsPerMlOf(vial.syringeType);

  const badgeTone = status.isExpired ? 'expired' : status.daysUntilExpiry <= 3 ? 'soon' : 'ok';
  const badgeText = status.isExpired
    ? interpolate(strings.vials.expired, { days: Math.abs(status.daysUntilExpiry) })
    : status.daysUntilExpiry === 0
      ? strings.vials.lastDay
      : interpolate(strings.vials.daysLeft, { days: status.daysUntilExpiry });

  // Schedule-driven numbers. `dosesTaken` is only used for vials with no plan.
  const plannedTotal = schedule ? totalPlannedDoses(schedule) : null;
  const dosesDone = schedule ? elapsedDoses(schedule, todayIso, nowTime) : status.dosesTaken;
  const dosesLeft = schedule ? dosesLeftFor(plannedTotal, dosesDone) : status.dosesLeft;
  const percent =
    plannedTotal && plannedTotal > 0
      ? (dosesDone / plannedTotal) * 100
      : schedule
        ? 0
        : status.percentLeft * 100;
  const next = schedule ? nextDose(schedule, todayIso, nowTime) : null;
  const volumeLeftMl = Math.max(0, status.volumeTotalMl - dosesDone * status.volumePerDoseMl);
  const planEnd = schedule ? planEndDate(schedule) : null;
  const vialsForPlan = plannedTotal === null ? 1 : vialsNeeded(plannedTotal, status.totalDoses);

  const dayLabel = (slot: DoseSlot): string => {
    if (slot.date === todayIso) return strings.schedule.today;
    if (slot.date === addDays(todayIso, 1)) return strings.schedule.tomorrow;
    return formatDate(slot.date, locale);
  };

  const barPercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <li className="vial">
      <div className="vial__head">
        <h3 className="vial__name">{vial.name || strings.vials.untitled}</h3>
        <span className={`vial__badge vial__badge--${badgeTone}`}>{badgeText}</span>
      </div>

      <div className="vial__draw">
        <span className="vial__draw-label">{strings.schedule.draw}</span>
        <span className="vial__draw-value">
          {fmt.units(unitsPerDose)} <small>{strings.results.unitsWord}</small>
        </span>
        <span className="vial__draw-sub">
          {fmt.volume(status.volumePerDoseMl)} {strings.units.ml}
        </span>
      </div>

      {next ? (
        <p className="vial__next">
          <span className="vial__next-label">{strings.schedule.nextDose}</span>
          <strong>
            {dayLabel(next)} · {next.time}
          </strong>
        </p>
      ) : null}

      <div
        className="vial__bar"
        role="progressbar"
        aria-label={strings.vials.volumeLeft}
        aria-valuenow={barPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="vial__bar-fill" style={{ width: `${barPercent}%` }} />
      </div>

      <dl className="vial__stats">
        <div className="vial__stat">
          <dt>{strings.schedule.dosesDone}</dt>
          <dd>{fmt.count(dosesDone)}</dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.vials.dosesLeft}</dt>
          <dd>{dosesLeft === null ? strings.results.notApplicable : fmt.count(dosesLeft)}</dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.vials.volumeLeft}</dt>
          <dd>
            {fmt.volume(volumeLeftMl)} {strings.units.ml}
          </dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.results.concentration}</dt>
          <dd>
            {fmt.concentration(status.concentrationMgPerMl)} mg/{strings.units.ml}
          </dd>
        </div>
        <div className="vial__stat">
          <dt>{strings.vials.perDose}</dt>
          <dd>
            {fmt.volume(status.volumePerDoseMl)} {strings.units.ml}
          </dd>
        </div>
      </dl>

      <p className="vial__meta">
        {interpolate(strings.vials.reconstitutedOn, {
          date: formatDate(vial.reconstitutedOn, locale),
        })}
        {' · '}
        {interpolate(strings.vials.useBy, { date: formatDate(status.expiresOn, locale) })}
      </p>

      {schedule ? (
        <p className="vial__meta">
          {planEnd
            ? interpolate(strings.schedule.planEnds, { date: formatDate(planEnd, locale) })
            : strings.schedule.planOngoing}
        </p>
      ) : null}

      {schedule && vialsForPlan > 1 ? (
        <p className="vial__note">
          {interpolate(strings.schedule.needsVials, { count: vialsForPlan })}
        </p>
      ) : null}

      {schedule ? (
        <DoseCalendar schedule={schedule} todayIso={todayIso} nowTime={nowTime} />
      ) : null}

      <div className="vial__actions">
        <button type="button" className="btn btn--sm" onClick={() => onLoad(vial)}>
          {strings.vials.load}
        </button>
        <button type="button" className="btn btn--sm" onClick={() => onEdit(vial)}>
          {strings.edit.title}
        </button>
        {schedule ? null : (
          <>
            <button type="button" className="btn btn--sm" onClick={() => onAddDose(vial.id)}>
              {strings.vials.addDose}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={status.dosesTaken === 0}
              onClick={() => onRemoveDose(vial.id)}
            >
              {strings.vials.removeDose}
            </button>
          </>
        )}
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--danger"
          onClick={() => onDelete(vial.id)}
        >
          {strings.vials.delete}
        </button>
      </div>
    </li>
  );
}

/** Doses still to come, or null when the plan has no end (or no doses). */
function dosesLeftFor(plannedTotal: number | null, dosesDone: number): number | null {
  if (plannedTotal === null) return null;
  return Math.max(0, plannedTotal - dosesDone);
}
