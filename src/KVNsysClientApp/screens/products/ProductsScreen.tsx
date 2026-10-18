import type { AccessName, Product, ProductListResult, SignedInUser } from '@kvnsys/client';
import { Button, Notice, Pesos, RecordTable, StatusLabel, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { ProductFormPanel } from './ProductFormPanel';

const ManageRight: AccessName = 'products.manage';

const Columns: Column<Product>[] = [
  { heading: 'Code', cell: (product) => product.code },
  { heading: 'Barcode', cell: (product) => product.barcode ?? '' },
  { heading: 'Name', cell: (product) => product.name },
  { heading: 'Price', cell: (product) => <Pesos centavos={product.retailPrice} />, align: 'right' },
  { heading: 'Status', cell: (product) => <StatusLabel status={product.status} /> },
];

/**
 * Every product. Someone whose role may manage products also gets Add, and Edit on each row, which
 * open the form panel; after a save the list is asked for again, so it shows what the server has.
 * The list is asked for after the screen is on show, never while it's being built, so a server
 * that's slow or down can't freeze the window.
 */
export function ProductsScreen({ user, onSignInAgain }: { user: SignedInUser; onSignInAgain: () => void }) {
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<ProductListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  /** Opens the form: for a new product (null) or one already in the list. */
  function open(id: string | null) {
    setSaved(null);
    setEditing({ id });
  }

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
  }, [reloads]);

  const columns: Column<Product>[] = mayManage
    ? [
        ...Columns,
        {
          heading: 'Change',
          hiddenHeading: true,
          align: 'right',
          cell: (product) => (
            <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`Edit ${product.name}`} onClick={() => open(product.id)}>
              Edit
            </Button>
          ),
        },
      ]
    : Columns;

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
          <Button type="button" size="compact" className="mt-4" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
      </div>
    );
  }

  const count = result.products.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <p className="text-[15px] text-muted-foreground">{count === 0 ? 'No products yet.' : count === 1 ? '1 product' : `${count} products`}</p>
        {mayManage && (
          <Button type="button" size="compact" className="ml-auto" onClick={() => open(null)}>
            Add product
          </Button>
        )}
      </div>
      {saved && <Notice tone="good">{saved}</Notice>}
      {/* Fits its rows; once there are more than the window holds, it shrinks to fit and scrolls. */}
      {count > 0 && <RecordTable label="Products" columns={columns} rows={result.products} rowKey={(product) => product.id} />}
      {editing && (
        <ProductFormPanel
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={(product) => {
            setEditing(null);
            setSaved(`Saved ${product.name}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
