import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { modeMeta, resolveCapacity } from '../config/modes';
import {
  SYRINGE_TYPES,
  type DoseUnit,
  type ModeId,
  type SyringeTypeId,
} from '../lib/calc';
import { isInvalidNumberInput } from '../lib/format';
import type { AnabolicForm, PeptideForm, SyringeSettings } from '../types';
import { NumberField } from './NumberField';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

interface CalculatorFormProps {
  mode: ModeId;
  peptide: PeptideForm;
  onPeptideChange: (patch: Partial<PeptideForm>) => void;
  anabolic: AnabolicForm;
  onAnabolicChange: (patch: Partial<AnabolicForm>) => void;
  syringe: SyringeSettings;
  onSyringeChange: (patch: Partial<SyringeSettings>) => void;
  onReset: () => void;
}

/** A label + hint wrapper for controls that are not text inputs. */
function FieldGroup({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__label" id={`${id}-label`}>
          {label}
        </span>
        {hint ? (
          <p className="field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** The left-hand column: everything the user types. */
export function CalculatorForm({
  mode,
  peptide,
  onPeptideChange,
  anabolic,
  onAnabolicChange,
  syringe,
  onSyringeChange,
  onReset,
}: CalculatorFormProps) {
  const { strings } = useI18n();
  const invalidNumber = strings.validation.invalidNumber;

  const unitOptions: SegmentedOption<DoseUnit>[] = [
    { value: 'mg', label: strings.units.mg },
    { value: 'mcg', label: strings.units.mcg },
  ];

  const meta = modeMeta(mode);
  // Anabolic oils are drawn with a plain mL syringe, so the insulin scale
  // (U-100 / U-40 / U-50) and its "units" only apply to peptides.
  const usesInsulinSyringe = meta.measure === 'insulin';
  const capacityMl = resolveCapacity(mode, syringe.capacityMl);

  const syringeTypeOptions: SegmentedOption<SyringeTypeId>[] = SYRINGE_TYPES.map((type) => ({
    value: type.id,
    label: type.label,
  }));

  const capacityOptions: SegmentedOption<number>[] = meta.capacities.map((capacity) => ({
    value: capacity,
    label: `${capacity} ${strings.units.ml}`,
  }));

  return (
    <form className="form" onSubmit={(event) => event.preventDefault()}>
      <section className="card">
        <h2 className="card__title">{strings.sections.inputs}</h2>

        {mode === 'peptide' ? (
          <>
            <NumberField
              id="vial-amount"
              label={strings.fields.vialAmount.label}
              hint={strings.fields.vialAmount.hint}
              value={peptide.vialAmount}
              onChange={(vialAmount) => onPeptideChange({ vialAmount })}
              placeholder="5"
              invalid={isInvalidNumberInput(peptide.vialAmount)}
              error={invalidNumber}
              trailing={
                <SegmentedControl
                  ariaLabel={strings.fields.vialAmount.label}
                  size="sm"
                  options={unitOptions}
                  value={peptide.vialUnit}
                  onChange={(vialUnit) => onPeptideChange({ vialUnit })}
                />
              }
            />

            <NumberField
              id="water-ml"
              label={strings.fields.waterMl.label}
              hint={strings.fields.waterMl.hint}
              value={peptide.waterMl}
              onChange={(waterMl) => onPeptideChange({ waterMl })}
              placeholder="2"
              invalid={isInvalidNumberInput(peptide.waterMl)}
              error={invalidNumber}
              suffix={strings.units.ml}
            />

            <NumberField
              id="peptide-dose"
              label={strings.fields.dose.label}
              hint={strings.fields.dose.hint}
              value={peptide.doseAmount}
              onChange={(doseAmount) => onPeptideChange({ doseAmount })}
              placeholder="250"
              invalid={isInvalidNumberInput(peptide.doseAmount)}
              error={invalidNumber}
              trailing={
                <SegmentedControl
                  ariaLabel={strings.fields.dose.label}
                  size="sm"
                  options={unitOptions}
                  value={peptide.doseUnit}
                  onChange={(doseUnit) => onPeptideChange({ doseUnit })}
                />
              }
            />
          </>
        ) : (
          <>
            <NumberField
              id="concentration"
              label={strings.fields.concentration.label}
              hint={strings.fields.concentration.hint}
              value={anabolic.concentration}
              onChange={(concentration) => onAnabolicChange({ concentration })}
              placeholder="250"
              invalid={isInvalidNumberInput(anabolic.concentration)}
              error={invalidNumber}
              suffix={`mg / ${strings.units.ml}`}
            />

            <NumberField
              id="anabolic-dose"
              label={strings.fields.dose.label}
              hint={strings.fields.dose.hint}
              value={anabolic.doseAmount}
              onChange={(doseAmount) => onAnabolicChange({ doseAmount })}
              placeholder="250"
              invalid={isInvalidNumberInput(anabolic.doseAmount)}
              error={invalidNumber}
              trailing={
                <SegmentedControl
                  ariaLabel={strings.fields.dose.label}
                  size="sm"
                  options={unitOptions}
                  value={anabolic.doseUnit}
                  onChange={(doseUnit) => onAnabolicChange({ doseUnit })}
                />
              }
            />

            <NumberField
              id="vial-size"
              label={strings.fields.vialSize.label}
              hint={strings.fields.vialSize.hint}
              value={anabolic.vialMl}
              onChange={(vialMl) => onAnabolicChange({ vialMl })}
              placeholder="10"
              invalid={isInvalidNumberInput(anabolic.vialMl)}
              error={invalidNumber}
              suffix={strings.units.ml}
            />
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">{strings.sections.syringe}</h2>

        {usesInsulinSyringe ? (
          <FieldGroup
            id="syringe-type"
            label={strings.fields.syringeType.label}
            hint={strings.fields.syringeType.hint}
          >
            <SegmentedControl
              ariaLabel={strings.fields.syringeType.label}
              options={syringeTypeOptions}
              value={syringe.type}
              onChange={(type) => onSyringeChange({ type })}
            />
          </FieldGroup>
        ) : null}

        <FieldGroup
          id="syringe-capacity"
          label={strings.fields.syringeCapacity.label}
          hint={strings.fields.syringeCapacity.hint}
        >
          <SegmentedControl
            ariaLabel={strings.fields.syringeCapacity.label}
            options={capacityOptions}
            value={capacityMl}
            onChange={(nextCapacity) => onSyringeChange({ capacityMl: nextCapacity })}
          />
        </FieldGroup>

        <button type="button" className="btn btn--ghost" onClick={onReset}>
          {strings.actions.reset}
        </button>
      </section>
    </form>
  );
}
