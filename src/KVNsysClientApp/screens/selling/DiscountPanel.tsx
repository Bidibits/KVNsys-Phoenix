import type { DiscountKind, StatutoryDiscount, TillResult, TillView } from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField } from '@kvnsys/ui';
import { useState } from 'react';
import { DiscountChoices } from './discounts';

const KindOptions = Object.entries(DiscountChoices).map(([value, label]) => ({ value, label }));

/**
 * The senior/PWD discount, in a panel from the right: which one, and the ID's number and name,
 * which the receipt keeps. A sale that already has one can have it changed or taken off.
 */
export function DiscountPanel({
  current,
  onClose,
  onDone,
  onSignInAgain,
}: {
  current: StatutoryDiscount | null;
  onClose: () => void;
  onDone: (till: TillView) => void;
  onSignInAgain: () => void;
}) {
  const [kind, setKind] = useState<string>(current?.kind ?? 'senior');
  const [idNumber, setIdNumber] = useState(current?.idNumber ?? '');
  const [customerName, setCustomerName] = useState(current?.customerName ?? '');
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  async function give(discount: StatutoryDiscount | null) {
    if (saving) return;
    setSaving(true);
    const result = await window.kvnsys.setSaleDiscount(discount).catch(
      (error: unknown): TillResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
      }),
    );
    setSaving(false);
    if (result.ok) onDone(result.till);
    else setProblem({ message: result.message, ended: result.reason === 'ended' });
  }

  return (
    <FormPanel
      title="Senior/PWD discount"
      onClose={onClose}
      onSubmit={() => void give({ kind: kind as DiscountKind, idNumber, customerName })}
      actions={
        <>
          {current && (
            <Button type="button" variant="secondary" size="compact" className="mr-auto" disabled={saving} onClick={() => void give(null)}>
              Take it off
            </Button>
          )}
          <Button type="button" variant="secondary" size="compact" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="compact" disabled={saving}>
            Give 20% off
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
      <div className="mt-4 first:mt-0">
        <SelectField label="Discount" value={kind} options={KindOptions} onChange={setKind} />
        <TextField size="compact" label="ID number" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} autoFocus autoComplete="off" />
        <TextField size="compact" label="Name on the ID" value={customerName} onChange={(e) => setCustomerName(e.target.value)} autoComplete="off" />
      </div>
    </FormPanel>
  );
}
