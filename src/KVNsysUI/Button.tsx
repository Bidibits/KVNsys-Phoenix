import { cn } from 'cn';
import type { ButtonHTMLAttributes } from 'react';
import { Button as ShadcnButton } from './components/ui/button';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "primary" is the screen's main action; "secondary" is a quieter one beside it. */
  variant?: 'primary' | 'secondary';
};

/** A full-width, tall button (56px), easy to hit on a touchscreen. */
export function Button({ className, variant = 'primary', ...button }: Props) {
  return (
    <ShadcnButton
      {...button}
      variant={variant === 'primary' ? 'default' : 'outline'}
      className={cn(
        'h-14 w-full rounded-lg text-[19px] font-semibold',
        variant === 'secondary' && 'mt-3 text-secondary-foreground',
        className,
      )}
    />
  );
}
