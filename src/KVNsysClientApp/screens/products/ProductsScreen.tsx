import type { Product, ProductListResult } from '@kvnsys/client';
import { Button, Notice, Pesos, RecordTable, StatusLabel, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

const Columns: Column<Product>[] = [
  { heading: 'Code', cell: (product) => product.code },
  { heading: 'Barcode', cell: (product) => product.barcode ?? '' },
  { heading: 'Name', cell: (product) => product.name },
  { heading: 'Price', cell: (product) => <Pesos centavos={product.retailPrice} />, align: 'right' },
  { heading: 'Status', cell: (product) => <StatusLabel status={product.status} /> },
];

/**
 * Every product, read-only for now: adding and changing them come with the form. The list is asked
 * for after the screen is on show, never while it's being built, so a server that's slow or down
 * can't freeze the window.
 */
export function ProductsScreen({ onSignInAgain }: { onSignInAgain: () => void }) {
  const [result, setResult] = useState<ProductListResult | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listProducts()
      .catch((error: unknown): ProductListResult => ({
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
  }, []);

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading products…
      </p>
    );
  }
  if (!result.ok) {
    return (
      <div className="max-w-xl">
        <Notice tone="problem">{result.message}</Notice>
        {result.reason === 'ended' && (
          <Button type="button" className="mt-4 w-auto px-8" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
      </div>
    );
  }
  if (result.products.length === 0) return <p className="text-[17px]">No products yet.</p>;

  const count = result.products.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[15px] text-muted-foreground">{count === 1 ? '1 product' : `${count} products`}</p>
      {/* Fits its rows; once there are more than the window holds, it shrinks to fit and scrolls. */}
      <RecordTable label="Products" columns={Columns} rows={result.products} rowKey={(product) => product.id} />
    </div>
  );
}
