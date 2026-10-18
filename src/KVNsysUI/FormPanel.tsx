import type { ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './components/ui/sheet';

/**
 * A form that slides in from the right while the list stays in view behind it (design-direction.md,
 * rule 5). Esc, the × and Cancel close it without saving; Enter in a box, or Save, submits it.
 */
export function FormPanel({
  title,
  onClose,
  onSubmit,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  /** The buttons along the bottom, such as Cancel and Save. */
  actions: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" aria-describedby={undefined} className="w-[460px] max-w-[92vw] gap-0 bg-card p-0 sm:max-w-[460px]">
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="text-xl">{title}</SheetTitle>
        </SheetHeader>
        <form
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="min-h-0 flex-1 overflow-auto px-6 py-5">{children}</div>
          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">{actions}</div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
