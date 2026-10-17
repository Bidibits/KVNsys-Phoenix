import type { ReactNode } from 'react';

/**
 * A result the person should notice: green when something worked, red when it didn't. Screen
 * readers announce it as it appears; a problem interrupts, good news waits its turn.
 */
export function Notice({ tone, children }: { tone: 'good' | 'problem'; children: ReactNode }) {
  return (
    <p className={`kv-notice kv-notice--${tone}`} role={tone === 'problem' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}
