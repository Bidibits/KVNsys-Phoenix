import type {
  Product,
  ProductChoice,
  ProductChoices,
  ProductForm,
  ProductFormResult,
  ProductResult,
  ProductSortingField,
  ProductStatus,
} from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField, TickBox } from '@kvnsys/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { PictureChoice } from '../../desktop/bridge.js';

/** Every status, with what it means. Naming them by ProductStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: can be sold',
  Inactive: 'Inactive: kept, but not sold',
} satisfies Record<ProductStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

/** The four pickers, in the order they show, with their labels. */
const Pickers: [ProductSortingField, string][] = [
  ['categoryId', 'Category'],
  ['brandId', 'Brand'],
  ['manufacturerId', 'Manufacturer'],
  ['supplierId', 'Supplier'],
];
const withNone = (choices: ProductChoice[]) => [{ value: '', label: '(none)' }, ...choices];

type TextBox = Exclude<keyof ProductForm, 'tracksStock' | 'hasWarranty'>;

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/** A column of the form, under a small heading. */
function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-3 text-[14px] font-semibold text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Adding a product (id null) or changing one, in a wide panel from the right, laid out as
 * design-direction.md says: what the product is on the left (its names and where it's sorted),
 * everything else on the right (its picture, prices, stock and warranty). The boxes hold exactly
 * what's typed; what it means is decided by the client engine and the server, which also say
 * what to fix. Editing starts from the product as the server has it now, picture included.
 */
export function ProductFormPanel({
  id,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  id: string | null;
  onClose: () => void;
  onSaved: (product: Product) => void;
  onSignInAgain: () => void;
}) {
  const [form, setForm] = useState<ProductForm | null>(null);
  const [choices, setChoices] = useState<ProductChoices | null>(null);
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const name = useRef<HTMLInputElement>(null);
  const notice = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .productForm(id)
      .catch((error: unknown): ProductFormResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok) {
          setForm(answer.form);
          setChoices(answer.choices);
        } else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      });
    return () => {
      showing = false;
    };
  }, [id]);

  // A long form scrolls; a refusal shows above it, so bring it into view.
  useEffect(() => {
    if (problem) notice.current?.scrollIntoView({ block: 'nearest' });
  }, [problem]);

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys.saveProduct(id, form).catch((error: unknown): ProductResult => somethingWentWrong(error));
    setSaving(false);
    if (answer.ok) onSaved(answer.product);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  async function choosePicture() {
    if (choosing) return;
    setChoosing(true);
    const chosen = await window.kvnsys
      .chooseProductPicture()
      .catch((error: unknown): PictureChoice => ({ ok: false, reason: 'unreadable', message: somethingWentWrong(error).message }));
    setChoosing(false);
    if (chosen.ok) {
      setProblem(null);
      setForm((current) => current && { ...current, picture: chosen.picture });
    } else if (chosen.reason === 'unreadable') setProblem({ message: chosen.message, ended: false });
  }

  const typed = (field: TextBox) => (value: string) => setForm((current) => current && { ...current, [field]: value });
  const box = (field: TextBox, label: string, extra: { inputMode?: 'decimal' | 'numeric'; disabled?: boolean } = {}) =>
    form && <TextField size="compact" label={label} value={form[field]} onChange={(e) => typed(field)(e.target.value)} {...extra} />;

  /** A barcode scanner types the code and presses Enter: that moves on to the name, rather than saving. */
  function scannerEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    name.current?.focus();
  }

  return (
    <FormPanel
      wide
      title={id === null ? 'New product' : 'Edit product'}
      onClose={onClose}
      onSubmit={() => void save()}
      actions={
        <>
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={!form || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div ref={notice}>
        {problem && <Notice tone="problem">{problem.message}</Notice>}
        {problem?.ended && (
          <Button type="button" size="compact" className="mt-3" onClick={onSignInAgain}>
            Sign in again
          </Button>
        )}
      </div>
      {!form && !problem && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {form && choices && (
        <div className="mt-4 grid grid-cols-2 gap-x-8 first:mt-0">
          <Column title="What it is">
            <TextField size="compact" label="Code" value={form.code} onChange={(e) => typed('code')(e.target.value)} autoFocus />
            <TextField
              size="compact"
              label="Barcode (if it has one)"
              value={form.barcode}
              onChange={(e) => typed('barcode')(e.target.value)}
              onKeyDown={scannerEnter}
            />
            <TextField ref={name} size="compact" label="Name" value={form.name} onChange={(e) => typed('name')(e.target.value)} />
            {Pickers.map(([field, label]) => (
              <SelectField key={field} label={label} value={form[field]} options={withNone(choices[field])} onChange={typed(field)} />
            ))}
            {box('unitOfMeasure', 'Unit (like pc, box, pack)')}
            {box('description', 'Description (if any)')}
          </Column>
          <Column title="Picture, prices and the rest">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                {form.picture ? (
                  <img src={`data:image/jpeg;base64,${form.picture}`} alt="The product's picture" className="size-full object-contain" />
                ) : (
                  <span className="text-[14px] text-muted-foreground">No picture</span>
                )}
              </div>
              <div className="flex flex-col items-start gap-2">
                <Button type="button" variant="secondary" size="compact" onClick={() => void choosePicture()} disabled={choosing}>
                  {form.picture ? 'Change picture…' : 'Choose picture…'}
                </Button>
                {form.picture && (
                  <Button type="button" variant="secondary" size="compact" onClick={() => typed('picture')('')}>
                    Remove picture
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3">
              {box('retailPrice', 'Price (pesos)', { inputMode: 'decimal' })}
              {box('costPrice', 'Cost (if known)', { inputMode: 'decimal' })}
              {box('promoPrice', 'Promo price (if any)', { inputMode: 'decimal' })}
              <div />
              {box('wholesalePrice', 'Wholesale price (if any)', { inputMode: 'decimal' })}
              {box('wholesaleQuantity', 'From (pieces)', { inputMode: 'numeric' })}
            </div>
            <TickBox
              label="Selling it takes it out of stock"
              checked={form.tracksStock}
              onChange={(tracksStock) => setForm({ ...form, tracksStock })}
            />
            <div className="mt-2 grid grid-cols-2 items-end gap-x-3">
              <div className="mb-3">
                <TickBox label="It has a warranty" checked={form.hasWarranty} onChange={(hasWarranty) => setForm({ ...form, hasWarranty })} />
              </div>
              {box('warrantyMonths', 'Warranty (months)', { inputMode: 'numeric', disabled: !form.hasWarranty })}
            </div>
            <SelectField label="Status" value={form.status} options={StatusOptions} onChange={typed('status')} />
          </Column>
        </div>
      )}
    </FormPanel>
  );
}
