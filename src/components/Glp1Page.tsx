import { useState } from 'react';
import { LOCALES } from '../i18n';
import { interpolate } from '../i18n';
import { useI18n } from '../i18n/I18nContext';
import type { RoutineCopy, StepCopy } from '../i18n/types';
import { fmt, formatDate, parseNumber } from '../lib/format';
import {
  MEASURE_FIELDS,
  changeSinceStart,
  fieldUnit,
  latestValue,
  measurementValue,
  newestFirst,
  pointsFor,
  type MeasureField,
  type Measurement,
  type MeasurePoint,
} from '../lib/measure';
import { Icon } from './Icon';

/** What a new entry carries: only the figures the user actually typed. */
export interface MeasurementDraft {
  date: string;
  fields: Partial<Record<MeasureField, number>>;
}

interface Glp1PageProps {
  /** Already scoped to one person by the app, like everything else. */
  measurements: Measurement[];
  todayIso: string;
  onAdd: (draft: MeasurementDraft) => void;
  onRemove: (id: string) => void;
}

/**
 * A tiny trend line for one measurement point.
 *
 * It is the same idea as the PK chart — a series drawn from real numbers — but
 * deliberately plainer: no axis, no scale, no target line. The shape is the
 * whole message, because the app has no idea what the right direction is.
 */
function TrendLine({ points, label }: { points: MeasurePoint[]; label: string }) {
  const width = 240;
  const height = 48;
  const pad = 5;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / Math.max(points.length - 1, 1);
  const coords = points.map((point, index) => ({
    x: pad + index * step,
    y: pad + (height - pad * 2) * (1 - (point.value - min) / span),
  }));
  const line = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg
      className="glp1__trend"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <polyline className="glp1__trend-line" points={line} />
      {coords.map(({ x, y }, index) => (
        <circle className="glp1__trend-dot" key={index} cx={x} cy={y} r={2.4} />
      ))}
    </svg>
  );
}

/**
 * The GLP-1 care page.
 *
 * Four answers, in the order a person needs them: how to use the thing, what to
 * check before every use, how to follow whether anything is changing, and what
 * to ask the person who prescribed it. It carries no dose advice and names no
 * brand — the calculator does the arithmetic, and this page does the procedure.
 */
