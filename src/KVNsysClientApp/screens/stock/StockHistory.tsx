import type { MovementType, ProductStockResult, RecordedMovement, StockItem } from '@kvnsys/client';
import { Button, Notice, Pieces, RecordTable, ShopTime, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

/** What each kind of movement is called on screen. Naming them by MovementType makes the build fail if one is missing. */
const What = {
  from_supplier: 'Received',
  to_customer: 'Sold',
  adjustment: 'Count put right',
} satisfies Record<MovementType, string>;

const Columns: Column<RecordedMovement>[] = [
  {
    heading: 'When',
    cell: (line) => (
      <span className="whitespace-nowrap">
        <ShopTime at={line.createdAt} />
      </span>
    ),
  },
  { heading: 'What', cell: (line) => What[line.type] },
  { heading: 'Pieces', cell: (line) => <Pieces count={line.quantityChange} signed />, align: 'right' },
  { heading: 'In stock after', cell: (line) => <Pieces count={line.resultingOnHand} />, align: 'right' },
  // No name: saved by someone whose account is at another shop, such as HQ.
  { heading: 'Who', cell: (line) => (line.createdBy ? (line.createdBy.name ?? 'Someone from another shop') : '') },
  { heading: 'Note', cell: (line) => <span className="block max-w-[320px] py-2 leading-snug">{line.note ?? ''}</span> },
];

/** One product's stock and its movements, newest first, in place of the list until Back to stock. */
export function StockHistory({ item, onBack, onSignInAgain }: { item: StockItem; onBack: () => void; onSignInAgain: () => void }) {
  const [result, setResult] = useState<ProductStockResult | null>(null);
  const productId = item.product.id;

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .productStock(productId)
      .catch((error: unknown): ProductStockResult => ({
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
  }, [productId]);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <Button type="button" variant="secondary" size="compact" onClick={onBack}>
          Back to stock
        </Button>
        <h2 className="text-[19px] font-semibold">
          {item.product.name} <span className="font-normal text-muted-foreground">{item.product.code}</span>
        </h2>
        {result?.ok && (
          <p className="ml-auto text-[17px]">
            In stock: <Pieces count={result.stock} />
          </p>
        )}
      </div>
      {!result && (
        <p role="status" className="text-[17px] text-muted-foreground">
          Loading movements…
        </p>
      )}
      {result && !result.ok && (
        <div className="max-w-xl">
          <Notice tone="problem">{result.message}</Notice>
          {result.reason === 'ended' && (
            <Button type="button" size="compact" className="mt-4" onClick={onSignInAgain}>
              Sign in again
            </Button>
          )}
        </div>
      )}
      {result?.ok && result.movements.length === 0 && <p className="text-[15px] text-muted-foreground">Nothing has moved here yet.</p>}
      {result?.ok && result.movements.length > 0 && (
        <>
          <RecordTable label="Movements" columns={Columns} rows={result.movements} rowKey={(line) => line.id} />
          {result.more && (
            <p className="text-[15px] text-muted-foreground">
              Showing the newest {result.movements.length}. Older ones aren't shown yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
