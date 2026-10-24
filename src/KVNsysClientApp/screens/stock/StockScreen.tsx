import type { AccessName, SignedInUser, StockItem, StockListResult } from '@kvnsys/client';
import { Button, Notice, Pieces, RecordTable, StatusLabel, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { CountPanel } from './CountPanel';
import { ReceivePanel } from './ReceivePanel';
import { StockHistory } from './StockHistory';

const ReceiveRight: AccessName = 'stock.receive';
const AdjustRight: AccessName = 'stock.adjust';

const Columns: Column<StockItem>[] = [
  { heading: 'Code', cell: (item) => item.product.code },
  { heading: 'Name', cell: (item) => item.product.name },
  { heading: 'Status', cell: (item) => <StatusLabel status={item.product.status} /> },
  { heading: 'In stock', cell: (item) => <Pieces count={item.stock} />, align: 'right' },
];

/**
 * Every product with how many this shop has. Each row opens its History; someone whose role may
 * receive goods gets Receive stock, which takes in a whole delivery, and someone who may put counts
 * right gets Adjust on each row. After a save the list is asked for again, so it shows what the
 * server has. The list is asked for after the screen is on show, never while it's being built.
 */
export function StockScreen({ user, onSignInAgain }: { user: SignedInUser; onSignInAgain: () => void }) {
  const mayReceive = user.rights.includes(ReceiveRight);
  const mayAdjust = user.rights.includes(AdjustRight);
  const [result, setResult] = useState<StockListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [receiving, setReceiving] = useState(false);
  const [counting, setCounting] = useState<StockItem | null>(null);
  const [history, setHistory] = useState<StockItem | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listStock()
      .catch((error: unknown): StockListResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
      }))
      .then((answer) => {
        if (showing) setResult(answer);
      });
    return () => {
      showing = false;
    };
  }, [reloads]);

  function done(message: string) {
    setReceiving(false);
    setCounting(null);
    setSaved(message);
    setReloads((n) => n + 1);
  }

  if (history) {
    return <StockHistory item={history} onBack={() => setHistory(null)} onSignInAgain={onSignInAgain} />;
  }

  const columns: Column<StockItem>[] = [
    ...Columns,
    {
      heading: 'Actions',
      hiddenHeading: true,
      align: 'right',
      cell: (item) => (
        <span className="inline-flex gap-2">
          <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`History of ${item.product.name}`} onClick={() => setHistory(item)}>
            History
          </Button>
          {mayAdjust && (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="h-8 px-3"
              aria-label={`Adjust ${item.product.name}`}
              onClick={() => {
                setSaved(null);
                setCounting(item);
              }}
            >
              Adjust
            </Button>
          )}
        </span>
      ),
    },
  ];

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading stock…
      </p>
    );
  }
  if (!result.ok) {
    return (
      <div className="max-w-xl">
        <Notice tone="problem">{result.message}</Notice>
        {result.reason === 'ended' && (
          <Button type="button" size="compact" className="mt-4" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
      </div>
    );
  }

  const count = result.items.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <p className="text-[15px] text-muted-foreground">
          {count === 0 ? 'No products yet.' : `${count === 1 ? '1 product' : `${count} products`} at ${result.shop.name}`}
        </p>
        {mayReceive && count > 0 && (
          <Button
            type="button"
            size="compact"
            className="ml-auto"
            onClick={() => {
              setSaved(null);
              setReceiving(true);
            }}
          >
            Receive stock
          </Button>
        )}
      </div>
      {saved && <Notice tone="good">{saved}</Notice>}
      {/* Fits its rows; once there are more than the window holds, it shrinks to fit and scrolls. */}
      {count > 0 && <RecordTable label="Stock" columns={columns} rows={result.items} rowKey={(item) => item.product.id} />}
      {receiving && (
        <ReceivePanel
          onClose={() => setReceiving(false)}
          onSaved={(lines) => done(`Saved the delivery: ${lines === 1 ? '1 line' : `${lines} lines`}.`)}
          onSignInAgain={onSignInAgain}
        />
      )}
      {counting && (
        <CountPanel
          item={counting}
          onClose={() => setCounting(null)}
          onSaved={(stock) => done(`${counting.product.name} is now ${stock.toLocaleString('en-US')}.`)}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
