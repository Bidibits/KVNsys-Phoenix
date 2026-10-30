import { accountDisplayName, NotOnThisServer, type Listed, type RecordHistory } from '@kvnsys/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/** The eight lineage columns, as Prisma reads them from any table that has them. */
export interface LineageColumns {
  updatedByUser: string | null;
  updatedAtMachine: string | null;
  updatedAtLocation: string | null;
  updatedAtDate: Date | null;
  createdByUser: string | null;
  createdAtMachine: string | null;
  createdAtLocation: string | null;
  createdAtDate: Date;
}

/** A person as the audit log and the lists name them: "Ana Santos Cruz (ana)". */
export function personLabel(user: { username: string; firstName: string; middleName: string | null; lastName: string }): string {
  return `${accountDisplayName(user)} (${user.username})`;
}

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Each row's history, its people, machines and shops by name: three questions however many rows.
 * Lineage ids aren't foreign keys, so one may name someone this server doesn't have
 * (NotOnThisServer).
 */
export async function historiesOf(db: PrismaClient | Prisma.TransactionClient, rows: readonly LineageColumns[]): Promise<RecordHistory[]> {
  if (rows.length === 0) return [];
  const among = (pick: (row: LineageColumns) => (string | null)[]) => ({
    where: { id: { in: [...new Set(rows.flatMap(pick))].filter((id): id is string => id !== null && Uuid.test(id)) } },
  });
  const people = await db.user.findMany({
    ...among((row) => [row.createdByUser, row.updatedByUser]),
    select: { id: true, username: true, firstName: true, middleName: true, lastName: true },
  });
  const machines = await db.machine.findMany({ ...among((row) => [row.createdAtMachine, row.updatedAtMachine]), select: { id: true, name: true } });
  const shops = await db.location.findMany({ ...among((row) => [row.createdAtLocation, row.updatedAtLocation]), select: { id: true, name: true } });

  // Ids are unique across tables, so one map holds every name.
  const names = new Map<string, string>();
  for (const person of people) names.set(person.id, personLabel(person));
  for (const machine of machines) names.set(machine.id, machine.name);
  for (const shop of shops) names.set(shop.id, shop.name);
  const name = (id: string | null) => (id === null ? null : (names.get(id) ?? NotOnThisServer));

  return rows.map((row) => ({
    createdAt: row.createdAtDate.toISOString(),
    createdBy: name(row.createdByUser),
    createdMachine: name(row.createdAtMachine),
    createdShop: name(row.createdAtLocation),
    updatedAt: row.updatedAtDate?.toISOString() ?? null,
    updatedBy: row.updatedAtDate ? name(row.updatedByUser) : null,
    updatedMachine: row.updatedAtDate ? name(row.updatedAtMachine) : null,
    updatedShop: row.updatedAtDate ? name(row.updatedAtLocation) : null,
  }));
}

/** The records, each with its history: rows[i] is what records[i] was read from. */
export async function listedWithHistory<T>(
  db: PrismaClient | Prisma.TransactionClient,
  rows: readonly LineageColumns[],
  records: readonly T[],
): Promise<Listed<T>[]> {
  const histories = await historiesOf(db, rows);
  return records.map((record, i) => ({ ...record, history: histories[i]! }));
}
