import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { SYRINGE_TYPES, type DoseUnit, type SyringeTypeId } from '../lib/calc';
import { parseNumber } from '../lib/format';
import { vialOwnerId, type Owner } from '../lib/owners';
import type { VialSchedule } from '../lib/schedule';
import { sharesOf } from '../lib/shares';
import { canSaveVial, vialKind, type SavedVial } from '../lib/vials';
import { NumberField } from './NumberField';
import { ScheduleForm } from './ScheduleForm';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';
import {
  ShareForm,
  sharesDraftFrom,
  sharesFromDrafts,
  type ShareDefaults,
  type SharesDraft,
} from './ShareForm';

interface VialEditorProps {
  vial: SavedVial;
  /** Used when an older vial has no saved plan yet. */
  fallbackSchedule: VialSchedule;
  /** Everybody on this device, so the bottle can be shared with them. */
  owners: Owner[];
  todayIso: string;
  onSave: (vial: SavedVial) => void;
  onCancel: () => void;
}

/**
 * Inline editor for an already saved vial: rename it, correct the amounts (or
 * the oil's concentration), the dose, the syringe scale — and fully change the
 * dose plan. Peptides and anabolics edit different numbers, so the fields switch
 * on the vial's kind.
 *
 * This is also where a vial that started life as one person's becomes shared:
 * "I took four injections, then my wife joined" is an *edit* of an existing
 * bottle, and it has to be reachable that way.
 */
