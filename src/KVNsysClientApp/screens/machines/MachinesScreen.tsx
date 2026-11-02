import type { AccessName, ListedMachine, MachineListResult, SignedInUser } from '@kvnsys/client';
import { Button, historyColumns, idColumn, Notice, RecordTable, StatusLabel, TextOrDash, useToast, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';
import { MachineFormPanel } from './MachineFormPanel';

const ManageRight: AccessName = 'machines.manage';

/** Every column of the machines table in the table's own order, its id first and its history last, as Beta's grids showed a table. */
const Columns: Column<ListedMachine>[] = [
  idColumn<ListedMachine>(),
  { heading: 'Code', width: '7em', cell: (machine) => machine.code, sortBy: (machine) => machine.code },
  {
    heading: 'Name',
    width: '17em',
    cell: (machine) => (
      <>
        {machine.name}
        {machine.isServer && <span className="ml-1.5 text-[11px] text-muted-foreground">the server PC</span>}
      </>
    ),
    sortBy: (machine) => machine.name,
  },
  { heading: 'Hardware id', width: '21em', cell: (machine) => <TextOrDash text={machine.hardwareId} />, sortBy: (machine) => machine.hardwareId },
  { heading: 'Computer name', width: '11em', cell: (machine) => <TextOrDash text={machine.computerName} />, sortBy: (machine) => machine.computerName },
  { heading: 'Location', width: '10em', cell: (machine) => machine.locationName, sortBy: (machine) => machine.locationName },
  { heading: 'Status', width: '8em', cell: (machine) => <StatusLabel status={machine.status} />, sortBy: (machine) => machine.status },
  { heading: 'Description', width: '16em', cell: (machine) => <TextOrDash text={machine.description} />, sortBy: (machine) => machine.description },
  ...historyColumns<ListedMachine>((machine) => machine.history),
];

/**
 * The PCs people sign in at. A PC records itself the first time someone signs in at it, as "New
 * machine (its computer name)"; someone whose role may change machines gets Edit, to name it or
 * switch it off. After a save the list is asked for again.
 */
export function MachinesScreen({ user, search, onSignInAgain }: { user: SignedInUser; search: string; onSignInAgain: () => void }) {
  const toast = useToast();
  const mayManage = user.rights.includes(ManageRight);
  const [result, setResult] = useState<MachineListResult | null>(null);
  const [reloads, setReloads] = useState(0);
  const [editing, setEditing] = useState<ListedMachine | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .listMachines()
      .catch((error: unknown): MachineListResult => ({
        ok: false,
        reason: 'unreachable',
        message: `Something went wrong on this machine: ${error instanceof Error ? error.message : String(error)}`,
      }))
      .then((answer) => {
        if (showing) setResult(answer);
      });
    return () => {
      showing = false;
    };
  }, [reloads]);

  const columns: Column<ListedMachine>[] = mayManage
    ? [
        ...Columns,
        {
          heading: 'Change',
          hiddenHeading: true,
          align: 'right',
          width: '5em',
          pinned: true,
          cell: (machine) => (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              className="h-6 px-2 text-[13px]"
              aria-label={`Edit ${machine.name}`}
              onClick={() => {
                setEditing(machine);
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
        Loading machines…
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
      <RecordTable
        label="Machines"
        wide
        columns={columns}
        rows={result.machines}
        filter={search}
        searchText={(machine) => [machine.code, machine.name, machine.computerName ?? '', machine.hardwareId ?? '', machine.description ?? ''].join(' ')}
        rowKey={(machine) => machine.id}
      />
      {editing && (
        <MachineFormPanel
          machine={editing}
          onClose={() => setEditing(null)}
          onSaved={(machine) => {
            setEditing(null);
            toast(`Saved ${machine.name}.`);
            setReloads((n) => n + 1);
          }}
          onSignInAgain={onSignInAgain}
        />
      )}
    </div>
  );
}
