import type { ReactNode } from 'react';
import { useI18n } from '../i18n/I18nContext';
import { modeMeta, resolveCapacity } from '../config/modes';
import {
  DOSE_UNITS,
  SYRINGE_TYPES,
  type DoseUnit,
  type ModeId,
  type SyringeTypeId,
} from '../lib/calc';
import { isInvalidNumberInput, parseNumber } from '../lib/format';
import type { AnabolicForm, Glp1Form, PenSettings, PeptideForm, SyringeSettings } from '../types';
import { NumberField } from './NumberField';
import { SegmentedControl, type SegmentedOption } from './SegmentedControl';

interface CalculatorFormProps {
  mode: ModeId;
  peptide: PeptideForm;
  onPeptideChange: (patch: Partial<PeptideForm>) => void;
  anabolic: AnabolicForm;
  onAnabolicChange: (patch: Partial<AnabolicForm>) => void;
  hormone: PeptideForm;
  onHormoneChange: (patch: Partial<PeptideForm>) => void;
  glp1: Glp1Form;
  onGlp1Change: (patch: Partial<Glp1Form>) => void;
  pen: PenSettings;
  onPenChange: (patch: Partial<PenSettings>) => void;
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
  hormone,
  onHormoneChange,
  glp1,
  onGlp1Change,
  pen,
  onPenChange,
  syringe,
  onSyringeChange,
  onReset,
}: CalculatorFormProps) {
  const { strings } = useI18n();
  const invalidNumber = strings.validation.invalidNumber;

  // Peptides and hormones share the reconstitution fields; only the units and
  // the placeholders differ. GLP-1 and oils are both described by a strength
  // printed on the label, and differ only in how the draw is read.
  const reconstituting = mode === 'peptide' || mode === 'hormone';
  const reconstituted = mode === 'hormone' ? hormone : peptide;
  const onReconstitutedChange = mode === 'hormone' ? onHormoneChange : onPeptideChange;

  const isPen = mode === 'glp1';
  const labelled = isPen ? glp1 : anabolic;
  const onLabelledChange = isPen ? onGlp1Change : onAnabolicChange;

  const unitOptions: SegmentedOption<DoseUnit>[] = (
    mode === 'hormone' ? DOSE_UNITS : (['mg', 'mcg'] as const)
  ).map((unit) => ({ value: unit, label: strings.units[unit] }));

  const meta = modeMeta(mode);
  // Peptides and hormones are drawn with an insulin syringe, so its scale
  // matters; anabolic oils are read in mL on a plain barrel.
  const usesInsulinSyringe = meta.showSyringeScale;
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

        {reconstituting ? (
          <>
            <NumberField
              id="vial-amount"
              label={strings.fields.vialAmount.label}
              hint={strings.fields.vialAmount.hint}
              value={reconstituted.vialAmount}
              onChange={(vialAmount) => onReconstitutedChange({ vialAmount })}
              placeholder={mode === 'hormone' ? '10' : '5'}
              invalid={isInvalidNumberInput(reconstituted.vialAmount)}
              error={invalidNumber}
              trailing={
                <SegmentedControl
                  ariaLabel={strings.fields.vialAmount.label}
                  size="sm"
                  options={unitOptions}
                  value={reconstituted.vialUnit}
                  onChange={(vialUnit) => onReconstitutedChange({ vialUnit })}
                />
              }
            />

            <NumberField
              id="water-ml"
              label={strings.fields.waterMl.label}
              hint={strings.fields.waterMl.hint}
              value={reconstituted.waterMl}
              onChange={(waterMl) => onReconstitutedChange({ waterMl })}
              placeholder={mode === 'hormone' ? '1' : '2'}
              invalid={isInvalidNumberInput(reconstituted.waterMl)}
              error={invalidNumber}
              suffix={strings.units.ml}
            />

            <NumberField
              id="peptide-dose"
              label={strings.fields.dose.label}
              hint={strings.fields.dose.hint}
              value={reconstituted.doseAmount}
              onChange={(doseAmount) => onReconstitutedChange({ doseAmount })}
              placeholder={mode === 'hormone' ? '2' : '250'}
              invalid={isInvalidNumberInput(reconstituted.doseAmount)}
              error={invalidNumber}
              trailing={
                <SegmentedControl
                  ariaLabel={strings.fields.dose.label}
                  size="sm"
                  options={unitOptions}
                  value={reconstituted.doseUnit}
                  onChange={(doseUnit) => onReconstitutedChange({ doseUnit })}
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
              value={labelled.concentration}
              onChange={(concentration) => onLabelledChange({ concentration })}
              placeholder={isPen ? '1' : '250'}
              invalid={isInvalidNumberInput(labelled.concentration)}
              error={invalidNumber}
              suffix={`mg / ${strings.units.ml}`}
            />

            <NumberField
              id="labelled-dose"
              label={strings.fields.dose.label}
              hint={strings.fields.dose.hint}
              value={labelled.doseAmount}
              onChange={(doseAmount) => onLabelledChange({ doseAmount })}
              placeholder={isPen ? '0.25' : '250'}
              invalid={isInvalidNumberInput(labelled.doseAmount)}
              error={invalidNumber}
              trailing={
                <SegmentedControl
                  ariaLabel={strings.fields.dose.label}
                  size="sm"
                  options={unitOptions}
                  value={labelled.doseUnit}
                  onChange={(doseUnit) => onLabelledChange({ doseUnit })}
                />
              }
            />

            <NumberField
              id="vial-size"
              label={isPen ? strings.fields.penVolume.label : strings.fields.vialSize.label}
              hint={isPen ? strings.fields.penVolume.hint : strings.fields.vialSize.hint}
              value={labelled.vialMl}
              onChange={(vialMl) => onLabelledChange({ vialMl })}
              placeholder={isPen ? '1.5' : '10'}
              invalid={isInvalidNumberInput(labelled.vialMl)}
              error={invalidNumber}
              suffix={strings.units.ml}
            />
          </>
        )}
      </section>

      <section className="card">
        <h2 className="card__title">
          {isPen ? strings.sections.pen : strings.sections.syringe}
        </h2>

        {isPen ? (
          <NumberField
            id="pen-dial"
            label={strings.fields.clicksPerMl.label}
            hint={strings.fields.clicksPerMl.hint}
            value={String(pen.clicksPerMl)}
            onChange={(value) => onPenChange({ clicksPerMl: parseNumber(value) })}
            placeholder="100"
            invalid={isInvalidNumberInput(String(pen.clicksPerMl))}
            error={invalidNumber}
            suffix={strings.results.clicksWord}
          />
        ) : null}

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
