import type { Product, ProductForm, ProductFormResult, ProductResult, ProductStatus } from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField } from '@kvnsys/ui';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

/** Every status, with what it means. Naming them by ProductStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: can be sold',
  Inactive: 'Inactive: kept, but not sold',
} satisfies Record<ProductStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/**
 * Adding a product (id null) or changing one, in a panel from the right. The boxes hold exactly
 * what's typed; what it means is decided by the client engine and the server, which also say what
 * to fix. Editing starts from the product as the server has it now, not from the list's row.
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
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const name = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .productForm(id)
      .catch((error: unknown): ProductFormResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok) setForm(answer.form);
        else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      });
    return () => {
      showing = false;
    };
  }, [id]);

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys.saveProduct(id, form).catch((error: unknown): ProductResult => somethingWentWrong(error));
    setSaving(false);
    if (answer.ok) onSaved(answer.product);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  const typed = (field: keyof ProductForm) => (value: string) => setForm((current) => current && { ...current, [field]: value });

  /** A barcode scanner types the code and presses Enter: that moves on to the name, rather than saving. */
  function scannerEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    name.current?.focus();
  }

  return (
    <FormPanel
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
      {problem && <Notice tone="problem">{problem.message}</Notice>}
      {problem?.ended && (
        <Button type="button" size="compact" className="mt-3" onClick={onSignInAgain}>
          Sign in again
        </Button>
      )}
      {!form && !problem && (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )}
      {form && (
        <div className="mt-4 first:mt-0">
          <TextField size="compact" label="Code" value={form.code} onChange={(e) => typed('code')(e.target.value)} autoFocus />
          <TextField
            size="compact"
            label="Barcode (if it has one)"
            value={form.barcode}
            onChange={(e) => typed('barcode')(e.target.value)}
            onKeyDown={scannerEnter}
          />
          <TextField ref={name} size="compact" label="Name" value={form.name} onChange={(e) => typed('name')(e.target.value)} />
          <TextField
            size="compact"
            label="Price (pesos)"
            inputMode="decimal"
            value={form.retailPrice}
            onChange={(e) => typed('retailPrice')(e.target.value)}
          />
          <SelectField label="Status" value={form.status} options={StatusOptions} onChange={typed('status')} />
        </div>
      )}
    </FormPanel>
  );
}
