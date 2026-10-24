import type { CurrentShiftResult, ShiftResult, ShiftView } from '@kvnsys/client';
import { Button, FormPanel, Notice, Pesos, TextField } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/**
 * Ending the shift, in a panel from the right: the shift's figures as the server has them now, and
 * the cash counted out of the drawer. What it should hold is worked out by the server, never typed.
 */
export function EndShiftPanel({
  onClose,
  onEnded,
  onSignInAgain,
}: {
  onClose: () => void;
  onEnded: (shift: ShiftView) => void;
  onSignInAgain: () => void;
}) {
  const [shift, setShift] = useState<ShiftView | null>(null);
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .currentShift()
      .catch((error: unknown): CurrentShiftResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok && answer.shift) setShift(answer.shift);
        else if (answer.ok) setProblem({ message: "You haven't a shift open to end.", ended: false });
        else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      });
    return () => {
      showing = false;
    };
  }, []);

  async function end() {
    if (!shift || ending) return;
    setEnding(true);
    setProblem(null);
    const result = await window.kvnsys.closeShift(counted, note).catch((error: unknown): ShiftResult => somethingWentWrong(error));
    setEnding(false);
    if (result.ok) onEnded(result.shift);
    else setProblem({ message: result.message, ended: result.reason === 'ended' });
  }

  return (
    <FormPanel
      title="End shift"
      onClose={onClose}
      onSubmit={() => void end()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={!shift || ending}>
            {ending ? 'Ending…' : 'End shift'}
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
      {shift && (
        <div className="mt-4 first:mt-0">
          <dl className="mb-5 grid grid-cols-[1fr_auto] gap-y-1 text-[15px]">
            <dt>Cash at the start</dt>
            <dd className="text-right">
              <Pesos centavos={shift.openingCash} />
            </dd>
            <dt>Cash sales ({shift.receipts === 1 ? '1 receipt' : `${shift.receipts} receipts`})</dt>
            <dd className="text-right">
              <Pesos centavos={shift.cashSales} />
            </dd>
          </dl>
          <TextField label="Cash counted in the drawer" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus autoComplete="off" />
          <TextField size="compact" label="Note (optional)" placeholder="Such as why the drawer is short" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </FormPanel>
  );
}