export function Glp1Page({ measurements, todayIso, onAdd, onRemove }: Glp1PageProps) {
  const { lang, strings } = useI18n();
  const copy = strings.glp1;
  const locale = LOCALES[lang];

  const [date, setDate] = useState(todayIso);
  const [inputs, setInputs] = useState<Partial<Record<MeasureField, string>>>({});

  // What the user has typed in, as numbers. Only positive figures survive, so a
  // field left blank simply is not part of the entry.
  const draft: Partial<Record<MeasureField, number>> = {};
  for (const field of MEASURE_FIELDS) {
    const value = parseNumber(inputs[field] ?? '');
    if (value > 0) draft[field] = value;
  }
  const canSave = Object.keys(draft).length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const entries = newestFirst(measurements);
  /** One row per point that has ever been recorded — the change and the shape. */
  const tracked = MEASURE_FIELDS.flatMap((field) => {
    const latest = latestValue(measurements, field);
    if (!latest) return [];
    return [
      {
        field,
        latest,
        points: pointsFor(measurements, field),
        change: changeSinceStart(measurements, field),
      },
    ];
  });

  const handleSave = () => {
    if (!canSave) return;
    onAdd({ date, fields: draft });
    setInputs({});
  };

  return (
    <section className="settings" aria-labelledby="glp1-title">
      <div className="page-head">
        <h2 className="page-title" id="glp1-title">
          {copy.title}
        </h2>
        <p className="page-subtitle">{copy.subtitle}</p>
      </div>

      <p className="glp1__note">{copy.note}</p>

      <section className="glp1__section">
        <h3 className="glp1__h3">{copy.routine.title}</h3>
        <p className="glp1__hint">{copy.routine.hint}</p>
        <div className="glp1__routines">
          <Routine copy={copy.routine.pen} />
          <Routine copy={copy.routine.vial} />
        </div>
      </section>

      <section className="glp1__section">
        <h3 className="glp1__h3">{copy.checks.title}</h3>
        <p className="glp1__hint">{copy.checks.hint}</p>
        <ul className="glp1__checks">
          {copy.checks.items.map((item: StepCopy, index: number) => (
            <li className="glp1__check" key={`${item.title}-${index}`}>
              <span className="glp1__check-icon" aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
              <div>
                <p className="glp1__step-title">{item.title}</p>
                <p className="glp1__step-body">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="glp1__section">
        <h3 className="glp1__h3">{copy.track.title}</h3>
        <p className="glp1__hint">
          {copy.track.subtitle} {copy.track.hint}
        </p>

        <div className="glp1__form">
          <label className="glp1__form-date">
            <span className="field__label">{copy.track.date}</span>
            <input
              className="field__input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>

          <div className="glp1__grid">
            {MEASURE_FIELDS.map((field) => (
              <label className="glp1__field" key={field}>
                <span className="field__label">
                  {copy.points[field]} <span className="glp1__unit">{strings.units[fieldUnit(field)]}</span>
                </span>
                <input
                  className="field__input"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.1"
                  value={inputs[field] ?? ''}
                  onChange={(event) =>
                    setInputs((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
              </label>
            ))}
          </div>

          <p className="glp1__hint">{copy.track.optional}</p>
          <button type="button" className="btn btn--accent" disabled={!canSave} onClick={handleSave}>
            <Icon name="plus" size={16} />
            {copy.track.add}
          </button>
        </div>

        {tracked.length > 0 ? (
          <>
            <h4 className="glp1__h4">{copy.track.since}</h4>
            <ul className="glp1__changes">
              {tracked.map((item) => (
                <li className="glp1__change" key={item.field}>
                  <p className="glp1__change-head">
                    <span className="glp1__change-field">{copy.points[item.field]}</span>
                    <span className="glp1__change-latest">
                      {copy.track.latest} {fmt.count(item.latest.value)}{' '}
                      {strings.units[fieldUnit(item.field)]}
                    </span>
                  </p>
                  <p className="glp1__change-line">
                    {item.change
                      ? interpolate(copy.track.change, {
                          from: fmt.count(item.change.from),
                          to: fmt.count(item.change.to),
                        })
                      : copy.track.needsTwo}
                  </p>
                  {item.points.length > 1 ? (
                    <TrendLine
                      points={item.points}
                      label={interpolate(copy.track.trend, { field: copy.points[item.field] })}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h4 className="glp1__h4">{copy.track.log}</h4>
        {entries.length === 0 ? (
          <p className="glp1__empty">{copy.track.empty}</p>
        ) : (
          <ul className="glp1__log">
            {entries.map((entry) => (
              <li className="glp1__entry" key={entry.id}>
                <span className="glp1__entry-date">{formatDate(entry.date, locale)}</span>
                <span className="glp1__entry-figures">
                  {MEASURE_FIELDS.flatMap((field) => {
                    const value = measurementValue(entry, field);
                    if (value === undefined) return [];
                    return [
                      `${copy.points[field]} ${fmt.count(value)} ${strings.units[fieldUnit(field)]}`,
                    ];
                  }).join(' · ')}
                </span>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  aria-label={interpolate(copy.track.remove, {
                    date: formatDate(entry.date, locale),
                  })}
                  onClick={() => onRemove(entry.id)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glp1__section">
        <h3 className="glp1__h3">{copy.ask.title}</h3>
        <p className="glp1__hint">{copy.ask.subtitle}</p>
        <ul className="glp1__ask">
          {copy.ask.items.map((question, index) => (
            <li className="glp1__question" key={`${question}-${index}`}>
              {question}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}

/** An ordered list of titled steps — a device routine. */
function Routine({ copy }: { copy: RoutineCopy }) {
  return (
    <div className="glp1__routine">
      <h4 className="glp1__h4">{copy.title}</h4>
      <ol className="glp1__steps">
        {copy.steps.map((step: StepCopy, index: number) => (
          <li className="glp1__step" key={`${step.title}-${index}`}>
            <span className="glp1__step-num" aria-hidden="true">
              {index + 1}
            </span>
            <div>
              <p className="glp1__step-title">{step.title}</p>
              <p className="glp1__step-body">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

