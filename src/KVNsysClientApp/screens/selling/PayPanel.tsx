import type { SaleResult } from '@kvnsys/client';
import { Button, FormPanel, Notice, Pesos, TextField } from '@kvnsys/ui';
import { useState } from 'react';

/**
 * Taking cash, in a panel from the right: the total, and the cash the customer gave. Enter pays.
 * Short cash, or a price that changed at the server, is said here and nothing is recorded.
 */
export function PayPanel({
  total,
  onClose,
  onPaid,
  onSignInAgain,
}: {
  total: number;
  onClose: () => void;
  onPaid: (sale: Extract<SaleResult, { ok: true }>) => void;
  onSignInAgain: () => void;
}) {
  const [cash, setCash] = useState('');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [paying, setPaying] = useState(false);

  async function pay() {
    if (paying) return;
    setPaying(true);
    setProblem(null);
    const result = await window.kvnsys.paySale(cash).catch(
      (error: unknown): SaleResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    setPaying(false);
    if (result.ok) onPaid(result);
    else setProblem({ message: result.message, ended: result.reason === 'ended' });
  }

  return (
    <FormPanel
      title="Pay"
      onClose={onClose}
      onSubmit={() => void pay()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={paying}>
            {paying ? 'Recording…' : 'Pay'}
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
        <p className="text-lg font-semibold">Total</p>
        <p className="mb-5 text-4xl font-bold">
          <Pesos centavos={total} />
        </p>
        <TextField label="Cash given" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} autoFocus autoComplete="off" />
      </div>
    </FormPanel>
  );
}
