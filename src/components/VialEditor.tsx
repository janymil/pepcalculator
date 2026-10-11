import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { SYRINGE_TYPES, type DoseUnit, type SyringeTypeId } from '../lib/calc';
import { parseNumber } from '../lib/format';
import type { VialSchedule } from '../lib/schedule';
import { canSaveVial, type SavedVial } from '../lib/vials';
import { NumberField } from './NumberField';
import { ScheduleForm } from './ScheduleForm';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

interface VialEditorProps {
  vial: SavedVial;
  /** Used when an older vial has no saved plan yet. */
  fallbackSchedule: VialSchedule;
  onSave: (vial: SavedVial) => void;
  onCancel: () => void;
}

/**
 * Inline editor for an already saved vial: rename it, correct the amounts, the
 * dose, the syringe scale — and fully change the dose plan.
 */
export function VialEditor({ vial, fallbackSchedule, onSave, onCancel }: VialEditorProps) {
  const { strings } = useI18n();

  const [name, setName] = useState(vial.name);
  const [reconstitutedOn, setReconstitutedOn] = useState(vial.reconstitutedOn);
  const [vialAmount, setVialAmount] = useState(String(vial.vialAmount));
  const [vialUnit, setVialUnit] = useState<DoseUnit>(vial.vialUnit);
  const [waterMl, setWaterMl] = useState(String(vial.waterMl));
  const [doseAmount, setDoseAmount] = useState(String(vial.doseAmount));
  const [doseUnit, setDoseUnit] = useState<DoseUnit>(vial.doseUnit);
  const [syringeType, setSyringeType] = useState<SyringeTypeId>(vial.syringeType);
  const [schedule, setSchedule] = useState<VialSchedule>(vial.schedule ?? fallbackSchedule);

  const unitOptions: SegmentedOption<DoseUnit>[] = [
    { value: 'mg', label: strings.units.mg },
    { value: 'mcg', label: strings.units.mcg },
  ];

  const syringeOptions: SegmentedOption<SyringeTypeId>[] = SYRINGE_TYPES.map((type) => ({
    value: type.id,
    label: type.label,
  }));

  const draft = {
    vialAmount: parseNumber(vialAmount),
    waterMl: parseNumber(waterMl),
    doseAmount: parseNumber(doseAmount),
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSaveVial(draft)) return;
    onSave({
      ...vial,
      name: name.trim(),
      reconstitutedOn,
      vialAmount: draft.vialAmount,
      vialUnit,
      waterMl: draft.waterMl,
      doseAmount: draft.doseAmount,
      doseUnit,
      syringeType,
      // The plan always starts on the (possibly corrected) mixing date.
      schedule: { ...schedule, startsOn: reconstitutedOn },
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
        <span className="field__label">{strings.edit.date}</span>
        <input
          className="field__input"
          type="date"
          value={reconstitutedOn}
          onChange={(event) => setReconstitutedOn(event.target.value)}
        />
      </div>

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

      <ScheduleForm value={schedule} onChange={setSchedule} />

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