export function VialEditor({
  vial,
  fallbackSchedule,
  owners,
  todayIso,
  onSave,
  onCancel,
}: VialEditorProps) {
  const { strings } = useI18n();
  const anabolic = vialKind(vial) === 'anabolic';
  const ownerId = vialOwnerId(vial);

  const [name, setName] = useState(vial.name);
  const [reconstitutedOn, setReconstitutedOn] = useState(vial.reconstitutedOn);
  const [vialAmount, setVialAmount] = useState(String(vial.vialAmount));
  const [vialUnit, setVialUnit] = useState<DoseUnit>(vial.vialUnit);
  const [waterMl, setWaterMl] = useState(String(vial.waterMl));
  const [concentration, setConcentration] = useState(String(vial.concentrationMgPerMl ?? ''));
  const [vialMl, setVialMl] = useState(String(vial.vialMl ?? ''));
  const [doseAmount, setDoseAmount] = useState(String(vial.doseAmount));
  const [doseUnit, setDoseUnit] = useState<DoseUnit>(vial.doseUnit);
  const [syringeType, setSyringeType] = useState<SyringeTypeId>(vial.syringeType);
  const [price, setPrice] = useState(vial.price !== undefined ? String(vial.price) : '');
  const [currency, setCurrency] = useState(vial.currency ?? '');
  const [schedule, setSchedule] = useState<VialSchedule>(vial.schedule ?? fallbackSchedule);

  // A share can only start on or after the day the powder was mixed, and a person
  // joining an in-use bottle joins it today — never in the past.
  const defaults: ShareDefaults = {
    reconstitutedOn,
    from: reconstitutedOn > todayIso ? reconstitutedOn : todayIso,
    doseAmount: parseNumber(doseAmount),
    doseUnit,
    schedule,
  };
  const [shares, setShares] = useState<SharesDraft>(() =>
    sharesDraftFrom(sharesOf(vial), owners, ownerId, {
      reconstitutedOn: vial.reconstitutedOn,
      from: vial.reconstitutedOn > todayIso ? vial.reconstitutedOn : todayIso,
      doseAmount: vial.doseAmount,
      doseUnit: vial.doseUnit,
      schedule: vial.schedule,
    }),
  );

  const unitOptions: SegmentedOption<DoseUnit>[] = [
    { value: 'mg', label: strings.units.mg },
    { value: 'mcg', label: strings.units.mcg },
  ];

  const syringeOptions: SegmentedOption<SyringeTypeId>[] = SYRINGE_TYPES.map((type) => ({
    value: type.id,
    label: type.label,
  }));

  const draft = anabolic
    ? {
        kind: 'anabolic' as const,
        concentrationMgPerMl: parseNumber(concentration),
        doseAmount: parseNumber(doseAmount),
      }
    : {
        // A hormone vial stays a hormone vial when it is edited.
        kind: vialKind(vial),
        vialAmount: parseNumber(vialAmount),
        waterMl: parseNumber(waterMl),
        doseAmount: parseNumber(doseAmount),
      };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSaveVial(draft)) return;
    const nextShares = sharesFromDrafts(shares, reconstitutedOn);
    onSave({
      ...vial,
      name: name.trim(),
      reconstitutedOn,
      // The unused side of the model is zeroed, so switching kinds stays clean.
      vialAmount: anabolic ? 0 : parseNumber(vialAmount),
      vialUnit,
      waterMl: anabolic ? 0 : parseNumber(waterMl),
      concentrationMgPerMl: anabolic ? parseNumber(concentration) : undefined,
      vialMl: anabolic && vialMl.trim() !== '' ? parseNumber(vialMl) : undefined,
      doseAmount: parseNumber(doseAmount),
      doseUnit,
      syringeType,
      price: price.trim() === '' ? undefined : parseNumber(price),
      currency: currency.trim() === '' ? undefined : currency.trim().toUpperCase(),
      // The plan always starts on the (possibly corrected) start date.
      schedule: { ...schedule, startsOn: reconstitutedOn },
      // Unticking everybody really is "not shared": no empty list is stored.
      ...(nextShares.length > 0 ? { shares: nextShares } : { shares: undefined }),
    });
  };

  return (
    <form className="vial-editor" onSubmit={handleSubmit}>
      <p className="vial-editor__title">{strings.edit.title}</p>

      <div className="field">
        <span className="field__label">{strings.edit.name}</span>
        <input
          className="field__input"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      <div className="field">
        <span className="field__label">
          {anabolic ? strings.vials.dateLabelAnabolic : strings.edit.date}
        </span>
        <input
          className="field__input"
          type="date"
          value={reconstitutedOn}
          onChange={(event) => setReconstitutedOn(event.target.value)}
        />
      </div>

      {anabolic ? (
        <>
          <NumberField
            id={`edit-conc-${vial.id}`}
            label={strings.fields.concentration.label}
            value={concentration}
            onChange={setConcentration}
            suffix={`mg/${strings.units.ml}`}
          />

          <NumberField
            id={`edit-vialml-${vial.id}`}
            label={strings.fields.vialSize.label}
            value={vialMl}
            onChange={setVialMl}
            suffix={strings.units.ml}
          />
        </>
      ) : (
        <>
          <NumberField
            id={`edit-vial-${vial.id}`}
            label={strings.edit.vialAmount}
            value={vialAmount}
            onChange={setVialAmount}
            trailing={
              <SegmentedControl
                ariaLabel={strings.edit.vialAmount}
                size="sm"
                options={unitOptions}
                value={vialUnit}
                onChange={setVialUnit}
              />
            }
          />

          <NumberField
            id={`edit-water-${vial.id}`}
            label={strings.edit.water}
            value={waterMl}
            onChange={setWaterMl}
            suffix={strings.units.ml}
          />
        </>
      )}

      <NumberField
        id={`edit-dose-${vial.id}`}
        label={strings.edit.dose}
        value={doseAmount}
        onChange={setDoseAmount}
        trailing={
          <SegmentedControl
            ariaLabel={strings.edit.dose}
            size="sm"
            options={unitOptions}
            value={doseUnit}
            onChange={setDoseUnit}
          />
        }
      />

      <div className="vial-editor__cost">
        <NumberField
          id={`edit-price-${vial.id}`}
          label={strings.fields.vialPrice.label}
          hint={strings.fields.vialPrice.hint}
          value={price}
          onChange={setPrice}
          placeholder="40"
          trailing={
            <input
              className="field__input field__input--currency"
              type="text"
              maxLength={3}
              value={currency}
              placeholder="EUR"
              aria-label={strings.fields.vialPrice.label}
              onChange={(event) => setCurrency(event.target.value.toUpperCase())}
            />
          }
        />
      </div>

      {anabolic ? null : (
        <div className="field">
          <span className="field__label">{strings.edit.syringe}</span>
          <SegmentedControl
            ariaLabel={strings.edit.syringe}
            size="sm"
            options={syringeOptions}
            value={syringeType}
            onChange={setSyringeType}
          />
        </div>
      )}

      <ScheduleForm
        value={schedule}
        onChange={setSchedule}
        // Seeding the step-up editor with the vial's own dose means the user
        // edits real numbers rather than filling in blanks.
        baseDose={parseNumber(doseAmount)}
        doseUnit={doseUnit}
      />

      <ShareForm
        owners={owners}
        ownerId={ownerId}
        value={shares}
        onChange={setShares}
        defaults={defaults}
      />

      <div className="vial-editor__actions">
        <button type="submit" className="btn btn--accent" disabled={!canSaveVial(draft)}>
          {strings.edit.save}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {strings.edit.cancel}
        </button>
      </div>
    </form>
  );
}

