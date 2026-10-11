import { useState } from 'react';
import { LOCALES, interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import { addDays } from '../lib/dates';
import { fmt, formatDate } from '../lib/format';
import { elapsedDoses } from '../lib/schedule';
import { nextSite } from '../lib/sites';
import { nextDoseToday, type TodayDose } from '../lib/today';
import { vialColor } from '../lib/vialColors';
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

  const next: TodayDose | null = nextDoseToday(vials, todayIso, nowTime, 7);
  if (!next) return null;

  const dayLabel =
    next.date === todayIso
      ? strings.schedule.today
      : next.date === addDays(todayIso, 1)
        ? strings.schedule.tomorrow
        : formatDate(next.date, locale);

  const canMark = !next.vial.schedule;

  /** Three ways to read the same volume: graduations, mL, or a pen dial. */
  const byVolume = next.measure === 'volume';
  const byClicks = next.measure === 'clicks';

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
            style={{ backgroundColor: vialColor(next.vialId) }}
            aria-hidden="true"
          />
          {next.name || strings.vials.untitled}
        </div>

        <p className="today-card__time">
          {dayLabel} · {next.time}
        </p>

        <p className="today-card__draw">
          <span className="today-card__draw-label">{copy.next}</span>
          <span className="today-card__draw-value">
            {byClicks
              ? fmt.count(next.drawValue)
              : byVolume
                ? fmt.volume(next.drawValue)
                : fmt.units(next.drawValue)}
          </span>
          <span className="today-card__draw-unit">
            {byClicks
              ? strings.results.clicksWord
              : byVolume
                ? strings.units.ml
                : strings.results.unitsWord}
          </span>
        </p>

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
          site={site ? strings.sites.names[site] : undefined}
          onClose={() => setChecking(false)}
        />
      ) : null}
    </section>
  );
}

