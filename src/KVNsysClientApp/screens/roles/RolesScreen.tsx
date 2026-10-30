import type { AccessName, ListedRole, Role, RoleListResult, SignedInUser } from '@kvnsys/client';
import { Button, historyColumns, Notice, RecordTable, StatusLabel, TextOrDash, useToast, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { RoleFormPanel } from './RoleFormPanel';

const ManageRight: AccessName = 'roles.manage';

/** Every column of the roles table, the rights it holds and how many accounts have it, then its history, as Beta's grids showed a table. */
const Columns: Column<ListedRole>[] = [
  { heading: 'Code', width: '9rem', cell: (role) => role.code, sortBy: (role) => role.code },
  { heading: 'Name', width: '12rem', cell: (role) => role.name, sortBy: (role) => role.name },
  { heading: 'Rights', width: '26rem', cell: (role) => role.rightsInWords, sortBy: (role) => role.rightsInWords },
  { heading: 'Accounts', width: '7rem', align: 'right', cell: (role) => role.userCount, sortBy: (role) => role.userCount },
  { heading: 'Status', width: '8rem', cell: (role) => <StatusLabel status={role.status} />, sortBy: (role) => role.status },
  { heading: 'Description', width: '16rem', cell: (role) => <TextOrDash text={role.description} />, sortBy: (role) => role.description },
  ...historyColumns<ListedRole>((role) => role.history),
];

/**
 * Every role and what it may do. Someone whose role may change roles also gets Add role, and Edit on
 * each row, which open the role panel; after a save the list is asked for again. Like the other
 * lists, it's asked for after the screen is on show, never while it's being built.
 */
export function RolesScreen({ user, search, onSignInAgain }: { user: SignedInUser; search: string; onSignInAgain: () => void }) {
  const toast = useToast();
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<RoleListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  /** Opens the panel: for a new role (null) or one already in the list. */
  function open(id: string | null) {
    setEditing({ id });
  }

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listRoles()
      .catch((error: unknown): RoleListResult => ({
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

  const columns: Column<ListedRole>[] = mayManage
    ? [
        ...Columns,
        {
          heading: 'Change',
          hiddenHeading: true,
          align: 'right',
          width: '5.5rem',
          pinned: true,
          cell: (role) => (
            <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`Edit ${role.name}`} onClick={() => open(role.id)}>
              Edit
            </Button>
          ),
        },
      ]
    : Columns;

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading roles…
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

  const count = result.roles.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <p className="text-[15px] text-muted-foreground">{count === 1 ? '1 role' : `${count} roles`}</p>
        {mayManage && (
          <Button type="button" size="compact" className="ml-auto" onClick={() => open(null)}>
            Add role
          </Button>
        )}
      </div>
      <RecordTable
        label="Roles"
        wide
        columns={columns}
        rows={result.roles}
        filter={search}
        searchText={(role) => [role.code, role.name, role.description ?? ''].join(' ')}
        rowKey={(role) => role.id}
      />
      {editing && (
        <RoleFormPanel
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={(role: Role) => {
            setEditing(null);
            toast(`Saved ${role.name}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
