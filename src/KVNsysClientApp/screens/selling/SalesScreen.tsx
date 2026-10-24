import type { DaySalesResult, ReceiptLine, SaleResult } from '@kvnsys/client';
import { Button, Notice, Pesos, RecordTable, ShopTime, type Column } from '@kvnsys/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { DiscountChoices } from './discounts';
import { ReceiptPaper } from './ReceiptPaper';

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[15px] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold" aria-label={label}>
        {children}
      </p>
    </div>
  );
}

function Problem({ problem, onSignInAgain }: { problem: { message: string; reason: string }; onSignInAgain: () => void }) {
  return (
    <div className="max-w-xl">
      <Notice tone="problem">{problem.message}</Notice>
      {problem.reason === 'ended' && (
        <Button type="button" size="compact" className="mt-4" onClick={onSignInAgain}>
          Sign in again
        </Button>
      )}
    </div>
  );
}

/**
 * A day's sales at the shop: today unless another day is picked, what the day came to, and every
 * receipt, oldest first. View shows a receipt as it was given, in place of the list.
 */
export function SalesScreen({ search, onSignInAgain }: { search: string; onSignInAgain: () => void }) {
  const [date, setDate] = useState<string | null>(null);
  const [result, setResult] = useState<DaySalesResult | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const dayId = useId();

  useEffect(() => {
    let showing = true;
    setResult(null);
    window.kvnsys
      .daySales(date)
      .catch((error: unknown): DaySalesResult => somethingWentWrong(error))
      .then((answer) => {
        if (showing) setResult(answer);
      });
    return () => {
      showing = false;
    };
  }, [date]);

  if (viewing) return <OneReceipt id={viewing} onBack={() => setViewing(null)} onSignInAgain={onSignInAgain} />;

  const columns: Column<ReceiptLine>[] = [
    { heading: 'Receipt', cell: (receipt) => receipt.code },
    { heading: 'Time', cell: (receipt) => <ShopTime at={receipt.createdAt} show="time" /> },
    // No name when the cashier's account isn't on this server.
    { heading: 'Cashier', cell: (receipt) => receipt.cashier ?? '' },
    { heading: 'Pieces', cell: (receipt) => receipt.pieces, align: 'right' },
    { heading: 'Discount', cell: (receipt) => (receipt.discountKind ? DiscountChoices[receipt.discountKind] : '') },
    { heading: 'Total', cell: (receipt) => <Pesos centavos={receipt.total} />, align: 'right' },
    {
      heading: 'View',
      hiddenHeading: true,
      align: 'right',
      cell: (receipt) => (
        <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`View ${receipt.code}`} onClick={() => setViewing(receipt.id)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-end gap-3">
        <div className="grid gap-1.5">
          <label htmlFor={dayId} className="text-[15px] leading-none font-semibold">
            Day
          </label>
          <input
            id={dayId}
            type="date"
            value={result?.ok ? result.date : (date ?? '')}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            className="h-10 rounded-md border border-input bg-field px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <Button type="button" variant="secondary" size="compact" onClick={() => setDate(null)}>
          Today
        </Button>
        {result?.ok && <p className="ml-auto text-[15px] text-muted-foreground">{result.shop.name}</p>}
      </div>

      {!result && (
        <p role="status" className="text-[17px] text-muted-foreground">
          Loading sales…
        </p>
      )}
      {result && !result.ok && <Problem problem={result} onSignInAgain={onSignInAgain} />}
      {result?.ok && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <Figure label="Receipts">{result.totals.receipts}</Figure>
            <Figure label="Sales before discounts">
              <Pesos centavos={result.totals.subtotal} />
            </Figure>
            <Figure label="Discounts">
              <Pesos centavos={result.totals.discountTotal} />
            </Figure>
            <Figure label="Cash taken">
              <Pesos centavos={result.totals.total} />
            </Figure>
          </div>
          {result.receipts.length === 0 ? (
            <p className="text-[15px] text-muted-foreground">No sales on this day.</p>
          ) : (
            <RecordTable
              label="This day's receipts"
              columns={columns}
              rows={result.receipts}
              rowKey={(receipt) => receipt.id}
              filter={search}
              searchText={(receipt) => [receipt.code, receipt.cashier ?? ''].join(' ')}
            />
          )}
        </>
      )}
    </div>
  );
}

/** One receipt, asked for afresh, in place of the day's list until Back. */
function OneReceipt({ id, onBack, onSignInAgain }: { id: string; onBack: () => void; onSignInAgain: () => void }) {
  const [result, setResult] = useState<SaleResult | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .receipt(id)
      .catch((error: unknown): SaleResult => somethingWentWrong(error))
      .then((answer) => {
        if (showing) setResult(answer);
      });
    return () => {
      showing = false;
    };
  }, [id]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto">
      <Button type="button" variant="secondary" size="compact" className="self-start" onClick={onBack}>
        Back to the day's sales
      </Button>
      {!result && (
        <p role="status" className="text-[17px] text-muted-foreground">
          Loading the receipt…
        </p>
      )}
      {result && !result.ok && <Problem problem={result} onSignInAgain={onSignInAgain} />}
      {result?.ok && <ReceiptPaper sale={result} />}
    </div>
  );
}
