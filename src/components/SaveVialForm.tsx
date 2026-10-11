import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { parseNumber } from '../lib/format';
import { TIMES_PER_DAY_PRESETS, type VialSchedule } from '../lib/schedule';
import type { VialKind } from '../lib/vials';
import { ScheduleForm } from './ScheduleForm';

/** Starting point for the schedule form: once a day, every day, 4 weeks. */
const INITIAL_SCHEDULE: VialSchedule = {
  times: TIMES_PER_DAY_PRESETS[1],
  repeat: 'daily',
  weekdays: [1, 3, 5],
  startsOn: '',
  durationValue: 4,
  durationUnit: 'weeks',
};

interface SaveVialFormProps {
  kind: VialKind;
  /** Today's date (`yyyy-mm-dd`) used as the default start date. */
  todayIso: string;
  onSave: (
    name: string,
    startedOn: string,
    schedule: VialSchedule,
    cost?: { price?: number; currency?: string },
  ) => void;
}

/**
 * "Save this vial" — names the numbers currently in the calculator and attaches
 * a dose plan. This lives on the Calculator page (the numbers are right there);
 * the saved card then shows up on the Vials and Calendar pages.
 */
export function SaveVialForm({ kind, todayIso, onSave }: SaveVialFormProps) {
  const { strings } = useI18n();
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('');
  const [schedule, setSchedule] = useState<VialSchedule>(INITIAL_SCHEDULE);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // The plan always starts on the chosen date.
    const startedOn = date || todayIso;
    const cost =
      price.trim() === ''
        ? undefined
        : { price: parseNumber(price), currency: currency.trim() || undefined };
    onSave(name.trim(), startedOn, { ...schedule, startsOn: startedOn }, cost);
    setName('');
    setPrice('');
  };

  return (
    <section className="card save-vial" aria-label={strings.vials.save}>
      <form className="vials__form" onSubmit={handleSubmit}>
        <label className="vials__field">
          <span className="field__label">{strings.vials.nameLabel}</span>
          <input
            className="field__input"
            type="text"
            value={name}
            placeholder={strings.vials.namePlaceholder}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="vials__field">
          <span className="field__label">
            {kind === 'anabolic' ? strings.vials.dateLabelAnabolic : strings.vials.dateLabel}
          </span>
          <input
            className="field__input"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>

        <label className="vials__field">
          <span className="field__label">{strings.fields.vialPrice.label}</span>
          <div className="vials__price">
            <input
              className="field__input"
              type="text"
              inputMode="decimal"
              value={price}
              placeholder="40"
              onChange={(event) => setPrice(event.target.value)}
            />
            <input
              className="field__input field__input--currency"
              type="text"
              maxLength={3}
              value={currency}
              placeholder="EUR"
              aria-label={strings.fields.vialPrice.label}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          </div>
        </label>

        <button type="submit" className="btn btn--accent">
          {strings.vials.save}
        </button>
      </form>

      <ScheduleForm value={schedule} onChange={setSchedule} />

      {kind === 'peptide' ? <p className="vials__note">{strings.vials.budNote}</p> : null}
    </section>
  );
}
