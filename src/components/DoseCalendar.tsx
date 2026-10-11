import { useMemo, useState } from 'react';
import { LOCALES } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { addDays, addMonths, startOfWeek, toIsoDate, weekdayOf } from '../lib/dates';
import { formatDate, monthLabel, weekdayShort } from '../lib/format';
import { doseDaysInMonth, timesOnDay, type VialSchedule } from '../lib/schedule';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

/** Weeks start on Monday, matching how the schedule form lists days. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type CalendarView = 'month' | 'week' | 'day';

interface DoseCalendarProps {
  schedule: VialSchedule;
  todayIso: string;
  /** Current local time as `HH:mm`, used to dim doses already taken. */
  nowTime: string;
}

/**
 * The dose calendar for a saved vial, with month / week / day views:
 *   month — the whole plan at a glance,
 *   week  — the coming days with their times,
 *   day   — one day, time by time.
 * Already-taken doses are dimmed and today is highlighted.
 */
export function DoseCalendar({ schedule, todayIso, nowTime }: DoseCalendarProps) {
  const { strings } = useI18n();

  const [view, setView] = useState<CalendarView>('month');
  const [cursorIso, setCursorIso] = useState(todayIso);

  const viewOptions: SegmentedOption<CalendarView>[] = [
    { value: 'month', label: strings.schedule.viewMonth },
    { value: 'week', label: strings.schedule.viewWeek },
    { value: 'day', label: strings.schedule.viewDay },
  ];

  const shift = (direction: number) => {
    setCursorIso((current) => {
      if (view === 'week') return addDays(current, direction * 7);
      if (view === 'day') return addDays(current, direction);
      return addMonths(current, direction);
    });
  };

  // The heading depends on the active view.
  const { lang } = useI18n();
  const locale = LOCALES[lang];
  let heading = formatDate(cursorIso, locale);
  if (view === 'week') {
    const weekStart = startOfWeek(cursorIso);
    heading = `${formatDate(weekStart, locale)} – ${formatDate(addDays(weekStart, 6), locale)}`;
  } else if (view === 'month') {
    heading = monthLabel(locale, Number(cursorIso.slice(0, 4)), Number(cursorIso.slice(5, 7)) - 1);
  }

  return (
    <div className="calendar">
      <div className="calendar__head">
        <button
          type="button"
          className="calendar__nav"
          onClick={() => shift(-1)}
          aria-label={strings.schedule.prevMonth}
        >
          ‹
        </button>
        <span className="calendar__month">{heading}</span>
        <button
          type="button"
          className="calendar__nav"
          onClick={() => shift(1)}
          aria-label={strings.schedule.nextMonth}
        >
          ›
        </button>
      </div>

      <div className="calendar__views">
        <SegmentedControl
          ariaLabel={strings.schedule.calendar}
          size="sm"
          options={viewOptions}
          value={view}
          onChange={setView}
        />
      </div>

      {view === 'month' ? (
        <MonthGrid schedule={schedule} cursorIso={cursorIso} todayIso={todayIso} />
      ) : null}

      {view === 'week' ? (
        <WeekStrip schedule={schedule} cursorIso={cursorIso} todayIso={todayIso} nowTime={nowTime} />
      ) : null}

      {view === 'day' ? (
        <DayList schedule={schedule} cursorIso={cursorIso} todayIso={todayIso} nowTime={nowTime} />
      ) : null}
    </div>
  );
}

/** Month: the whole plan at a glance. */
function MonthGrid({
  schedule,
  cursorIso,
  todayIso,
}: {
  schedule: VialSchedule;
  cursorIso: string;
  todayIso: string;
}) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];

  const year = Number(cursorIso.slice(0, 4));
  const month = Number(cursorIso.slice(5, 7)) - 1;

  const doseDays = useMemo(() => doseDaysInMonth(schedule, year, month), [schedule, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  return (
    <div className="calendar__grid" role="grid" aria-label={strings.schedule.calendar}>
      {WEEKDAY_ORDER.map((weekday) => (
        <span className="calendar__weekday" key={weekday}>
          {weekdayShort(locale, weekday)}
        </span>
      ))}

      {cells.map((day, index) => {
        if (day === null) {
          return <span className="calendar__day calendar__day--empty" key={`empty-${index}`} />;
        }

        const iso = toIsoDate(new Date(year, month, day));
        const isDose = doseDays.has(iso);
        const classNames = ['calendar__day'];
        if (isDose) classNames.push('is-dose');
        if (isDose && iso < todayIso) classNames.push('is-done');
        if (iso === todayIso) classNames.push('is-today');

        return (
          <span className={classNames.join(' ')} key={iso} title={iso}>
            {day}
          </span>
        );
      })}
    </div>
  );
}

/** Week: seven day-columns, each listing that day's times. */
function WeekStrip({
  schedule,
  cursorIso,
  todayIso,
  nowTime,
}: {
  schedule: VialSchedule;
  cursorIso: string;
  todayIso: string;
  nowTime: string;
}) {
  const { lang } = useI18n();
  const locale = LOCALES[lang];

  const weekStart = startOfWeek(cursorIso);
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  return (
    <ol className="weekstrip">
      {days.map((iso) => {
        const times = timesOnDay(schedule, iso);
        const classNames = ['weekstrip__day'];
        if (iso === todayIso) classNames.push('is-today');

        return (
          <li className={classNames.join(' ')} key={iso}>
            <span className="weekstrip__name">{weekdayShort(locale, weekdayOf(iso))}</span>
            <span className="weekstrip__date">{Number(iso.slice(8, 10))}</span>
            <span className="weekstrip__times">
              {times.length === 0 ? (
                <span className="weekstrip__none">–</span>
              ) : (
                times.map((time) => {
                  const done = iso < todayIso || (iso === todayIso && time < nowTime);
                  return (
                    <span
                      className={`weekstrip__time${done ? ' is-done' : ''}`}
                      key={time}
                      title={`${iso} ${time}`}
                    >
                      {time}
                    </span>
                  );
                })
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Day: one day, time by time. */
function DayList({
  schedule,
  cursorIso,
  todayIso,
  nowTime,
}: {
  schedule: VialSchedule;
  cursorIso: string;
  todayIso: string;
  nowTime: string;
}) {
  const { strings } = useI18n();
  const times = timesOnDay(schedule, cursorIso);

  if (times.length === 0) {
    return <p className="calendar__empty">{strings.schedule.noDose}</p>;
  }

  return (
    <ol className="daylist">
      {times.map((time) => {
        const done = cursorIso < todayIso || (cursorIso === todayIso && time < nowTime);
        return (
          <li className={`daylist__row${done ? ' is-done' : ''}`} key={time}>
            <span className="daylist__time">{time}</span>
            <span className="daylist__dot" aria-hidden="true" />
            {done ? <span className="daylist__state">{strings.schedule.earlier}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

