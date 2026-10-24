import type { ShiftResult, ShiftView } from '@kvnsys/client';
import { Button, Notice, Pesos, ShopTime, TextField } from '@kvnsys/ui';
import { useState } from 'react';

/** Before the first sale: the cash counted into the drawer starts the cashier's shift. */
export function StartShift({ onStarted, onSignInAgain }: { onStarted: (shift: ShiftView) => void; onSignInAgain: () => void }) {
  const [cash, setCash] = useState('');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    if (starting) return;
    setStarting(true);
    setProblem(null);
    const result = await window.kvnsys.openShift(cash).catch(
      (error: unknown): ShiftResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    setStarting(false);
    if (result.ok) onStarted(result.shift);
    else setProblem({ message: result.message, ended: result.reason === 'ended' });
  }

  return (
    <section aria-label="Start your shift" className="mx-auto mt-4 max-w-[540px] rounded-lg border border-border bg-card px-8 py-7">
      <h2 className="text-[26px] leading-tight font-semibold">Start your shift</h2>
      <p className="mt-1 mb-5 text-[17px] text-muted-foreground">Count the cash in the drawer before the first sale.</p>
      <div>
        {problem && <Notice tone="problem">{problem.message}</Notice>}
        {problem?.ended && (
          <Button type="button" size="compact" className="mt-3" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
        <form
          noValidate
          className="mt-4 first:mt-0"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <TextField label="Cash in the drawer" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} autoFocus autoComplete="off" />
          <Button type="submit" disabled={starting}>
            {starting ? 'Starting…' : 'Start shift'}
          </Button>
        </form>
      </div>
    </section>
  );
}

function Row({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <>
      <dt className={strong ? 'pt-2 font-semibold' : undefined}>{label}</dt>
      <dd className={strong ? 'pt-2 text-right font-semibold' : 'text-right'} aria-label={label}>
        {children}
      </dd>
    </>
  );
}

/** A shift's report once its drawer is counted: what came in, what should be there, and the difference. */
export function ShiftReport({ shift, onDone }: { shift: ShiftView; onDone: () => void }) {
  const short = (shift.variance ?? 0) < 0;
  return (
    <div className="flex h-full gap-6 overflow-auto">
      <article aria-label="Shift report" className="w-[440px] shrink-0 self-start rounded-lg border border-border bg-field p-6 text-[15px] shadow-sm">
        <header className="mb-4 text-center">
          <p className="text-lg font-semibold">Shift {shift.code}</p>
          <p className="text-muted-foreground">
            <ShopTime at={shift.openedAt} /> to {shift.closedAt && <ShopTime at={shift.closedAt} show="time" />}
          </p>
          {shift.openedBy && <p className="text-muted-foreground">Cashier: {shift.openedBy}</p>}
        </header>
        <dl className="grid grid-cols-[1fr_auto] gap-y-1">
          <Row label="Cash at the start">
            <Pesos centavos={shift.openingCash} />
          </Row>
          <Row label={`Cash sales (${shift.receipts === 1 ? '1 receipt' : `${shift.receipts} receipts`})`}>
            <Pesos centavos={shift.cashSales} />
          </Row>
          <Row label="Discounts given">
            <Pesos centavos={shift.discounts} />
          </Row>
          <Row label="Should be in the drawer" strong>
            <Pesos centavos={shift.expectedCash} />
          </Row>
          <Row label="Counted">{shift.countedCash !== null && <Pesos centavos={shift.countedCash} />}</Row>
        </dl>
        {shift.note && <p className="mt-3 border-t border-dashed border-border pt-3">{shift.note}</p>}
      </article>
      <div className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-lg">The drawer is</p>
        <p className={`text-5xl font-bold ${short ? 'text-danger-ink' : ''}`} aria-label="The drawer is">
          {shift.varianceInWords}
        </p>
        <Button type="button" className="mt-4 max-w-xs" onClick={onDone} autoFocus>
          Done
        </Button>
      </div>
    </div>
  );
}
