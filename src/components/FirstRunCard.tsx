import { useI18n } from '../i18n/I18nContext';
import type { AnabolicForm, PeptideForm } from '../types';

/**
 * A starting point the user can load with one tap. The numbers are illustrative
 * only — the card says so — which turns the built-in sample values from a
 * silent hazard into a conscious choice.
 */
export interface ExampleSet {
  id: 'peptide' | 'anabolic';
  peptide?: PeptideForm;
  anabolic?: AnabolicForm;
}

export const EXAMPLES: Record<'peptide' | 'anabolic', ExampleSet> = {
  peptide: {
    id: 'peptide',
    peptide: { vialAmount: '5', vialUnit: 'mg', waterMl: '2', doseAmount: '250', doseUnit: 'mcg' },
  },
  anabolic: {
    id: 'anabolic',
    anabolic: { concentration: '250', doseAmount: '1', doseUnit: 'mg', vialMl: '10' },
  },
};

interface FirstRunCardProps {
  onApply: (example: ExampleSet) => void;
  onDismiss: () => void;
}

/**
 * First-run reassurance. Shown above the mode tabs until the user either loads
 * an example or dismisses it, so the app never silently presents invented
 * numbers as if they were the user's own.
 */
export function FirstRunCard({ onApply, onDismiss }: FirstRunCardProps) {
  const { strings } = useI18n();
  const copy = strings.firstRun;

  return (
    <section className="first-run" aria-labelledby="first-run-title">
      <div className="first-run__lead">
        <span className="first-run__icon" aria-hidden="true">
          👋
        </span>
        <div>
          <p className="first-run__title" id="first-run-title">
            {copy.title}
          </p>
          <p className="first-run__body">{copy.body}</p>
        </div>
      </div>

      <div className="first-run__actions">
        <span className="first-run__label">{copy.exampleLabel}</span>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => onApply(EXAMPLES.peptide)}
        >
          {copy.examplePeptide}
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => onApply(EXAMPLES.anabolic)}
        >
          {copy.exampleAnabolic}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={onDismiss}>
          {copy.dismiss}
        </button>
      </div>
    </section>
  );
}
