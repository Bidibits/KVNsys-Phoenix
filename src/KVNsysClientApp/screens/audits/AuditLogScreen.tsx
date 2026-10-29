import type { AuditFilterForm, AuditLine, AuditListResult } from '@kvnsys/client';
import { Button, Notice, RecordTable, ShopTime, type Column } from '@kvnsys/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';

/** Stands for "nobody": the changes KVNsys made itself (the server's ByKVNsys). */
const ByKVNsys = 'kvnsys';

const Everything: AuditFilterForm = { table: '', record: '', person: '', from: '', to: '' };

const fieldClass =
  'h-10 rounded-md border border-input bg-field px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/** A label over its box, the height of the Sales screen's day box, so a row of them lines up. */
function Labelled({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] leading-none font-semibold">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

/** Nothing there: a dash, so an empty value never reads as a missing cell. */
function Value({ value }: { value: string | null }) {
  // A long value with no spaces in it, such as an id, breaks anywhere rather than pushing the table wider than the window.
  return value === null || value === '' ? <span className="text-muted-foreground">—</span> : <span className="[overflow-wrap:anywhere]">{value}</span>;
}

/** The two kinds of change worth seeing at a glance; an ordinary change needs no label. */
function Kind({ entry }: { entry: AuditLine }) {
  if (entry.changeType === 'Created') return <span className="ml-2 rounded border border-border px-1.5 text-[13px] text-muted-foreground">new</span>;
  if (entry.changeType === 'Decommissioned') return <span className="ml-2 rounded border border-border bg-muted px-1.5 text-[13px] text-muted-foreground">switched off</span>;
  return null;
}

/**
 * The audit log: every change saved, newest first, one row per column. Narrowed by table, by who
 * made it and by days; a record's name shows only that record's history. The title bar's search
 * box then filters the rows shown.
 */
export function AuditLogScreen({ search, onSignInAgain }: { search: string; onSignInAgain: () => void }) {
  const [filter, setFilter] = useState<AuditFilterForm>(Everything);
  const [result, setResult] = useState<AuditListResult | null>(null);
  // The record being followed, by name, for the line that says so; its id is in the filter.
  const [following, setFollowing] = useState<{ name: string; table: string } | null>(null);

  useEffect(() => {
    let showing = true;
    setResult(null);
    window.kvnsys
      .listAudits(filter)
      .catch(
        (error: unknown): AuditListResult => ({
          ok: false,
          reason: 'unreachable',
          message: `Something went wrong on this register: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
      .then((answer) => {
        if (showing) setResult(answer);
      });
    return () => {
      showing = false;
    };
  }, [filter]);

  const change = (part: Partial<AuditFilterForm>) => setFilter((current) => ({ ...current, ...part }));

  function follow(entry: AuditLine) {
    setFollowing({ name: entry.recordName ?? 'a record that isn’t there any more', table: entry.tableLabel });
    change({ record: entry.recordId, table: '' });
  }

  const columns: Column<AuditLine>[] = [
    { heading: 'When', wrap: true, width: '8.5rem', cell: (entry) => <ShopTime at={entry.at} /> },
    {
      heading: 'Who',
      wrap: true,
      width: '11rem',
      cell: (entry) => (
        <span>
          {entry.userName ?? 'KVNsys itself'}
          {entry.machineName && <span className="block text-[13px] text-muted-foreground">at {entry.machineName}</span>}
        </span>
      ),
    },
    {
      heading: 'Record',
      wrap: true,
      width: '13rem',
      cell: (entry) => (
        <span>
          <span className="block text-[13px] text-muted-foreground">{entry.tableLabel}</span>
          <button
            type="button"
            className="text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
            title="Show only this record's changes"
            onClick={() => follow(entry)}
          >
            {entry.recordName ?? 'No longer there'}
          </button>
        </span>
      ),
    },
    {
      heading: 'Changed',
      wrap: true,
      width: '11rem',
      cell: (entry) => (
        <span className="font-semibold">
          {entry.columnLabel}
          <Kind entry={entry} />
        </span>
      ),
    },
    { heading: 'Before', wrap: true, cell: (entry) => <Value value={entry.before} /> },
    { heading: 'After', wrap: true, cell: (entry) => <Value value={entry.after} /> },
  ];

  const tables = result?.ok ? result.tables : [];
  const people = result?.ok ? result.people : [];
  const byKVNsys = result?.ok ? result.byKVNsys : false;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Labelled label="What">
          {(id) => (
            <select id={id} value={filter.table} onChange={(event) => change({ table: event.target.value, record: '' })} className={fieldClass} disabled={!!filter.record}>
              <option value="">Everything</option>
              {tables.map((table) => (
                <option key={table.name} value={table.name}>
                  {table.label}
                </option>
              ))}
            </select>
          )}
        </Labelled>
        <Labelled label="Who">
          {(id) => (
            <select id={id} value={filter.person} onChange={(event) => change({ person: event.target.value })} className={fieldClass}>
              <option value="">Anyone</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
              {byKVNsys && <option value={ByKVNsys}>KVNsys itself</option>}
            </select>
          )}
        </Labelled>
        <Labelled label="From">
          {(id) => <input id={id} type="date" value={filter.from} onChange={(event) => change({ from: event.target.value })} className={fieldClass} />}
        </Labelled>
        <Labelled label="To">
          {(id) => <input id={id} type="date" value={filter.to} onChange={(event) => change({ to: event.target.value })} className={fieldClass} />}
        </Labelled>
        <Button
          type="button"
          variant="secondary"
          size="compact"
          onClick={() => {
            setFollowing(null);
            setFilter(Everything);
          }}
        >
          Show everything
        </Button>
      </div>

      {filter.record && following && (
        <p className="text-[15px]">
          Only the changes to <strong>{following.name}</strong> ({following.table}).{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setFollowing(null);
              change({ record: '' });
            }}
          >
            Show every record
          </button>
        </p>
      )}

      {!result && (
        <p role="status" className="text-[17px] text-muted-foreground">
          Loading the audit log…
        </p>
      )}
      {result && !result.ok && (
        <div className="max-w-xl">
          <Notice tone="problem">{result.message}</Notice>
          {result.reason === 'ended' && (
            <Button type="button" size="compact" className="mt-4" onClick={onSignInAgain}>
              Sign in again
            </Button>
          )}
        </div>
      )}
      {result?.ok && result.entries.length === 0 && <p className="text-[15px] text-muted-foreground">No changes match.</p>}
      {result?.ok && result.entries.length > 0 && (
        <>
          {result.more && (
            <p className="text-[15px] text-muted-foreground">
              Showing the newest {result.entries.length} changes. Narrow it down by what, who or days to see older ones.
            </p>
          )}
          <RecordTable
            label="Audit log"
            columns={columns}
            rows={result.entries}
            rowKey={(entry) => entry.id}
            filter={search}
            searchText={(entry) =>
              [entry.userName ?? 'KVNsys itself', entry.machineName ?? '', entry.tableLabel, entry.recordName ?? '', entry.columnLabel, entry.before ?? '', entry.after ?? ''].join(' ')
            }
          />
        </>
      )}
    </div>
  );
}
