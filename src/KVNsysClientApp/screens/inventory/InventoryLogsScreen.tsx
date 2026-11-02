import type { InventoryLogLine, InventoryLogsResult, MovementType } from '@kvnsys/client';
import { BusinessTime, Button, idColumn, Notice, Pieces, RecordTable, TextOrDash, type Column } from '@kvnsys/ui';
import { useEffect, useState } from 'react';

/** What each kind of movement is called on screen. Naming them by MovementType makes the build fail if one is missing. */
const MovementNames = {
  from_supplier: 'Received',
  to_customer: 'Sold',
  adjustment: 'Count put right',
} satisfies Record<MovementType, string>;

/** What each kind of document a movement can come from is called. */
const SourceNames: Record<string, string> = { receipts: 'Receipt', stock_documents: 'Delivery document' };

/** Every column of an inventory_logs line, in the table's order, names in place of ids. */
const Columns: Column<InventoryLogLine>[] = [
  idColumn<InventoryLogLine>(),
  { heading: 'Location', width: '10em', cell: (line) => line.locationName, sortBy: (line) => line.locationName },
  { heading: 'Product', width: '18em', cell: (line) => `${line.productName} (${line.productCode})`, sortBy: (line) => line.productName },
  { heading: 'Pieces', width: '7em', align: 'right', cell: (line) => <Pieces count={line.quantityChange} signed />, sortBy: (line) => line.quantityChange },
  { heading: 'Movement', width: '10em', cell: (line) => MovementNames[line.type], sortBy: (line) => MovementNames[line.type] },
  {
    heading: 'Source',
    width: '9em',
    cell: (line) => <TextOrDash text={line.sourceTable ? (SourceNames[line.sourceTable] ?? line.sourceTable) : null} />,
    sortBy: (line) => line.sourceTable,
  },
  { heading: 'Document', width: '12em', cell: (line) => <TextOrDash text={line.sourceName ?? line.sourceId} />, sortBy: (line) => line.sourceName ?? line.sourceId },
  { heading: 'In stock after', width: '8em', align: 'right', cell: (line) => <Pieces count={line.resultingOnHand} />, sortBy: (line) => line.resultingOnHand },
  { heading: 'Note', width: '18em', cell: (line) => <TextOrDash text={line.note} />, sortBy: (line) => line.note },
  { heading: 'Created by', width: '16em', cell: (line) => <TextOrDash text={line.createdBy} />, sortBy: (line) => line.createdBy },
  { heading: 'Created machine', width: '13em', cell: (line) => <TextOrDash text={line.createdMachine} />, sortBy: (line) => line.createdMachine },
  { heading: 'Created location', width: '10em', cell: (line) => <TextOrDash text={line.createdLocation} />, sortBy: (line) => line.createdLocation },
  { heading: 'Created at', width: '12em', cell: (line) => <BusinessTime at={line.createdAt} />, sortBy: (line) => line.createdAt },
];

/** The words a line is found by in the title bar's search box. */
function searchText(line: InventoryLogLine): string {
  return [line.productName, line.productCode, MovementNames[line.type], line.sourceName ?? '', line.note ?? '', line.createdBy ?? '', line.createdMachine ?? ''].join(' ');
}

/**
 * The inventory log: every product's movements at this location, newest first, the newest 500, each
 * line with every column it has (who saved it, on which machine, where and when come last). Opened
 * from the Inventory screen; the title bar's search box narrows it.
 */
export function InventoryLogsScreen({ search, onSignInAgain }: { search: string; onSignInAgain: () => void }) {
  const [result, setResult] = useState<InventoryLogsResult | null>(null);

  useEffect(() => {
    let showing = true;
    window.kvnsys
      .inventoryLogs()
      .catch((error: unknown): InventoryLogsResult => ({
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
  }, []);

  if (!result) {
    return (
      <p role="status" className="text-[17px] text-muted-foreground">
        Loading the inventory log…
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

  const count = result.lines.length;
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[15px] text-muted-foreground">
        {count === 0
          ? 'Nothing has moved here yet.'
          : result.more
            ? `The newest ${count} movements at ${result.location.name}. Older ones aren't shown yet.`
            : `${count === 1 ? '1 movement' : `${count} movements`} at ${result.location.name}, newest first.`}
      </p>
      {count > 0 && <RecordTable label="Inventory logs" wide columns={Columns} rows={result.lines} filter={search} searchText={searchText} rowKey={(line) => line.id} />}
    </div>
  );
}
