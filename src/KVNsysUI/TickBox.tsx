import { useId } from 'react';
import { Checkbox } from './components/ui/checkbox';

/** A yes-or-no choice with its words beside it; clicking the words ticks it too. Big enough for a finger. */
export function TickBox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 py-1.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(state) => onChange(state === true)}
        className="mt-0.5 size-5 bg-field"
      />
      <label htmlFor={id} className="text-[15px] leading-snug peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
      </label>
    </div>
  );
}
