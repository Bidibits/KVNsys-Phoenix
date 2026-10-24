import type { ProductStockResult, RecordStockResult, StockItem } from '@kvnsys/client';
import { Button, FormPanel, Notice, Pieces, TextField } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/**
 * Putting a product's count right, in a panel from the right: how many are on the shelf, and why
 * that's different from what KVNsys has. KVNsys's number is asked for afresh when the panel opens,
 * not taken from the list, and the change saved is the difference between the two.
 */
export function CountPanel({
  item,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  item: StockItem;
  onClose: () => void;
  /** The stock after the count was saved. */
  onSaved: (stock: number) => void;
  onSignInAgain: () => void;
}) {
  const [onHand, setOnHand] = useState<number | null>(null);
  const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const productId = item.product.id;

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .productStock(productId)
      .catch((error: unknown): ProductStockResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok) setOnHand(answer.stock);
        else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      });
    return () => {
      showing = false;
    };
  }, [productId]);

  async function save() {
    if (onHand === null || saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys
      .countStock({ productId, onHand, counted, reason })
      .catch((error: unknown): RecordStockResult => somethingWentWrong(error));
    setSaving(false);
    if (answer.ok) onSaved(answer.movements[0]!.resultingOnHand);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  return (
    <FormPanel
      title="Adjust stock"
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={onHand === null || saving}>
            {saving ? 'Saving…' : 'Save count'}
          </Button>
        </>
      }
    >
      {problem && <Notice tone="problem">{problem.message}</Notice>}
      {problem?.ended && (
        <Button type="button" size="compact" className="mt-3" onClick={onSignInAgain}>
          Sign in again
        </Button>
      )}
      <div className="mt-4 first:mt-0">
        <p className="mb-1 text-[17px] font-semibold">{item.product.name}</p>
        <p className="mb-4 text-[15px] text-muted-foreground">
          {item.product.code}
          {onHand !== null && (
            <>
              {' · '}KVNsys has <Pieces count={onHand} /> here.
            </>
          )}
        </p>
        <TextField size="compact" label="Pieces counted" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus />
        <TextField size="compact" label="Why it's different" placeholder="Such as 2 torn, thrown away" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FormPanel>
  );
}
