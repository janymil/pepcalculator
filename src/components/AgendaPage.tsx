import { useMemo, useState } from 'react';
import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { STORAGE_KEYS } from '../config/defaults';
import { useLocalStorage } from '../hooks/useLocalStorage';
import {
  agendaForDay,
  agendaForMonth,
  hasAnyPlan,
  scheduledVials,
  upcomingDays,
} from '../lib/agenda';
import { addDays, addMonths, toIsoDate } from '../lib/dates';
import { fmt, formatDate, monthLabel, weekdayShort } from '../lib/format';
import { normalizeTimes, planEndDate } from '../lib/schedule';
import { filterVialsByKind, type KindFilter, type SavedVial } from '../lib/vials';
import { vialColor } from '../lib/vialColors';
import { KindFilterControl } from './KindFilterControl';

/** Weeks start on Monday, matching the rest of the app. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
/** How many upcoming days the "coming up" panel lists. */
const UPCOMING_DAYS = 5;
/** A day cell only has room for a few pills; the rest collapse into "+N". */
const MAX_PILLS = 3;

interface AgendaPageProps {
  vials: SavedVial[];
  todayIso: string;
  nowTime: string;
  /** Jumps to the calculator from the empty state. */
  onGoToCalculator?: () => void;
}

/** Short label for a pill inside a day cell (the full name lives in the title). */
function pillLabel(name: string, fallback: string): string {
  const text = name.trim() || fallback;
  return text.length > 6 ? `${text.slice(0, 5)}…` : text;
}

/**
 * The Calendar page: every saved plan together — **which days** carry a dose and
 * **at which hours**. Each peptide keeps its own colour everywhere (see
 * `lib/vialColors.ts`), so the pills inside a day are recognisable at a glance;
 * only **today** gets a coloured background, the other days just carry pills.
 */
