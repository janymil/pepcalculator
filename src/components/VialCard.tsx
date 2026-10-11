import { useState } from 'react';
import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { unitsPerMlOf } from '../lib/calc';
import { costPerDose, costPerMonth, planCost } from '../lib/cost';
import { addDays } from '../lib/dates';
import { fmt, formatDate, formatMoney } from '../lib/format';
import {
  dosesPerWeek,
  elapsedDoses,
  nextDose,
  planEndDate,
  totalPlannedDoses,
  vialsNeeded,
  type DoseSlot,
} from '../lib/schedule';
import type { VialSupply } from '../lib/supply';
import { formatRange, matchCompound, rangeHint, type RangeVerdict } from '../lib/reference';
import { vialKind, vialStatus, type SavedVial } from '../lib/vials';
import { vialColor } from '../lib/vialColors';
import { DoseCalendar } from './DoseCalendar';
import { Icon } from './Icon';

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
  /** The supply projection for this vial, when the page has already built one. */
  supply?: VialSupply;
  /**
   * True when another live vial carries the same name but a different
   * concentration — the single most dangerous mix-up, so the card says so.
   */
  ratioMismatch?: boolean;
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
  supply,
  ratioMismatch,
}: VialCardProps) {
  const { strings } = useI18n();
  // The card is a scannable summary by default; the detail expands on demand.
  const [expanded, setExpanded] = useState(false);
  const status = vialStatus(vial, todayIso);
  const schedule = vial.schedule;
  const anabolic = vialKind(vial) === 'anabolic';
  const color = vialColor(vial.id);

  /** The single most important number: insulin units (peptides) or mL (oils). */
  const unitsPerDose = status.volumePerDoseMl * unitsPerMlOf(vial.syringeType);

  // Oils have no 28-day BUD, so `daysUntilExpiry` is null for them.
  const expiryDays = status.daysUntilExpiry;
  const badgeTone =
    expiryDays === null ? 'ok' : status.isExpired ? 'expired' : expiryDays <= 3 ? 'soon' : 'ok';
  const badgeText =
    expiryDays === null
      ? strings.vials.noExpiry
      : status.isExpired
        ? interpolate(strings.vials.expired, { days: Math.abs(expiryDays) })
        : expiryDays === 0
          ? strings.vials.lastDay
          : interpolate(strings.vials.daysLeft, { days: expiryDays });

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

  // Optional cost figures — only shown when the user entered a vial price.
  const costPerDoseValue = costPerDose(vial.price, status.totalDoses);
  const planCostValue = planCost(vial.price, plannedTotal, status.totalDoses);
  // What the protocol costs each month, so a cheap vial that needs three a month
  // does not look cheaper than an expensive one that lasts.
  const perMonth = schedule ? costPerMonth(costPerDoseValue, dosesPerWeek(schedule)) : null;

  /*
   * Context, never advice: if the vial's name matches a compound in the
   * reference list, say where this dose sits against the range people commonly
   * discuss. Only shown when it falls outside — matching the range is not worth
   * a line of its own.
   */
  const compound = matchCompound(vial.name);
  const verdict = compound ? rangeHint(compound, status.doseMg) : null;
  const outOfRange: Exclude<RangeVerdict, 'within'> | null =
    verdict && verdict !== 'within' ? verdict : null;

  const dayLabel = (slot: DoseSlot): string => {
    if (slot.date === todayIso) return strings.schedule.today;
    if (slot.date === addDays(todayIso, 1)) return strings.schedule.tomorrow;
    return formatDate(slot.date, locale);
  };

  const barPercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <li className="vial">
      <div className="vial__head">
        <h3 className="vial__name">
          <span className="vial__dot" style={{ backgroundColor: color }} aria-hidden="true" />
          {vial.name || strings.vials.untitled}
        </h3>
        <span className={`vial__kind vial__kind--${anabolic ? 'anabolic' : 'peptide'}`}>
          {anabolic ? strings.kinds.anabolic : strings.kinds.peptide}
        </span>
        <span className={`vial__badge vial__badge--${badgeTone}`}>{badgeText}</span>
        <button
          type="button"
          className="vial__toggle"
          aria-expanded={expanded}
          aria-label={strings.vials.details}
          onClick={() => setExpanded((value) => !value)}
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="vial__draw">
        <span className="vial__draw-label">{strings.schedule.draw}</span>
        <span className="vial__draw-value">
          {anabolic ? (
            <>
              {fmt.volume(status.volumePerDoseMl)} <small>{strings.units.ml}</small>
            </>
          ) : (
            <>
              {fmt.units(unitsPerDose)} <small>{strings.results.unitsWord}</small>
            </>
          )}
        </span>
        {anabolic ? null : (
          <span className="vial__draw-sub">
            {fmt.volume(status.volumePerDoseMl)} {strings.units.ml}
          </span>
        )}
      </div>

      {expanded ? (
        <div className="vial__body">
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
        {costPerDoseValue !== null ? (
          <div className="vial__stat">
            <dt>{strings.vials.costPerDose}</dt>
            <dd>{formatMoney(costPerDoseValue, locale, vial.currency)}</dd>
          </div>
        ) : null}
        {planCostValue !== null ? (
          <div className="vial__stat">
            <dt>{strings.vials.planCost}</dt>
            <dd>{formatMoney(planCostValue, locale, vial.currency)}</dd>
          </div>
        ) : null}
        {perMonth !== null ? (
          <div className="vial__stat">
            <dt>{strings.vials.costPerMonth}</dt>
            <dd>{formatMoney(perMonth, locale, vial.currency)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="vial__meta">
        {anabolic
          ? `${strings.vials.dateLabelAnabolic}: ${formatDate(vial.reconstitutedOn, locale)}`
          : interpolate(strings.vials.reconstitutedOn, {
              date: formatDate(vial.reconstitutedOn, locale),
            })}
        {' · '}
        {status.expiresOn
          ? interpolate(strings.vials.useBy, { date: formatDate(status.expiresOn, locale) })
          : strings.vials.noExpiry}
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

      {ratioMismatch ? (
        <p className="vial__note vial__note--warn">{strings.vials.ratioMismatch}</p>
      ) : null}

      {outOfRange && compound ? (
        <p className="vial__note vial__note--info">
          {strings.reference.range.label}: {strings.reference.range[outOfRange]} ·{' '}
          {strings.reference.typical} {formatRange(compound)}
        </p>
      ) : null}

      {supply && supply.runOutOn ? (
        <p className="vial__note">
          {interpolate(strings.supply.runsOutOn, { date: formatDate(supply.runOutOn, locale) })}
          {supply.daysOfSupply !== null
            ? ` · ${interpolate(strings.supply.daysOfSupply, { days: supply.daysOfSupply })}`
            : ''}
        </p>
      ) : null}

      {supply && supply.expiresWithDosesLeft && supply.expiresOn ? (
        <p className="vial__note vial__note--warn">
          {interpolate(strings.supply.dosesAtRisk, {
            date: formatDate(supply.expiresOn, locale),
            doses: Math.round(supply.dosesAtRisk),
          })}
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
        </div>
      ) : null}
    </li>
  );
}

/** Doses still to come, or null when the plan has no end (or no doses). */
function dosesLeftFor(plannedTotal: number | null, dosesDone: number): number | null {
  if (plannedTotal === null) return null;
  return Math.max(0, plannedTotal - dosesDone);
}
