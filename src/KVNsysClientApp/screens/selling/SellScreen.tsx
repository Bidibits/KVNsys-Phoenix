import type { CurrentShiftResult, PricedLine, SaleResult, ShiftView, TillResult, TillView } from '@kvnsys/client';
import { Button, ConfirmDialog, Notice, Pesos, RecordTable, ShopTime, TextField, type Column } from '@kvnsys/ui';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DiscountPanel } from './DiscountPanel';
import { EndShiftPanel } from './EndShiftPanel';
import { ShiftReport, StartShift } from './ShiftViews';
import { DiscountChoices } from './discounts';
import { PriceBasisWords } from './prices';
import { PayPanel } from './PayPanel';
import { ReceiptView } from './ReceiptView';

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

type Paid = Extract<SaleResult, { ok: true }>;

/**
 * Selling, behind the cashier's shift: without one open, Start shift comes first (the cash in the
 * drawer); with one, the till, and End shift, which counts the drawer and shows the shift's report.
 */
export function SellScreen({ onSignInAgain }: { onSignInAgain: () => void }) {
  const [shift, setShift] = useState<CurrentShiftResult | null>(null);
  const [ended, setEnded] = useState<ShiftView | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .currentShift()
      .catch((error: unknown): CurrentShiftResult => somethingWentWrong(error))
      .then((answer) => {
        if (showing) setShift(answer);
      });
    return () => {
      showing = false;
    };
  }, []);

  if (ended) return <ShiftReport shift={ended} onDone={() => (setEnded(null), setShift({ ok: true, shift: null }))} />;
  if (!shift) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading your shift…
      </p>
    );
  }
  if (!shift.ok) {
    return (
      <div className="max-w-xl">
        <Notice tone="problem">{shift.message}</Notice>
        {shift.reason === 'ended' && (
          <Button type="button" size="compact" className="mt-4" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
      </div>
    );
  }
  if (!shift.shift) return <StartShift onStarted={(started) => setShift({ ok: true, shift: started })} onSignInAgain={onSignInAgain} />;
  return <SaleArea shift={shift.shift} onShiftEnded={setEnded} onSignInAgain={onSignInAgain} />;
}

/**
 * Ringing up a sale, keyboard first (design-direction.md, part 2): the code box always has the
 * cursor, and a scan or Enter adds one of the product. The sale itself, its prices and totals, is
 * kept by the till on the desktop side; this shows it and passes along what the cashier did. Once
 * paid, the receipt shows in place of the sale until New sale.
 */
function SaleArea({
  shift,
  onShiftEnded,
  onSignInAgain,
}: {
  shift: ShiftView;
  onShiftEnded: (shift: ShiftView) => void;
  onSignInAgain: () => void;
}) {
  const [till, setTill] = useState<TillView | null>(null);
  const [ending, setEnding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [discounting, setDiscounting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState<Paid | null>(null);
  const codeBox = useRef<HTMLInputElement>(null);
  /** Codes scanned or typed and not yet looked up, oldest first, and whether they're being looked up now. */
  const scans = useRef<string[]>([]);
  const scanning = useRef(false);

  function show(result: TillResult): boolean {
    if (result.ok) {
      setTill(result.till);
      setProblem(null);
    } else {
      setProblem({ message: result.message, ended: result.reason === 'ended' });
    }
    return result.ok;
  }

  /** Does one thing to the sale, then gives the cursor back to the code box. */
  async function change(work: () => Promise<TillResult>): Promise<boolean> {
    setBusy(true);
    const result = await work().catch((error: unknown): TillResult => somethingWentWrong(error));
    setBusy(false);
    const done = show(result);
    codeBox.current?.focus();
    return done;
  }

  useEffect(() => {
    void change(() => window.kvnsys.till());
  }, []);

  /**
   * Takes what's in the box as one scan, and empties the box for the next. A scanner can send the
   * next code before this one is found (two cans of the same sardines, quickly), so every scan
   * waits its turn and none is lost: they're looked up one at a time, in the order they came.
   */
  function scan() {
    if (!code.trim()) return;
    scans.current.push(code);
    setCode('');
    void lookUpScans();
  }

  async function lookUpScans() {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    let refused: { code: string; message: string; ended: boolean } | null = null;
    for (let next = scans.current.shift(); next !== undefined; next = scans.current.shift()) {
      const result = await window.kvnsys.scanForSale(next).catch((error: unknown): TillResult => somethingWentWrong(error));
      if (result.ok) setTill(result.till);
      else refused = { code: next, message: result.message, ended: result.reason === 'ended' };
    }
    scanning.current = false;
    setBusy(false);
    if (refused) {
      setProblem({ message: refused.message, ended: refused.ended });
      // Back in the box, selected, unless something new is being typed: the next scan replaces it.
      const { code: refusedCode } = refused;
      flushSync(() => setCode((typed) => (typed === '' ? refusedCode : typed)));
      if (codeBox.current?.value === refusedCode) codeBox.current.select();
    } else setProblem(null);
    codeBox.current?.focus();
  }

  function newSale() {
    setPaid(null);
    void change(() => window.kvnsys.till());
  }

  if (paid) return <ReceiptView sale={paid} onNewSale={newSale} />;

  const columns: Column<PricedLine>[] = [
    {
      heading: 'Item',
      cell: (line) => (
        <span className="block py-1 leading-tight">
          {line.name}
          <span className="block text-[14px] text-muted-foreground">{line.code}</span>
        </span>
      ),
    },
    {
      heading: 'Price',
      align: 'right',
      // A promo or wholesale price says so under it, so the cashier can tell the customer why it's lower.
      cell: (line) => (
        <span className="block py-1 leading-tight whitespace-nowrap">
          <Pesos centavos={line.unitPrice} />
          {PriceBasisWords[line.priceBasis] && <span className="block text-[14px] text-success-foreground">{PriceBasisWords[line.priceBasis]}</span>}
        </span>
      ),
    },
    {
      heading: 'Qty',
      align: 'right',
      cell: (line) => (
        <span className="inline-flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="h-9 w-9 px-0 text-xl"
            aria-label={`One fewer ${line.name}`}
            disabled={busy || line.quantity <= 1}
            onClick={() => void change(() => window.kvnsys.setSaleQuantity(line.productId, line.quantity - 1))}
          >
            −
          </Button>
          <span className="w-8 text-center tabular-nums">{line.quantity}</span>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="h-9 w-9 px-0 text-xl"
            aria-label={`One more ${line.name}`}
            disabled={busy}
            onClick={() => void change(() => window.kvnsys.setSaleQuantity(line.productId, line.quantity + 1))}
          >
            +
          </Button>
        </span>
      ),
    },
    { heading: 'Total', cell: (line) => <span className="whitespace-nowrap"><Pesos centavos={line.total} /></span>, align: 'right' },
    {
      heading: 'Remove',
      hiddenHeading: true,
      align: 'right',
      cell: (line) => (
        <Button
          type="button"
          variant="secondary"
          size="compact"
          className="h-9 w-9 px-0 text-xl"
          aria-label={`Remove ${line.name}`}
          title="Remove"
          disabled={busy}
          onClick={() => void change(() => window.kvnsys.removeFromSale(line.productId))}
        >
          ×
        </Button>
      ),
    },
  ];

  const empty = !till || till.lines.length === 0;
  return (
    <div className="flex h-full gap-5">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-3 text-[15px] text-muted-foreground">
          <span>
            Shift {shift.code} · started <ShopTime at={shift.openedAt} show="time" />
          </span>
          <Button type="button" variant="secondary" size="compact" className="ml-auto h-8 px-3" disabled={busy || !empty} onClick={() => setEnding(true)}>
            End shift
          </Button>
        </div>
        <form
          noValidate
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            scan();
          }}
        >
          <div className="flex-1 [&>div]:mb-0">
            <TextField ref={codeBox} label="Scan or type a code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" />
          </div>
          {/* Never disabled while a scan is looked up: Enter in the box only works while this can be pressed. */}
          <Button type="submit" size="compact" className="h-14 px-6 text-[17px]" disabled={!code.trim()}>
            Add
          </Button>
        </form>
        {problem && <Notice tone="problem">{problem.message}</Notice>}
        {problem?.ended && (
          <Button type="button" size="compact" className="self-start" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
        {empty ? (
          <p className="text-lg text-muted-foreground">Scan a product to start a sale.</p>
        ) : (
          <RecordTable label="This sale" size="large" columns={columns} rows={till.lines} rowKey={(line) => line.productId} />
        )}
      </div>

      <aside aria-label="Totals" className="flex w-[280px] shrink-0 flex-col gap-3 rounded-lg border border-border bg-card p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-lg">
          <dt>Subtotal</dt>
          <dd className="text-right">
            <Pesos centavos={till?.subtotal ?? 0} />
          </dd>
          {till?.discount && (
            <>
              <dt>
                {DiscountChoices[till.discount.kind]} 20%
                <span className="block text-[14px] text-muted-foreground">
                  {till.discount.customerName} · {till.discount.idNumber}
                </span>
              </dt>
              <dd className="text-right">
                −<Pesos centavos={till.discountTotal} />
              </dd>
            </>
          )}
        </dl>
        <div className="border-t border-border pt-3">
          <p className="text-lg font-semibold">Total</p>
          <p className="text-right text-4xl font-bold" aria-label="Total">
            <Pesos centavos={till?.total ?? 0} />
          </p>
        </div>
        <div className="mt-auto flex flex-col">
          <Button type="button" variant="secondary" disabled={busy || empty} onClick={() => setDiscounting(true)}>
            {till?.discount ? 'Change discount' : 'Senior/PWD discount'}
          </Button>
          <Button type="button" className="mt-3" disabled={busy || empty} onClick={() => setPaying(true)}>
            Pay
          </Button>
          <Button type="button" variant="secondary" disabled={busy || empty} onClick={() => setClearing(true)}>
            Clear sale
          </Button>
        </div>
      </aside>

      {discounting && till && (
        <DiscountPanel
          current={till.discount}
          onClose={() => {
            setDiscounting(false);
            codeBox.current?.focus();
          }}
          onDone={(next) => {
            setDiscounting(false);
            show({ ok: true, till: next });
            codeBox.current?.focus();
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
      {clearing && till && (
        <ConfirmDialog
          title="Clear this sale?"
          message={`${till.lines.length === 1 ? 'Its line comes' : `All ${till.lines.length} lines come`} off, and nothing is recorded.`}
          confirmLabel="Clear sale"
          onConfirm={() => {
            setClearing(false);
            void change(() => window.kvnsys.clearSale());
          }}
          onCancel={() => {
            setClearing(false);
            codeBox.current?.focus();
          }}
        />
      )}
      {ending && (
        <EndShiftPanel
          onClose={() => {
            setEnding(false);
            codeBox.current?.focus();
          }}
          onEnded={onShiftEnded}
          onSignInAgain={onSignInAgain}
        />
      )}
      {paying && till && (
        <PayPanel
          total={till.total}
          onClose={() => {
            setPaying(false);
            codeBox.current?.focus();
          }}
          onPaid={(sale) => {
            setPaying(false);
            setPaid(sale);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
