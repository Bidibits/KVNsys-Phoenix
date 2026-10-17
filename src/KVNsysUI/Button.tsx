import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "primary" is the screen's main action; "secondary" is a quieter one beside it. */
  variant?: 'primary' | 'secondary';
};

/** A full-width, tall button, easy to hit on a touchscreen. */
export function Button({ className, variant = 'primary', ...button }: Props) {
  const classes = ['kv-button', variant === 'secondary' && 'kv-button--secondary', className];
  return <button {...button} className={classes.filter(Boolean).join(' ')} />;
}
