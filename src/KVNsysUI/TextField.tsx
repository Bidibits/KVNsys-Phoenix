import { useId, type ComponentProps } from 'react';
import { cn } from 'cn';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

type Props = Omit<ComponentProps<'input'>, 'id' | 'className' | 'size'> & {
  label: string;
  /** Shown under the box, and read out by screen readers, when what's typed won't do. */
  error?: string | undefined;
  /**
   * "large" (56px) is for the screens a finger uses, such as signing in and selling; "compact" is
   * for back-office forms, where many fields share the space (design-direction.md, part 2).
   */
  size?: 'large' | 'compact';
};

/** A labelled text box. */
export function TextField({ label, error, size = 'large', ...input }: Props) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={cn('grid', size === 'large' ? 'mb-4 gap-2' : 'mb-3 gap-1.5')}>
      <Label htmlFor={id} className={cn('leading-none font-semibold', size === 'large' ? 'text-base' : 'text-[15px]')}>
        {label}
      </Label>
      <Input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn('bg-field', size === 'large' ? 'h-14 rounded-lg px-4 text-xl md:text-xl' : 'h-11 rounded-md px-3 text-base md:text-base')}
      />
      {error && (
        <p id={errorId} className="text-[15px] text-danger-ink">
          {error}
        </p>
      )}
    </div>
  );
}
