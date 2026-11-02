import type { RecordHistory } from '@kvnsys/core';
import type { Column } from './RecordTable';
import { BusinessTime } from './BusinessTime';

/** Who "made" a record nobody signed in made: setting the location up, or a PC recording itself. */
export const ByKVNsysItself = 'KVNsys itself';

/** Nothing there: a dash, so an empty cell never reads as one that didn't load. */
export function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

/** Text, or a dash when there's none. */
export function TextOrDash({ text }: { text: string | null | undefined }) {
  return text === null || text === undefined || text === '' ? <Dash /> : <>{text}</>;
}

/**
 * The first column of every list, as every table's first column is its id. Shown whole: ids are
 * made in time order, so ids made the same minute begin alike, and a cut-short one tells rows apart
 * poorly.
 */
export function idColumn<Row extends { id: string }>(): Column<Row> {
  return { heading: 'Id', width: '21em', cell: (row) => row.id, sortBy: (row) => row.id };
}

/**
 * The eight columns at the end of every list's rows, as every table ends and as Beta's and Release's
 * grids ended: who last updated the record, on which machine, at which location and when, then the same
 * for who created it. A record never updated has dashes in the first four. Each sorts when its
 * heading is clicked.
 */
export function historyColumns<Row>(history: (row: Row) => RecordHistory): Column<Row>[] {
  const person = (who: string | null) => who ?? ByKVNsysItself;
  // Updated: only once it has been. Created: always, by someone or by KVNsys itself.
  const updated = (row: Row, value: (history: RecordHistory) => string | null) => (history(row).updatedAt === null ? null : value(history(row)));
  return [
    {
      heading: 'Updated by',
      width: '16em',
      cell: (row) => <TextOrDash text={updated(row, (h) => person(h.updatedBy))} />,
      sortBy: (row) => updated(row, (h) => person(h.updatedBy)),
    },
    { heading: 'Updated machine', width: '13em', cell: (row) => <TextOrDash text={updated(row, (h) => h.updatedMachine)} />, sortBy: (row) => updated(row, (h) => h.updatedMachine) },
    { heading: 'Updated location', width: '10em', cell: (row) => <TextOrDash text={updated(row, (h) => h.updatedLocation)} />, sortBy: (row) => updated(row, (h) => h.updatedLocation) },
    {
      heading: 'Updated at',
      width: '12em',
      cell: (row) => {
        const at = history(row).updatedAt;
        return at === null ? <Dash /> : <BusinessTime at={at} />;
      },
      sortBy: (row) => history(row).updatedAt,
    },
    { heading: 'Created by', width: '16em', cell: (row) => person(history(row).createdBy), sortBy: (row) => person(history(row).createdBy) },
    { heading: 'Created machine', width: '13em', cell: (row) => <TextOrDash text={history(row).createdMachine} />, sortBy: (row) => history(row).createdMachine },
    { heading: 'Created location', width: '10em', cell: (row) => <TextOrDash text={history(row).createdLocation} />, sortBy: (row) => history(row).createdLocation },
    { heading: 'Created at', width: '12em', cell: (row) => <BusinessTime at={history(row).createdAt} />, sortBy: (row) => history(row).createdAt },
  ];
}
