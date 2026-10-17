import { useId, type InputHTMLAttributes } from 'react';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> & {
  label: string;
  /** Shown under the box, and read out by screen readers, when what's typed won't do. */
  error?: string | undefined;
};

/** A labelled text box, big enough for a finger on a touchscreen (56px tall). */
export function TextField({ label, error, ...input }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="mb-4 grid gap-2">
      <Label htmlFor={id} className="text-base leading-none font-semibold">
        {label}
      </Label>
      <Input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-14 rounded-xl px-4 text-xl md:text-xl"
      />
      {error && (
        <p id={errorId} className="text-[15px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
