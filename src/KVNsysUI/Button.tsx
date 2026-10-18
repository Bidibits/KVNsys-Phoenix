import { cn } from 'cn';
import type { ButtonHTMLAttributes } from 'react';
import { Button as ShadcnButton } from './components/ui/button';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "primary" is the screen's main action; "secondary" is a quieter one beside it. */
  variant?: 'primary' | 'secondary';
  /**
   * "large" is full-width and 56px tall, easy to hit on a touchscreen; "compact" fits its words, for
   * back-office screens and the buttons along a form's bottom edge.
   */
  size?: 'large' | 'compact';
};

export function Button({ className, variant = 'primary', size = 'large', ...button }: Props) {
  return (
    <ShadcnButton
      {...button}
      variant={variant === 'primary' ? 'default' : 'outline'}
      className={cn(
        size === 'large' ? 'h-14 w-full rounded-lg text-[19px] font-semibold' : 'h-10 rounded-md px-5 text-[15px] font-semibold',
        variant === 'secondary' && 'text-secondary-foreground',
        variant === 'secondary' && size === 'large' && 'mt-3',
        className,
      )}
    />
  );
}
