import { LOCALES } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { weekdayShort } from '../lib/format';
import {
  DURATION_PRESETS,
  TIMES_PER_DAY_PRESETS,
  type VialSchedule,
} from '../lib/schedule';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

/** Weekday toggles, Monday first. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

interface ScheduleFormProps {
  value: VialSchedule;
  onChange: (next: VialSchedule) => void;
}

/**
 * The "when do you take it?" part of saving a vial: how many times a day, at
 * which times, on which days, and for how long. Everything the app later needs
 * to build the calendar and work out what is left — with no logging.
 */
export function ScheduleForm({ value, onChange }: ScheduleFormProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];

  const timesOptions: SegmentedOption<number>[] = [1, 2, 3, 4].map((count) => ({
    value: count,
    label: String(count),
  }));

  const repeatOptions: SegmentedOption<VialSchedule['repeat']>[] = [
    { value: 'daily', label: strings.schedule.repeatDaily },
    { value: 'weekdays', label: strings.schedule.repeatWeekdays },
  ];

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
          onChange={(repeat) => onChange({ ...value, repeat })}
        />
      </div>

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
    </div>
  );
}
