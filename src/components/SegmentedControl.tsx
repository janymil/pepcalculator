export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string | number> {
  /** Accessible name for the group, e.g. "Syringe scale". */
  ariaLabel: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

/**
 * A small accessible segmented toggle (radio group). Used for units (mg/mcg),
 * the syringe scale and the syringe size.
 */
export function SegmentedControl<T extends string | number>({
  ariaLabel,
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  return (
    <div className={`segmented segmented--${size}`} role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={`segmented__option${active ? ' is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
