import { useId, type InputHTMLAttributes } from 'react';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  /** Shown under the box, and read out by screen readers, when what's typed won't do. */
  error?: string | undefined;
};

/** A labelled text box, big enough for a finger on a touchscreen. */
export function TextField({ label, error, ...input }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="kv-field">
      <label className="kv-field__label" htmlFor={id}>
        {label}
      </label>
      <input
        {...input}
        id={id}
        className="kv-field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error && (
        <p id={errorId} className="kv-field__error">
          {error}
        </p>
      )}
    </div>
  );
}
