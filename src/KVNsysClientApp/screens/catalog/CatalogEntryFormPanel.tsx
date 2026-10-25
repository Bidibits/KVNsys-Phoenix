import type {
  CatalogEntry,
  CatalogEntryForm,
  CatalogEntryFormResult,
  CatalogEntryResult,
  CatalogEntryStatus,
  CatalogList,
  CatalogListShape,
} from '@kvnsys/client';
import { Button, FormPanel, Notice, SelectField, TextField } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

/** Every status, with what it means. Naming them by CatalogEntryStatus makes the build fail if one is missing. */
const StatusChoices = {
  Active: 'Active: offered for products',
  Inactive: 'Inactive: kept, but not offered',
} satisfies Record<CatalogEntryStatus, string>;
const StatusOptions = Object.entries(StatusChoices).map(([value, label]) => ({ value, label }));

/** No parent, then each category it could sit inside. A switched-off one says so. */
const parentOptions = (parents: CatalogEntry[]) => [
  { value: '', label: '(none: at the top)' },
  ...parents.map((parent) => ({ value: parent.id, label: parent.status === 'Active' ? parent.name : `${parent.name} (switched off)` })),
];

const somethingWentWrong = (error: unknown) => ({
  ok: false as const,
  reason: 'unreachable' as const,
  message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
});

/**
 * Adding an entry to one of the catalogue's lists (id null), or changing one, in a panel from the
 * right. The fields beyond code, name, status and description come from the list's description:
 * a supplier's address, the category a category sits inside.
 */
export function CatalogEntryFormPanel({
  list,
  one,
  id,
  onClose,
  onSaved,
  onSignInAgain,
}: {
  list: CatalogList;
  /** "supplier": for the panel's title before the form arrives. */
  one: string;
  id: string | null;
  onClose: () => void;
  onSaved: (entry: CatalogEntry) => void;
  onSignInAgain: () => void;
}) {
  const [form, setForm] = useState<CatalogEntryForm | null>(null);
  const [shape, setShape] = useState<CatalogListShape | null>(null);
  const [parents, setParents] = useState<CatalogEntry[]>([]);
  const [problem, setProblem] = useState<{ message: string; ended: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .catalogEntryForm(list, id)
      .catch((error: unknown): CatalogEntryFormResult => somethingWentWrong(error))
      .then((answer) => {
        if (!showing) return;
        if (answer.ok) {
          setForm(answer.form);
          setShape(answer.shape);
          setParents(answer.parents);
        } else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
      });
    return () => {
      showing = false;
    };
  }, [list, id]);

  async function save() {
    if (!form || saving) return;
    setSaving(true);
    setProblem(null);
    const answer = await window.kvnsys.saveCatalogEntry(list, id, form).catch((error: unknown): CatalogEntryResult => somethingWentWrong(error));
    setSaving(false);
    if (answer.ok) onSaved(answer.entry);
    else setProblem({ message: answer.message, ended: answer.reason === 'ended' });
  }

  const typed = (field: keyof CatalogEntryForm) => (value: string) => setForm((current) => current && { ...current, [field]: value });

  return (
    <FormPanel
      title={id === null ? `New ${one}` : `Edit ${one}`}
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
      {form && shape && (
        <div className="mt-4 first:mt-0">
          <TextField size="compact" label="Code" value={form.code} onChange={(e) => typed('code')(e.target.value)} autoFocus />
          <TextField size="compact" label="Name" value={form.name} onChange={(e) => typed('name')(e.target.value)} />
          {shape.hasAddress && (
            <TextField size="compact" label="Address (if known)" value={form.address} onChange={(e) => typed('address')(e.target.value)} />
          )}
          {shape.hasParent && <SelectField label="Inside" value={form.parentId} options={parentOptions(parents)} onChange={typed('parentId')} />}
          <SelectField label="Status" value={form.status} options={StatusOptions} onChange={typed('status')} />
          <TextField size="compact" label="Description (if any)" value={form.description} onChange={(e) => typed('description')(e.target.value)} />
        </div>
      )}
    </FormPanel>
  );
}