export function AgendaPage({ vials, todayIso, nowTime, onGoToCalculator }: AgendaPageProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];

  const [filter, setFilter] = useLocalStorage<KindFilter>(STORAGE_KEYS.kindFilter, 'all');
  const [cursorIso, setCursorIso] = useState(todayIso);
  const [selectedIso, setSelectedIso] = useState(todayIso);

  const visible = useMemo(() => filterVialsByKind(vials, filter), [vials, filter]);
  const hasPlan = hasAnyPlan(visible);

  const year = Number(cursorIso.slice(0, 4));
  const monthIndex = Number(cursorIso.slice(5, 7)) - 1;

  const month = useMemo(
    () => agendaForMonth(visible, year, monthIndex, todayIso),
    [visible, year, monthIndex, todayIso],
  );
  const selected = useMemo(
    () => agendaForDay(visible, selectedIso, todayIso),
    [visible, selectedIso, todayIso],
  );
  const upcoming = useMemo(
    () => upcomingDays(visible, todayIso, nowTime, UPCOMING_DAYS, todayIso),
    [visible, todayIso, nowTime],
  );
  const plans = useMemo(() => scheduledVials(visible), [visible]);

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const lead = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const dayTitle = (iso: string): string => {
    if (iso === todayIso) return strings.schedule.today;
    if (iso === addDays(todayIso, 1)) return strings.schedule.tomorrow;
    return formatDate(iso, locale);
  };

  const openDay = (iso: string) => {
    setSelectedIso(iso);
    setCursorIso(iso);
  };

  /** One line's worth of "when": repeat pattern, times and end date. */
  const planPattern = (vial: SavedVial) => {
    const schedule = vial.schedule;
    if (!schedule) return { days: '', times: '', ends: '' };
    const days =
      schedule.repeat === 'daily'
        ? strings.schedule.repeatDaily
        : schedule.weekdays.length === 0
          ? strings.schedule.repeatWeekdays
          : schedule.weekdays
              .slice()
              .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
              .map((weekday) => weekdayShort(locale, weekday))
              .join(', ');
    const end = planEndDate(schedule);
    return {
      days,
      times: normalizeTimes(schedule.times).join(' · '),
      ends: end
        ? interpolate(strings.schedule.planEnds, { date: formatDate(end, locale) })
        : strings.schedule.planOngoing,
    };
  };

  return (
    <section className="agenda" aria-labelledby="agenda-title">
      <div className="page-head">
        <h2 className="page-title" id="agenda-title">
          {strings.views.calendar}
        </h2>
        <p className="page-subtitle">{strings.agenda.subtitle}</p>
      </div>

      <div className="agenda__toolbar">
        <KindFilterControl value={filter} onChange={setFilter} />
        {plans.length > 0 ? (
          <ul className="agenda__legend">
            {plans.map((vial) => (
              <li className="agenda__legend-item" key={vial.id}>
                <span
                  className="agenda__dot"
                  style={{ backgroundColor: vialColor(vial.id) }}
                  aria-hidden="true"
                />
                {vial.name || strings.vials.untitled}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {!hasPlan ? (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">
            📅
          </span>
          <p className="empty__title">{strings.agenda.empty}</p>
          {onGoToCalculator ? (
            <button
              type="button"
              className="btn btn--sm btn--accent empty__cta"
              onClick={onGoToCalculator}
            >
              {strings.emptyCta.createPlan}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="agenda__grid">
            <div className="calendar">
              <div className="calendar__head">
                <button
                  type="button"
                  className="calendar__nav"
                  onClick={() => setCursorIso((current) => addMonths(current, -1))}
                  aria-label={strings.schedule.prevMonth}
                >
                  ‹
                </button>
                <span className="calendar__month">{monthLabel(locale, year, monthIndex)}</span>
                <button
                  type="button"
                  className="calendar__nav"
                  onClick={() => setCursorIso((current) => addMonths(current, 1))}
                  aria-label={strings.schedule.nextMonth}
                >
                  ›
                </button>
              </div>

              <div className="calendar__grid" role="grid" aria-label={strings.agenda.calendarAria}>
                {WEEKDAY_ORDER.map((weekday) => (
                  <span className="calendar__weekday" key={weekday}>
                    {weekdayShort(locale, weekday)}
                  </span>
                ))}

                {cells.map((day, index) => {
                  if (day === null) {
                    return (
                      <span className="calendar__day calendar__day--empty" key={`empty-${index}`} />
                    );
                  }
                  const iso = toIsoDate(new Date(year, monthIndex, day));
                  const entries = month.get(iso) ?? [];
                  const classNames = ['calendar__day', 'agenda__cell'];
                  if (entries.length > 0) classNames.push('has-doses');
                  if (iso === todayIso) classNames.push('is-today');
                  if (iso === selectedIso) classNames.push('is-selected');
                  return (
                    <button
                      type="button"
                      className={classNames.join(' ')}
                      key={iso}
                      aria-pressed={iso === selectedIso}
                      onClick={() => setSelectedIso(iso)}
                    >
                      <span className="agenda__daynum">{day}</span>
                      {entries.length > 0 ? (
                        <span className="agenda__pills">
                          {entries.slice(0, MAX_PILLS).map((entry) => (
                            <span
                              className="agenda__pill"
                              key={`${entry.vialId}-${entry.time}`}
                              style={{ backgroundColor: vialColor(entry.vialId) }}
                              title={`${entry.time} · ${entry.name || strings.vials.untitled}`}
                            >
                              {pillLabel(entry.name, strings.vials.untitled)}
                            </span>
                          ))}
                          {entries.length > MAX_PILLS ? (
                            <span className="agenda__more">
                              {interpolate(strings.agenda.more, {
                                count: entries.length - MAX_PILLS,
                              })}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="agenda__actions">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => openDay(todayIso)}
                >
                  {strings.agenda.today}
                </button>
              </div>
            </div>

            <div className="agenda__day">
              <p className="agenda__daytitle">{dayTitle(selectedIso)}</p>
              {selected.length === 0 ? (
                <p className="calendar__empty">{strings.schedule.noDose}</p>
              ) : (
                <ol className="agenda__list">
                  {selected.map((entry) => {
                    const done =
                      selectedIso < todayIso || (selectedIso === todayIso && entry.time < nowTime);
                    return (
                      <li
                        className={`agenda__item${done ? ' is-done' : ''}`}
                        key={`${entry.vialId}-${entry.time}`}
                      >
                        <span className="agenda__time">{entry.time}</span>
                        <span
                          className="agenda__dot"
                          style={{ backgroundColor: vialColor(entry.vialId) }}
                          aria-hidden="true"
                        />
                        <span className="agenda__name">{entry.name || strings.vials.untitled}</span>
                        <span className="agenda__draw">
                          {entry.kind === 'anabolic' ? (
                            <>
                              {fmt.volume(entry.volumePerDoseMl)} <small>{strings.units.ml}</small>
                            </>
                          ) : (
                            <>
                              {fmt.units(entry.unitsPerDose)} <small>{strings.results.unitsWord}</small>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          <div className="agenda__panels">
            <section className="agenda__panel" aria-label={strings.agenda.upcoming}>
              <p className="agenda__section">{strings.agenda.upcoming}</p>
              {upcoming.length === 0 ? (
                <p className="agenda__muted">{strings.agenda.upcomingNone}</p>
              ) : (
                <ol className="agenda__days">
                  {upcoming.map((day) => (
                    <li className="agenda__dayrow" key={day.date}>
                      <span className="agenda__daydate">{dayTitle(day.date)}</span>
                      <span className="agenda__daytimes">
                        {day.entries.map((entry) => (
                          <button
                            type="button"
                            className="agenda__chip"
                            key={`${entry.vialId}-${entry.time}`}
                            onClick={() => openDay(day.date)}
                          >
                            <span
                              className="agenda__dot"
                              style={{ backgroundColor: vialColor(entry.vialId) }}
                              aria-hidden="true"
                            />
                            {entry.time} · {entry.name || strings.vials.untitled}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="agenda__panel" aria-label={strings.agenda.plans}>
              <p className="agenda__section">{strings.agenda.plans}</p>
              <ul className="agenda__plans">
                {plans.map((vial) => {
                  const pattern = planPattern(vial);
                  return (
                    <li className="agenda__plan" key={vial.id}>
                      <span className="agenda__planname">
                        <span
                          className="agenda__dot"
                          style={{ backgroundColor: vialColor(vial.id) }}
                          aria-hidden="true"
                        />
                        {vial.name || strings.vials.untitled}
                      </span>
                      <span className="agenda__planrow">
                        <span className="agenda__plantag">{pattern.days}</span>
                        <span>{interpolate(strings.agenda.atTimes, { times: pattern.times })}</span>
                        <span className="agenda__planend">{pattern.ends}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
