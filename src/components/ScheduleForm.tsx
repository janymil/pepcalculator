import { LOCALES } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { parseNumber, weekdayShort } from '../lib/format';
import {
  DURATION_PRESETS,
  INTERVAL_PRESETS,
  TIMES_PER_DAY_PRESETS,
  intervalPresetId,
  type DosePhase,
  type IntervalPresetId,
  type VialSchedule,
} from '../lib/schedule';
import { Icon } from './Icon';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

/** Weekday toggles, Monday first. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/** How long a new titration step lasts by default. */
const DEFAULT_PHASE_WEEKS = 4;

interface ScheduleFormProps {
  value: VialSchedule;
  onChange: (next: VialSchedule) => void;
  /**
   * The vial's own dose, used to seed a step-up protocol so the user edits real
   * numbers rather than filling in blanks.
   */
  baseDose?: number;
  /** The vial's dose unit (mg, mcg, IU), shown beside each step's number. */
  doseUnit?: string;
}

/**
 * The "when do you take it?" part of saving a vial: how many times a day, at
 * which times, on which days, and for how long. Everything the app later needs
 * to build the calendar and work out what is left — with no logging.
 */
export function ScheduleForm({ value, onChange, baseDose = 0, doseUnit }: ScheduleFormProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];

  /* ---------- titration ---------- */
  const phases: DosePhase[] = value.phases ?? [];
  const titrationOn = phases.length > 0;
  /** Shown beside each step's dose, so the number is not ambiguous. */
  const doseUnitLabel = doseUnit ?? '';

  /** Turns the step-up protocol on — seeded from the vial's own dose — or off. */
  const toggleTitration = (on: boolean) => {
    if (!on) {
      onChange({ ...value, phases: undefined });
      return;
    }
    const seed = baseDose > 0 ? baseDose : 0;
    onChange({
      ...value,
      phases: [
        { days: DEFAULT_PHASE_WEEKS * 7, doseAmount: seed },
        // Open-ended final step.
        { days: 0, doseAmount: seed },
      ],
    });
  };

  const setPhase = (index: number, patch: Partial<DosePhase>) => {
    onChange({
      ...value,
      phases: phases.map((phase, at) => (at === index ? { ...phase, ...patch } : phase)),
    });
  };

  const addPhase = () => {
    // Insert before the open-ended last step, so the tail stays the tail.
    const next = [...phases];
    next.splice(next.length - 1, 0, {
      days: DEFAULT_PHASE_WEEKS * 7,
      doseAmount: phases[phases.length - 2]?.doseAmount ?? baseDose,
    });
    onChange({ ...value, phases: next });
  };

  const removePhase = (index: number) => {
    onChange({ ...value, phases: phases.filter((_phase, at) => at !== index) });
  };

  const timesOptions: SegmentedOption<number>[] = [1, 2, 3, 4].map((count) => ({
    value: count,
    label: String(count),
  }));

  const repeatOptions: SegmentedOption<VialSchedule['repeat']>[] = [
    { value: 'daily', label: strings.schedule.repeatDaily },
    { value: 'weekdays', label: strings.schedule.repeatWeekdays },
    { value: 'interval', label: strings.schedule.repeatInterval },
  ];

  const intervalLabels: Record<IntervalPresetId, string> = {
    eod: strings.schedule.intervalEod,
    e3d: strings.schedule.intervalE3d,
    e4d: strings.schedule.intervalE4d,
    weekly: strings.schedule.intervalWeekly,
    biweekly: strings.schedule.intervalBiweekly,
  };

  const intervalOptions: SegmentedOption<string>[] = INTERVAL_PRESETS.map((preset) => ({
    value: preset.id,
    label: intervalLabels[preset.id],
  }));

  const currentIntervalId = intervalPresetId(value) ?? 'eod';

  const setInterval = (id: string) => {
    const preset = INTERVAL_PRESETS.find((entry) => entry.id === id) ?? INTERVAL_PRESETS[0];
    onChange({ ...value, intervalDays: preset.days });
  };

  const durationLabels: Record<string, string> = {
    '4w': strings.schedule.duration4w,
    '8w': strings.schedule.duration8w,
    '12w': strings.schedule.duration12w,
    '3m': strings.schedule.duration3m,
    '4m': strings.schedule.duration4m,
    ongoing: strings.schedule.durationOngoing,
  };

  const durationOptions: SegmentedOption<string>[] = DURATION_PRESETS.map((preset) => ({
    value: preset.id,
    label: durationLabels[preset.id],
  }));

  const currentDurationId =
    DURATION_PRESETS.find(
      (preset) => preset.value === value.durationValue && preset.unit === value.durationUnit,
    )?.id ?? 'ongoing';

  const dayCount = value.times.length;

  const setTimesCount = (count: number) => {
    const preset = TIMES_PER_DAY_PRESETS[count] ?? [];
    const times = Array.from(
      { length: count },
      (_, index) => value.times[index] ?? preset[index] ?? '09:00',
    );
    onChange({ ...value, times });
  };

  const setTimeAt = (index: number, time: string) => {
    const times = [...value.times];
    times[index] = time;
    onChange({ ...value, times });
  };

  const toggleWeekday = (weekday: number) => {
    const has = value.weekdays.includes(weekday);
    const weekdays = has
      ? value.weekdays.filter((day) => day !== weekday)
      : [...value.weekdays, weekday].sort((a, b) => a - b);
    onChange({ ...value, weekdays });
  };

  const setDuration = (id: string) => {
    const preset = DURATION_PRESETS.find((entry) => entry.id === id) ?? DURATION_PRESETS[0];
    onChange({ ...value, durationValue: preset.value, durationUnit: preset.unit });
  };

  return (
    <div className="schedule">
      <p className="schedule__title">{strings.schedule.title}</p>

      <div className="field">
        <span className="field__label">{strings.schedule.timesPerDay}</span>
        <div className="schedule__row">
          <SegmentedControl
            ariaLabel={strings.schedule.timesPerDay}
            size="sm"
            options={timesOptions}
            value={dayCount}
            onChange={setTimesCount}
          />
          <div className="schedule__times">
            {value.times.map((time, index) => (
              <input
                key={index}
                className="field__input schedule__time"
                type="time"
                value={time}
                aria-label={strings.schedule.timesPerDay}
                onChange={(event) => setTimeAt(index, event.target.value)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field__label">{strings.schedule.repeat}</span>
        <SegmentedControl
          ariaLabel={strings.schedule.repeat}
          size="sm"
          options={repeatOptions}
          value={value.repeat}
          onChange={(repeat) =>
            onChange({
              ...value,
              repeat,
              // Switching into interval mode needs a usable gap, otherwise the
              // plan would quietly behave like a daily one.
              intervalDays:
                repeat === 'interval' ? (value.intervalDays ?? INTERVAL_PRESETS[0].days) : value.intervalDays,
            })
          }
        />
      </div>

      {value.repeat === 'interval' ? (
        <div className="field">
          <span className="field__label">{strings.schedule.interval}</span>
          <SegmentedControl
            ariaLabel={strings.schedule.interval}
            options={intervalOptions}
            value={currentIntervalId}
            onChange={setInterval}
          />
        </div>
      ) : null}

      {value.repeat === 'weekdays' ? (
        <div className="field">
          <span className="field__label">{strings.schedule.weekdays}</span>
          <div className="weekdays">
            {WEEKDAYS.map((weekday) => {
              const active = value.weekdays.includes(weekday);
              return (
                <button
                  key={weekday}
                  type="button"
                  className={`weekday${active ? ' is-active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleWeekday(weekday)}
                >
                  {weekdayShort(locale, weekday)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="field">
        <span className="field__label">{strings.schedule.duration}</span>
        <SegmentedControl
          ariaLabel={strings.schedule.duration}
          options={durationOptions}
          value={currentDurationId}
          onChange={setDuration}
        />
      </div>

      <div className="field">
        <label className="schedule__toggle">
          <input
            type="checkbox"
            checked={titrationOn}
            onChange={(event) => toggleTitration(event.target.checked)}
          />
          <span className="schedule__toggle-label">{strings.schedule.titration}</span>
        </label>
        {titrationOn ? <p className="field__hint">{strings.schedule.titrationHint}</p> : null}
      </div>

      {titrationOn ? (
        <div className="field">
          <span className="field__label">{strings.vials.phases}</span>
          <div className="schedule__phases">
            {phases.map((phase, index) => {
              // The final step always runs to the end of the plan, so its length
              // is fixed rather than editable.
              const last = index === phases.length - 1;
              return (
                <div className="schedule__phase" key={index}>
                  <input
                    className="field__input schedule__phase-weeks"
                    type="text"
                    inputMode="numeric"
                    value={last ? '' : String(Math.round(phase.days / 7))}
                    disabled={last}
                    placeholder={last ? strings.schedule.planOngoing : '4'}
                    aria-label={`${strings.schedule.phaseWeeks} ${index + 1}`}
                    onChange={(event) =>
                      setPhase(index, { days: parseNumber(event.target.value) * 7 })
                    }
                  />
                  <span className="schedule__phase-unit">{strings.schedule.phaseWeeks}</span>

                  <input
                    className="field__input schedule__phase-dose"
                    type="text"
                    inputMode="decimal"
                    value={phase.doseAmount === 0 ? '' : String(phase.doseAmount)}
                    aria-label={`${strings.schedule.phaseDose} ${index + 1}`}
                    onChange={(event) =>
                      setPhase(index, { doseAmount: parseNumber(event.target.value) })
                    }
                  />
                  <span className="schedule__phase-unit">{doseUnitLabel}</span>

                  <button
                    type="button"
                    className="btn btn--sm btn--ghost schedule__phase-remove"
                    aria-label={strings.schedule.phaseRemove}
                    disabled={phases.length <= 2}
                    onClick={() => removePhase(index)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className="btn btn--sm btn--ghost" onClick={addPhase}>
            {strings.schedule.phaseAdd}
          </button>
        </div>
      ) : null}
    </div>
  );
}
