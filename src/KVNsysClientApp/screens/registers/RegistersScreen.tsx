import type { AccessName, ListedRegister, RegisterListResult, SignedInUser } from '@kvnsys/client';
import { Button, Notice, RecordTable, StatusLabel, useToast, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { RegisterFormPanel } from './RegisterFormPanel';

const ManageRight: AccessName = 'machines.manage';

const Columns: Column<ListedRegister>[] = [
  { heading: 'Code', cell: (register) => register.code },
  {
    heading: 'Name',
    cell: (register) => (
      <span>
        {register.name}
        {register.isServer && <span className="ml-2 text-[13px] text-muted-foreground">the server PC</span>}
      </span>
    ),
  },
  { heading: 'Computer name', cell: (register) => register.computerName ?? '' },
  { heading: 'Status', cell: (register) => <StatusLabel status={register.status} /> },
];

/**
 * The PCs people sign in at. A PC records itself the first time someone signs in at it, as "New
 * register (its computer name)"; someone whose role may change registers gets Edit, to name it or
 * switch it off. After a save the list is asked for again.
 */
export function RegistersScreen({ user, search, onSignInAgain }: { user: SignedInUser; search: string; onSignInAgain: () => void }) {
  const toast = useToast();
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<RegisterListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<ListedRegister | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listRegisters()
      .catch((error: unknown): RegisterListResult => ({
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

  const columns: Column<ListedRegister>[] = mayManage
    ? [
        ...Columns,
        {
          heading: 'Change',
          hiddenHeading: true,
          align: 'right',
          cell: (register) => (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="h-8 px-3"
              aria-label={`Edit ${register.name}`}
              onClick={() => {
                setEditing(register);
              }}
            >
              Edit
            </Button>
          ),
        },
      ]
    : Columns;

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading registers…
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

  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[15px] text-muted-foreground">A PC is added here by itself the first time someone signs in at it.</p>
      <RecordTable label="Registers" columns={columns} rows={result.registers} filter={search} searchText={(register) => [register.code, register.name, register.computerName ?? ''].join(' ')} rowKey={(register) => register.id} />
      {editing && (
        <RegisterFormPanel
          register={editing}
          onClose={() => setEditing(null)}
          onSaved={(register) => {
            setEditing(null);
            toast(`Saved ${register.name}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
