import type { AccessName, CatalogEntry, CatalogList, CatalogListResult, SignedInUser } from '@kvnsys/client';
import { Button, Notice, RecordTable, StatusLabel, useToast, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { CatalogEntryFormPanel } from './CatalogEntryFormPanel';

const ManageRight: AccessName = 'products.manage';

/**
 * One of the catalogue's lists: suppliers, brands, manufacturers or categories. The list's own
 * description (which comes with it) says what its entries have, so this one screen shows any of the
 * four: a supplier's address, a category's parent. Someone whose role may manage products also gets
 * Add and Edit, which open the form panel; after a save the list is asked for again.
 */
export function CatalogListScreen({
  list,
  user,
  search,
  onSignInAgain,
}: {
  list: CatalogList;
  user: SignedInUser;
  search: string;
  onSignInAgain: () => void;
}) {
  const toast = useToast();
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<CatalogListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listCatalog(list)
      .catch((error: unknown): CatalogListResult => ({
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
  }, [list, reloads]);

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading…
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

  const { shape, entries } = result;
  const columns: Column<CatalogEntry>[] = [
    { heading: 'Code', cell: (entry) => entry.code },
    { heading: 'Name', cell: (entry) => entry.name },
    ...(shape.hasAddress ? [{ heading: 'Address', cell: (entry: CatalogEntry) => entry.address ?? '' }] : []),
    ...(shape.hasParent ? [{ heading: 'Inside', cell: (entry: CatalogEntry) => entry.parentName ?? '' }] : []),
    { heading: 'Status', cell: (entry) => <StatusLabel status={entry.status} /> },
    ...(mayManage
      ? [
          {
            heading: 'Change',
            hiddenHeading: true,
            align: 'right' as const,
            cell: (entry: CatalogEntry) => (
              <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`Edit ${entry.name}`} onClick={() => setEditing({ id: entry.id })}>
                Edit
              </Button>
            ),
          },
        ]
      : []),
  ];

  const plural = shape.title.toLowerCase();
  const count = entries.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <p className="text-[15px] text-muted-foreground">{count === 0 ? `No ${plural} yet.` : count === 1 ? `1 ${shape.one}` : `${count} ${plural}`}</p>
        {mayManage && (
          <Button type="button" size="compact" className="ml-auto" onClick={() => setEditing({ id: null })}>
            Add {shape.one}
          </Button>
        )}
      </div>
      {count > 0 && (
        <RecordTable
          label={shape.title}
          columns={columns}
          rows={entries}
          filter={search}
          searchText={(entry) => [entry.code, entry.name, entry.address ?? '', entry.parentName ?? ''].join(' ')}
          rowKey={(entry) => entry.id}
        />
      )}
      {editing && (
        <CatalogEntryFormPanel
          list={list}
          one={shape.one}
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={(entry) => {
            setEditing(null);
            toast(`Saved ${entry.name}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
