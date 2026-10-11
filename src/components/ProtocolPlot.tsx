import { useState } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { toBase } from '../lib/calc';
import { fmt } from '../lib/format';
import { matchCompound } from '../lib/reference';
import { dosesPerWeek, phaseDoseOn } from '../lib/schedule';
import { liveVials, vialStatus, type SavedVial } from '../lib/vials';
import { PK_CHART_HOURS, PkChart } from './PkChart';

interface ProtocolPlotProps {
  vials: SavedVial[];
  todayIso: string;
}

/**
 * Plots the user's **own** plan: the dose they actually take, on the cadence they
 * actually take it, against the half-life cited for the compound the vial is
 * named after.
 *
 * It is deliberately picky about what it will draw. A curve needs a dose in mg, a
 * cadence, and a half-life; without all three there is nothing honest to plot, so
 * it explains what is missing instead of drawing a guess.
 */
export function ProtocolPlot({ vials, todayIso }: ProtocolPlotProps) {
  const { strings } = useI18n();
  const copy = strings.plot;

  const plottable = liveVials(vials).filter(
    (vial) =>
      vial.schedule !== undefined &&
      // The model is in mg, so an IU-dosed hormone has nothing to plot.
      vial.vialUnit !== 'IU' &&
      vial.doseUnit !== 'IU' &&
      matchCompound(vial.name) !== null,
  );

  const [selectedId, setSelectedId] = useState(plottable[0]?.id ?? '');
  const vial = plottable.find((entry) => entry.id === selectedId) ?? plottable[0] ?? null;

  if (!vial || !vial.schedule) {
    return (
      <div className="plot">
        <p className="plot__title">{copy.title}</p>
        <p className="plot__subtitle">{copy.empty}</p>
      </div>
    );
  }

  const compound = matchCompound(vial.name);
  const schedule = vial.schedule;
  const status = vialStatus(vial, todayIso);

  // A step-up plan is plotted at the step the user is actually in.
  const phased = phaseDoseOn(schedule, todayIso);
  const doseMg = toBase(phased ?? vial.doseAmount, vial.doseUnit);

  // Cadence → hours between doses. `dosesPerWeek` already averages interval
  // schedules the right way (E3D is 7/3 a week, not 3).
  const perWeek = dosesPerWeek(schedule);
  const intervalHours = perWeek > 0 ? 168 / perWeek : 24;
  const doses = Math.max(2, Math.ceil(PK_CHART_HOURS / Math.max(intervalHours, 1)));

  return (
    <div className="plot">
      <p className="plot__title">{copy.title}</p>
      <p className="plot__subtitle">{copy.subtitle}</p>

      {plottable.length > 1 ? (
        <label className="plot__picker">
          <span className="field__label">{copy.choose}</span>
          <select
            className="field__input plot__select"
            value={vial.id}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {plottable.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name || strings.vials.untitled}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <p className="plot__facts">
        <strong>{compound?.name}</strong> · {fmt.mass(doseMg)} {strings.units.mg} ·{' '}
        {fmt.count(perWeek)}× {copy.perWeek} · {copy.halfLife} {compound?.halfLifeHours}{' '}
        {strings.reference.halfLifeUnit}
      </p>

      <PkChart
        schedule={{
          doseMg,
          intervalHours,
          halfLifeHours: compound?.halfLifeHours ?? 0,
          doses,
        }}
        ariaLabel={copy.title}
      />

      {phased !== null ? <p className="plot__note">{copy.titration}</p> : null}
      <p className="ref__note">{copy.note}</p>
      <p className="plot__note">
        {copy.strength}: {fmt.concentration(status.concentrationPerMl)} {strings.units.mg}/
        {strings.units.ml}
      </p>
    </div>
  );
}
