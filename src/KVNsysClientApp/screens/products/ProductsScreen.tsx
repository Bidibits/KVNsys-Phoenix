import type { AccessName, ProductRow, ProductRowsResult, SignedInUser } from '@kvnsys/client';
import { Button, historyColumns, Notice, Pesos, RecordTable, StatusLabel, TextOrDash, useToast, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { ProductFormPanel } from './ProductFormPanel';
import { ProductThumbnail } from './ProductThumbnail';

const ManageRight: AccessName = 'products.manage';

/** An amount, or a dash for none. */
const PesosOrDash = ({ centavos }: { centavos: number | null }) => (centavos === null ? <TextOrDash text={null} /> : <Pesos centavos={centavos} />);

/**
 * Every column of the products table, then its history, as Beta's grids showed a table. The
 * picture's column depends on which time the list was asked for, so a changed picture shows. The
 * cost is shown only to someone who may change products: they see it on the form anyway.
 */
const columnsFor = (generation: number, showCost: boolean): Column<ProductRow>[] => [
  {
    heading: 'Picture',
    hiddenHeading: true,
    width: '4.5rem',
    cell: (product) => <ProductThumbnail id={product.id} name={product.name} hasPicture={product.hasPicture} generation={generation} />,
  },
  { heading: 'Code', width: '8rem', cell: (product) => product.code, sortBy: (product) => product.code },
  { heading: 'Barcode', width: '10rem', cell: (product) => <TextOrDash text={product.barcode} />, sortBy: (product) => product.barcode },
  { heading: 'Name', width: '16rem', cell: (product) => product.name, sortBy: (product) => product.name },
  { heading: 'Category', width: '14rem', cell: (product) => <TextOrDash text={product.categoryPath} />, sortBy: (product) => product.categoryPath },
  { heading: 'Brand', width: '10rem', cell: (product) => <TextOrDash text={product.brandName} />, sortBy: (product) => product.brandName },
  { heading: 'Supplier', width: '11rem', cell: (product) => <TextOrDash text={product.supplierName} />, sortBy: (product) => product.supplierName },
  { heading: 'Manufacturer', width: '11rem', cell: (product) => <TextOrDash text={product.manufacturerName} />, sortBy: (product) => product.manufacturerName },
  { heading: 'Unit', width: '6rem', cell: (product) => <TextOrDash text={product.unitOfMeasure} />, sortBy: (product) => product.unitOfMeasure },
  { heading: 'Price', width: '8rem', align: 'right', cell: (product) => <Pesos centavos={product.retailPrice} />, sortBy: (product) => product.retailPrice },
  { heading: 'Promo price', width: '8.5rem', align: 'right', cell: (product) => <PesosOrDash centavos={product.promoPrice} />, sortBy: (product) => product.promoPrice },
  {
    heading: 'Wholesale price',
    width: '9.5rem',
    align: 'right',
    cell: (product) => <PesosOrDash centavos={product.wholesalePrice} />,
    sortBy: (product) => product.wholesalePrice,
  },
  {
    heading: 'Wholesale from',
    width: '9rem',
    align: 'right',
    cell: (product) => (product.wholesaleQuantity === null ? <TextOrDash text={null} /> : `${product.wholesaleQuantity} pcs`),
    sortBy: (product) => product.wholesaleQuantity,
  },
  ...(showCost
    ? [{ heading: 'Cost', width: '8rem', align: 'right' as const, cell: (product: ProductRow) => <Pesos centavos={product.costPrice} />, sortBy: (product: ProductRow) => product.costPrice }]
    : []),
  { heading: 'Tracks stock', width: '8rem', cell: (product) => (product.tracksStock ? 'Yes' : 'No'), sortBy: (product) => (product.tracksStock ? 'Yes' : 'No') },
  {
    heading: 'Warranty',
    width: '8rem',
    cell: (product) => (product.hasWarranty ? `${product.warrantyMonths} ${product.warrantyMonths === 1 ? 'month' : 'months'}` : 'None'),
    sortBy: (product) => (product.hasWarranty ? product.warrantyMonths : 0),
  },
  { heading: 'Status', width: '8rem', cell: (product) => <StatusLabel status={product.status} />, sortBy: (product) => product.status },
  { heading: 'Description', width: '18rem', cell: (product) => <TextOrDash text={product.description} />, sortBy: (product) => product.description },
  ...historyColumns<ProductRow>((product) => product.history),
];

/** What the search box finds a product by: what the list shows of it, its category path included, so "Appliances" finds the fans too. */
const searchText = (product: ProductRow) =>
  [
    product.code,
    product.barcode ?? '',
    product.name,
    product.categoryPath ?? '',
    product.brandName ?? '',
    product.supplierName ?? '',
    product.manufacturerName ?? '',
    product.description ?? '',
  ].join(' ');

/**
 * Every product, with its picture, category and brand. Someone whose role may manage products also
 * gets Add, and Edit on each row, which open the form panel; after a save the list is asked for
 * again, so it shows what the server has. The list is asked for after the screen is on show, never
 * while it's being built, so a server that's slow or down can't freeze the window.
 */
export function ProductsScreen({ user, search, onSignInAgain }: { user: SignedInUser; search: string; onSignInAgain: () => void }) {
  const toast = useToast();
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<ProductRowsResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  /** Opens the form: for a new product (null) or one already in the list. */
  function open(id: string | null) {
    setEditing({ id });
  }

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listProducts()
      .catch((error: unknown): ProductRowsResult => ({
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

  const columns: Column<ProductRow>[] = mayManage
    ? [
        ...columnsFor(reloads, true),
        {
          heading: 'Change',
          hiddenHeading: true,
          align: 'right',
          width: '5.5rem',
          pinned: true,
          cell: (product) => (
            <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`Edit ${product.name}`} onClick={() => open(product.id)}>
              Edit
            </Button>
          ),
        },
      ]
    : columnsFor(reloads, false);

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
      {/* Fits its rows; once there are more than the window holds, it shrinks to fit and scrolls. */}
      {count > 0 && <RecordTable label="Products" wide columns={columns} rows={result.products} filter={search} searchText={searchText} rowKey={(product) => product.id} />}
      {editing && (
        <ProductFormPanel
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={(product) => {
            setEditing(null);
            toast(`Saved ${product.name}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
