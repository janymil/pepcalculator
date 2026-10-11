import type { ReactNode } from 'react';

interface NumberFieldProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Static unit shown after the input, e.g. "mL". */
  suffix?: string;
  /** Optional control rendered at the right edge (e.g. a mg/mcg toggle). */
  trailing?: ReactNode;
  autoFocus?: boolean;
  /** Marks the field as containing an unusable value. */
  invalid?: boolean;
  /** Message shown under the field while it is invalid. */
  error?: string;
}

/**
 * A labelled numeric input. `type="number"` is avoided in favour of
 * `inputMode="decimal"` + text so we can accept a comma decimal separator
 * (common in Slovakia) without the browser rejecting it.
 */
export function NumberField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  suffix,
  trailing,
  autoFocus,
  invalid,
  error,
}: NumberFieldProps) {
  return (
    <div className="field">
      <div className="field__head">
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
        {hint ? (
          <p className="field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        ) : null}
      </div>
      <div className="field__control">
        <input
          id={id}
          className={`field__input${invalid ? ' is-invalid' : ''}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          value={value}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={
            hint || (invalid && error) ? `${id}-hint` : undefined
          }
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <span className="field__suffix">{suffix}</span> : null}
        {trailing}
      </div>
      {invalid && error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}
