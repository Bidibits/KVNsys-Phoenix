import type { AccessName, Account, Listed, SignedInUser, UserListResult } from '@kvnsys/client';
import { Button, historyColumns, Notice, RecordTable, StatusLabel, TextOrDash, useToast, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { UserFormPanel } from './UserFormPanel';

const ManageRight: AccessName = 'users.manage';

/** Every column of the users table but the password, then its history, as Beta's grids showed a table. */
const Columns: Column<Listed<Account>>[] = [
  { heading: 'Username', width: '10rem', cell: (account) => account.username, sortBy: (account) => account.username },
  { heading: 'First name', width: '10rem', cell: (account) => account.firstName, sortBy: (account) => account.firstName },
  { heading: 'Middle name', width: '9rem', cell: (account) => <TextOrDash text={account.middleName} />, sortBy: (account) => account.middleName },
  { heading: 'Last name', width: '10rem', cell: (account) => account.lastName, sortBy: (account) => account.lastName },
  { heading: 'Role', width: '11rem', cell: (account) => account.roleName, sortBy: (account) => account.roleName },
  { heading: 'Status', width: '8rem', cell: (account) => <StatusLabel status={account.status} />, sortBy: (account) => account.status },
  { heading: 'Description', width: '16rem', cell: (account) => <TextOrDash text={account.description} />, sortBy: (account) => account.description },
  ...historyColumns<Listed<Account>>((account) => account.history),
];

/**
 * Every account. Someone whose role may manage users also gets Add user, and Edit on each row, which
 * open the account panel; after a save the list is asked for again. Like the products list, it's
 * asked for after the screen is on show, never while it's being built.
 */
export function UsersScreen({ user, search, onSignInAgain }: { user: SignedInUser; search: string; onSignInAgain: () => void }) {
  const toast = useToast();
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<UserListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  /** Opens the panel: for a new account (null) or one already in the list. */
  function open(id: string | null) {
    setEditing({ id });
  }

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listUsers()
      .catch((error: unknown): UserListResult => ({
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

  const columns: Column<Listed<Account>>[] = mayManage
    ? [
        ...Columns,
        {
          heading: 'Change',
          hiddenHeading: true,
          align: 'right',
          width: '5.5rem',
          pinned: true,
          cell: (account) => (
            <Button type="button" variant="secondary" size="compact" className="h-8 px-3" aria-label={`Edit ${account.displayName}`} onClick={() => open(account.id)}>
              Edit
            </Button>
          ),
        },
      ]
    : Columns;

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading users…
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

  const count = result.users.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-4">
        <p className="text-[15px] text-muted-foreground">{count === 1 ? '1 account' : `${count} accounts`}</p>
        {mayManage && (
          <Button type="button" size="compact" className="ml-auto" onClick={() => open(null)}>
            Add user
          </Button>
        )}
      </div>
      <RecordTable
        label="Users"
        wide
        columns={columns}
        rows={result.users}
        filter={search}
        searchText={(account) => [account.username, account.displayName, account.roleName, account.description ?? ''].join(' ')}
        rowKey={(account) => account.id}
      />
      {editing && (
        <UserFormPanel
          id={editing.id}
          onClose={() => setEditing(null)}
          onSaved={(account) => {
            setEditing(null);
            toast(`Saved ${account.displayName}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
