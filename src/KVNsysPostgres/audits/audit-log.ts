import { createHash } from 'node:crypto';
import { changesOnCreate, changesOnUpdate, newId, type AuditChange, type AuditValues, type ChangeSource, type Lineage } from '@kvnsys/core';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Which record a save touched, who saved it and how. The table is the database's name for it,
 * fixed by each save, never taken from a request.
 */
export interface AuditedSave {
  table: string;
  recordId: string;
  lineage: Lineage;
  source: ChangeSource;
}

/** Who and where a row was written: each audit row says that for itself, so they aren't logged as changes. */
const LineageFields = new Set([
  'id',
  'updatedByUser',
  'updatedAtMachine',
  'updatedAtLocation',
  'updatedAtDate',
  'createdByUser',
  'createdAtMachine',
  'createdAtLocation',
  'createdAtDate',
]);

/** retailPrice -> retail_price: the schema maps every field to its own name in snake case. */
const columnName = (field: string) => field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** A picture as the log shows it: its size, and enough of its fingerprint to tell two apart. Never the picture. */
export function pictureText(picture: Uint8Array): string {
  const fingerprint = createHash('sha256').update(picture).digest('hex').slice(0, 12);
  return `a picture, ${Math.max(1, Math.round(picture.byteLength / 1024))} KB (${fingerprint})`;
}

/** A column's value as text; undefined for what isn't a column of the row (a relation, a count). */
function asText(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  // Money is numeric(14,2): logged to the centavo, the way it's written on the wire.
  if (value instanceof Prisma.Decimal) return value.toFixed(2);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return pictureText(value);
  return undefined;
}

/**
 * A row read through Prisma, as the log's column values. Every column of the row is in it, so a
 * column added to a table later is logged without anyone remembering to add it here.
 */
export function auditValues(row: object): Record<string, string | null> {
  const values: Record<string, string | null> = {};
  for (const [field, value] of Object.entries(row)) {
    if (LineageFields.has(field)) continue;
    const text = asText(value);
    if (text !== undefined) values[columnName(field)] = text;
  }
  return values;
}

/** Logs a new record: each column it was given a value in. Run inside the save's own transaction. */
export async function recordCreated(tx: Prisma.TransactionClient, save: AuditedSave, values: AuditValues): Promise<void> {
  await write(tx, save, changesOnCreate(values));
}

/** Logs what a save changed: one row per column that differs. Nothing at all when nothing did. */
export async function recordChanged(tx: Prisma.TransactionClient, save: AuditedSave, before: AuditValues, after: AuditValues): Promise<void> {
  await write(tx, save, changesOnUpdate(before, after));
}

async function write(tx: Prisma.TransactionClient, save: AuditedSave, changes: AuditChange[]): Promise<void> {
  if (changes.length === 0) return;
  await tx.audit.createMany({
    data: changes.map((change) => ({
      id: newId(),
      tableName: save.table,
      recordId: save.recordId,
      columnName: change.columnName,
      valueBefore: change.valueBefore,
      valueAfter: change.valueAfter,
      changeType: change.changeType,
      changeSource: save.source,
      implementedByUser: save.lineage.userId,
      implementedAtMachine: save.lineage.machineId,
      implementedAtLocation: save.lineage.locationId,
    })),
  });
}
