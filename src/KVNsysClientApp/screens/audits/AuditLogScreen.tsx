import type { AuditFilterForm, AuditLine, AuditListResult } from '@kvnsys/client';
import { BusinessTime, Button, idColumn, Notice, RecordTable, StatusLabel, TextOrDash, type Column } from '@kvnsys/ui';
import { useEffect, useId, useState, type ReactNode } from 'react';

/** Stands for "no one": changes made while nobody was signed in (the server's ByKVNsys). */
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

/**
 * The audit log: every change saved, newest first, one row per column, in a grid like Beta's Audits
 * dashboard: when, by whom, on which machine, at which location, then what changed. Narrowed by table,
 * by who made it and by days; a record's name shows only that record's history. The title bar's
 * search box then filters the rows shown, and each heading sorts them.
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
          message: `Something went wrong on this machine: ${error instanceof Error ? error.message : String(error)}`,
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

  // The audits table's columns in its own order: its id first, then what changed, and who, where and when last.
  const columns: Column<AuditLine>[] = [
    idColumn<AuditLine>(),
    { heading: 'Table', width: '9em', cell: (entry) => entry.tableLabel, sortBy: (entry) => entry.tableLabel },
    {
      heading: 'Record',
      width: '15em',
      cell: (entry) => (
        <button
          type="button"
          className="max-w-full truncate text-left underline decoration-dotted underline-offset-2 hover:decoration-solid"
          title="Show only this record's changes"
          onClick={() => follow(entry)}
        >
          {entry.recordName ?? 'No longer there'}
        </button>
      ),
      sortBy: (entry) => entry.recordName,
    },
    { heading: 'Column', width: '12em', cell: (entry) => <span className="font-semibold">{entry.columnLabel}</span>, sortBy: (entry) => entry.columnLabel },
    { heading: 'Before', width: '16em', cell: (entry) => <TextOrDash text={entry.before} />, sortBy: (entry) => entry.before },
    { heading: 'After', width: '16em', cell: (entry) => <TextOrDash text={entry.after} />, sortBy: (entry) => entry.after },
    { heading: 'Change', width: '10em', cell: (entry) => <StatusLabel status={entry.changeType} />, sortBy: (entry) => entry.changeType },
    { heading: 'Source', width: '8em', cell: (entry) => entry.source, sortBy: (entry) => entry.source },
    { heading: 'By', width: '16em', cell: (entry) => <TextOrDash text={entry.userName} />, sortBy: (entry) => entry.userName },
    { heading: 'Machine', width: '13em', cell: (entry) => <TextOrDash text={entry.machineName} />, sortBy: (entry) => entry.machineName },
    { heading: 'Location', width: '10em', cell: (entry) => <TextOrDash text={entry.locationName} />, sortBy: (entry) => entry.locationName },
    { heading: 'At', width: '12em', cell: (entry) => <BusinessTime at={entry.at} />, sortBy: (entry) => entry.at },
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
              {byKVNsys && <option value={ByKVNsys}>No one</option>}
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
            wide
            columns={columns}
            rows={result.entries}
            rowKey={(entry) => entry.id}
            filter={search}
            searchText={(entry) =>
              [entry.userName ?? '', entry.machineName ?? '', entry.locationName ?? '', entry.tableLabel, entry.recordName ?? '', entry.columnLabel, entry.before ?? '', entry.after ?? ''].join(' ')
            }
          />
        </>
      )}
    </div>
  );
}
