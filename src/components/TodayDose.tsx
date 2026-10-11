import { useState } from 'react';
import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { addDays } from '../lib/dates';
import { fmt, formatDate } from '../lib/format';
import { elapsedDoses } from '../lib/schedule';
import { nextSite } from '../lib/sites';
import { nextSession } from '../lib/session';
import type { TodayDose } from '../lib/today';
import { vialColor, vialDotStyle } from '../lib/vialColors';
import { type SavedVial } from '../lib/vials';
import { DrawCheck } from './DrawCheck';

interface TodayDoseProps {
  /** Live vials only (tombstones already filtered out). */
  vials: SavedVial[];
  todayIso: string;
  nowTime: string;
  onLoad: (vial: SavedVial) => void;
  onAddDose: (id: string) => void;
}

/** The single most important card: "what do I draw next, and how much?". */
export function TodayDoseCard({ vials, todayIso, nowTime, onLoad, onAddDose }: TodayDoseProps) {
  const { lang, strings } = useI18n();
  const locale = LOCALES[lang];
  const copy = strings.today;
  const [checking, setChecking] = useState(false);

  const session = nextSession(vials, todayIso, nowTime, 7);
  if (!session) return null;

  // The dose this card has always shown, plus the rest of the sitting: a stack can
  // mean two compounds at the same moment, which is one trip to the drawer.
  const next = session.dose;
  const also = session.items.slice(1);

  const dayLabel =
    next.date === todayIso
      ? strings.schedule.today
      : next.date === addDays(todayIso, 1)
        ? strings.schedule.tomorrow
        : formatDate(next.date, locale);

  const canMark = !next.vial.schedule;

  /** Three ways to read the same volume: graduations, mL, or a pen dial. */
  const drawOf = (dose: TodayDose): string =>
    dose.measure === 'clicks'
      ? fmt.count(dose.drawValue)
      : dose.measure === 'volume'
        ? fmt.volume(dose.drawValue)
        : fmt.units(dose.drawValue);

  const unitOf = (dose: TodayDose): string =>
    dose.measure === 'clicks'
      ? strings.results.clicksWord
      : dose.measure === 'volume'
        ? strings.units.ml
        : strings.results.unitsWord;

  // Where to inject. Because "how many doses have happened?" is derived from the
  // plan, so is the site — the rotation needs no logging of its own.
  const site = next.vial.schedule
    ? nextSite(elapsedDoses(next.vial.schedule, todayIso, nowTime))
    : null;

  return (
    <section className="card today-card" aria-labelledby="today-title">
      <h2 className="card__title" id="today-title">
        {copy.title}
      </h2>

      <div className="today-card__hero">
        <div className="today-card__name">
          <span
            className="vial__dot"
            style={{ backgroundColor: vialColor(next.vialId), ...vialDotStyle(next.vialId) }}
            aria-hidden="true"
          />
          {next.name || strings.vials.untitled}
        </div>

        <p className="today-card__time">
          {dayLabel} · {next.time}
        </p>

        <p className="today-card__draw">
          <span className="today-card__draw-label">{copy.next}</span>
          <span className="today-card__draw-value">{drawOf(next)}</span>
          <span className="today-card__draw-unit">{unitOf(next)}</span>
        </p>

        {also.length > 0 ? (
          <div className="today-card__also">
            <p className="today-card__also-title">{copy.also}</p>
            <ul className="today-card__also-list">
              {also.map((item) => (
                <li key={item.vialId}>
                  <span className="today-card__also-name">
                    {item.name || strings.vials.untitled}
                  </span>
                  <strong className="today-card__also-draw">
                    {drawOf(item)} {unitOf(item)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {site ? (
          <p className="today-card__site" title={strings.sites.hint}>
            {interpolate(strings.sites.next, { site: strings.sites.names[site] })}
          </p>
        ) : null}

        <div className="today-card__actions">
          <button
            type="button"
            className="btn btn--sm btn--accent"
            onClick={() => setChecking(true)}
          >
            {copy.check}
          </button>
          <button type="button" className="btn btn--sm" onClick={() => onLoad(next.vial)}>
            {copy.load}
          </button>
          {canMark ? (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => onAddDose(next.vialId)}
            >
              {copy.markTaken}
            </button>
          ) : null}
        </div>
      </div>

      {/* The check card is the one thing meant to be read at arm's length, so it
          is rendered as an overlay rather than another block on the page. */}
      {checking ? (
        <DrawCheck
          dose={next}
          also={also}
          site={site ? strings.sites.names[site] : undefined}
          onClose={() => setChecking(false)}
        />
      ) : null}
    </section>
  );
}

