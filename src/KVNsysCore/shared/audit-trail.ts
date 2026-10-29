/**
 * What a save writes into the audit log: one row per column it changed, so "every change to this
 * product's price" is a question the database can answer, not a search through sentences. Values
 * travel as text, the way the audits table keeps them. KVNsysPostgres writes the rows, in the same
 * transaction as the save, so a change is never kept without its record.
 */

/**
 * Created: a new record's value in a column. Updated: a column changed. Decommissioned: the record
 * was switched off, its status set to Inactive. Switching it back on is an ordinary Updated.
 */
export const ChangeTypes = ['Created', 'Updated', 'Decommissioned'] as const;
export type ChangeType = (typeof ChangeTypes)[number];

/** Manual: a person, through a screen. Automatic: KVNsys itself, setting a shop up or recording a PC. */
export const ChangeSources = ['Manual', 'Automatic'] as const;
export type ChangeSource = (typeof ChangeSources)[number];

/** A record's columns by their names in the database, each value as text, null when empty. */
export type AuditValues = Readonly<Record<string, string | null>>;

/** One row of the audit log, without who, where and when, which the save adds. */
export interface AuditChange {
  columnName: string;
  valueBefore: string | null;
  valueAfter: string | null;
  changeType: ChangeType;
}

/** Columns whose values never go into the log. That they changed does, as HiddenValue. */
export const HiddenColumns: ReadonlySet<string> = new Set(['password_hash']);
export const HiddenValue = '(hidden)';

/** The status that switches any record off. */
const SwitchedOff = 'Inactive';

const isEmpty = (value: string | null | undefined) => value === null || value === undefined || value === '';
// Empty and null are the same value: a column going from null to blank hasn't changed.
const isSame = (a: string | null | undefined, b: string | null | undefined) => (a ?? '') === (b ?? '');
const shown = (column: string, value: string | null) => (value !== null && HiddenColumns.has(column) ? HiddenValue : value);

/** A new record: one Created row for each column that has a value, in the order given. */
export function changesOnCreate(values: AuditValues): AuditChange[] {
  return Object.entries(values)
    .filter(([, value]) => !isEmpty(value))
    .map(([column, value]) => ({ columnName: column, valueBefore: null, valueAfter: shown(column, value), changeType: 'Created' }));
}

/**
 * A changed record: one row for each column whose value differs. Only the columns in `after` are
 * compared, so a save that leaves a column alone can leave it out; a column missing from `before`
 * was empty.
 */
export function changesOnUpdate(before: AuditValues, after: AuditValues): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [column, value] of Object.entries(after)) {
    const was = before[column] ?? null;
    if (isSame(was, value)) continue;
    changes.push({
      columnName: column,
      valueBefore: shown(column, was),
      valueAfter: shown(column, value),
      changeType: column === 'status' && value === SwitchedOff ? 'Decommissioned' : 'Updated',
    });
  }
  return changes;
}

/**
 * A role's rights as one value, logged against the role under the name of the table that holds
 * them ("accesses"): taking a right away has no row of its own to log, so the list as a whole is
 * compared. Sorted, so the same rights always read the same; null when there are none.
 */
export function rightsText(rights: readonly string[]): string | null {
  return rights.length === 0 ? null : [...new Set(rights)].sort().join(', ');
}
