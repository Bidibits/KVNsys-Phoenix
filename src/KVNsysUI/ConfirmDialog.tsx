import { AlertDialog } from 'radix-ui';
import { Button } from './Button';

/**
 * A decision before something is thrown away (design-direction.md, rule 8): a themed dialog, never
 * a Windows message box. Esc, or the cancel button, keeps things as they were.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = 'Keep it',
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  /** What the red button does: "Discard". */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-card p-6 shadow-lg outline-none">
          <AlertDialog.Title className="text-xl font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-base text-muted-foreground">{message}</AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button type="button" variant="secondary" size="compact">
                {cancelLabel}
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              {/* Red for throwing away, in KVNsys's own dark red: white on it stays readable. */}
              <Button type="button" size="compact" className="bg-danger-ink text-white hover:bg-danger-ink/90" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
