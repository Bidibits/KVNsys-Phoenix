import type { ButtonHTMLAttributes } from 'react';

/** The main action on a screen: full width and tall, so it's easy to hit on a touchscreen. */
export function Button({ className, ...button }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...button} className={['kv-button', className].filter(Boolean).join(' ')} />;
}
