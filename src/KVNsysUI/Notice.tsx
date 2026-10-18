import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from './components/ui/alert';

/**
 * A result the person should notice: green when something worked, red when it didn't. Screen
 * readers announce it as it appears; a problem interrupts, good news waits its turn.
 */
export function Notice({ tone, children }: { tone: 'good' | 'problem'; children: ReactNode }) {
  return (
    <Alert
      role={tone === 'problem' ? 'alert' : 'status'}
      // Always shadcn's plain style, with the colours set here. Its "destructive" style paints the
      // message in the theme's red, which with Beta's softer red is too faint to read on pink.
      variant="default"
      className={cn(
        // A notice that opens the card sits under the title like a field would, without adding a gap.
        'mt-4 rounded-lg border-transparent px-4 py-3 first:mt-0',
        tone === 'good' ? 'bg-success text-success-foreground' : 'bg-destructive/10 text-danger-ink',
      )}
    >
      <AlertDescription className="col-span-2 col-start-1 text-base leading-normal text-current">{children}</AlertDescription>
    </Alert>
  );
}
