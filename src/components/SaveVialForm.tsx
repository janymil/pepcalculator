import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import type { DoseUnit } from '../lib/calc';
import { parseNumber } from '../lib/format';
import type { Owner } from '../lib/owners';
import { TIMES_PER_DAY_PRESETS, type VialSchedule } from '../lib/schedule';
import type { VialShare } from '../lib/shares';
import type { VialKind } from '../lib/vials';
import { ScheduleForm } from './ScheduleForm';
import {
  ShareForm,
  emptySharesDraft,
  sharesFromDrafts,
  type ShareDefaults,
  type SharesDraft,
} from './ShareForm';

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
  /** Everybody on this device, so the bottle can be shared with them. */
  owners: Owner[];
  /** The person the vial will belong to — the one it is *not* shared with. */
  ownerId: string;
  /** The dose in the calculator, used to seed a sharer's own plan. */
  doseAmount: number;
  doseUnit: DoseUnit;
  onSave: (
    name: string,
    startedOn: string,
    schedule: VialSchedule,
    cost: { price?: number; currency?: string } | undefined,
    shares: VialShare[],
  ) => void;
}

/**
 * "Save this vial" — names the numbers currently in the calculator, attaches a
 * dose plan, and says whether anyone else draws from the same bottle. This lives
 * on the Calculator page (the numbers are right there); the saved card then shows
 * up on the Vials and Calendar pages — and in the stack of every person the vial
 * is shared with.
 */
export function SaveVialForm({
  kind,
  todayIso,
  owners,
  ownerId,
  doseAmount,
  doseUnit,
  onSave,
}: SaveVialFormProps) {
  const { strings } = useI18n();
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('');
  const [schedule, setSchedule] = useState<VialSchedule>(INITIAL_SCHEDULE);

  // A vial is mixed on one day and shared from that day or later — very often
  // later, because someone joins a bottle that is already in use.
  const mixedOn = date || todayIso;
  const defaults: ShareDefaults = {
    reconstitutedOn: mixedOn,
    from: mixedOn > todayIso ? mixedOn : todayIso,
    doseAmount,
    doseUnit,
    schedule,
  };
  const [shares, setShares] = useState<SharesDraft>(() =>
    emptySharesDraft(owners, ownerId, {
      reconstitutedOn: todayIso,
      from: todayIso,
      doseAmount,
      doseUnit,
      schedule: INITIAL_SCHEDULE,
    }),
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    // The plan always starts on the chosen date.
    const startedOn = date || todayIso;
    const cost =
      price.trim() === ''
        ? undefined
        : { price: parseNumber(price), currency: currency.trim() || undefined };
    onSave(
      name.trim(),
      startedOn,
      { ...schedule, startsOn: startedOn },
      cost,
      sharesFromDrafts(shares, startedOn),
    );
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

      <ScheduleForm
        value={schedule}
        onChange={setSchedule}
        baseDose={doseAmount}
        doseUnit={doseUnit}
      />

      <ShareForm
        owners={owners}
        ownerId={ownerId}
        value={shares}
        onChange={setShares}
        defaults={defaults}
      />

      {kind === 'peptide' ? <p className="vials__note">{strings.vials.budNote}</p> : null}
    </section>
  );
}
