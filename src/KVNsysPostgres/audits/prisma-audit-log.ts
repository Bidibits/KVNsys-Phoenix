import {
  accountDisplayName,
  AuditedTableNames,
  AuditLimit,
  AuditLogBook,
  AuditReferences,
  ByKVNsys,
  columnLabel,
  shownValue,
  tableLabel,
  type AuditedTable,
  type AuditFilter,
  type AuditPage,
  type ChangeSource,
  type ChangeType,
} from '@kvnsys/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The ids wanted from each table. Ids are unique across tables, so one map holds every name found. */
type Wanted = Map<AuditedTable, Set<string>>;

function want(wanted: Wanted, table: string, id: string | null) {
  if (id === null || !Uuid.test(id) || !isAudited(table)) return;
  const ids = wanted.get(table) ?? new Set<string>();
  ids.add(id);
  wanted.set(table, ids);
}

const isAudited = (table: string): table is AuditedTable => (AuditedTableNames as readonly string[]).includes(table);

/** The audit log, read from PostgreSQL, newest first, with names in place of ids. */
export class PrismaAuditLog extends AuditLogBook {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async search(filter: AuditFilter): Promise<AuditPage> {
    const when = filter.from || filter.to ? { implementedAtDate: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } } : {};
    const who = filter.person === ByKVNsys ? { implementedByUser: null } : filter.person ? { implementedByUser: filter.person } : {};
    const where: Prisma.AuditWhereInput = {
      ...(filter.table ? { tableName: filter.table } : {}),
      ...(filter.recordId ? { recordId: filter.recordId } : {}),
      ...who,
      ...when,
    };
    // Newest save first; one save's rows share its moment, and keep their table's column order.
    // One more than shown, to know whether there are more.
    const rows = await this.db.audit.findMany({ where, orderBy: [{ implementedAtDate: 'desc' }, { id: 'asc' }], take: AuditLimit + 1 });
    const shown = rows.slice(0, AuditLimit);
    const everyone = await this.db.audit.findMany({ distinct: ['implementedByUser'], select: { implementedByUser: true } });

    const wanted: Wanted = new Map();
    for (const row of shown) {
      want(wanted, row.tableName, row.recordId);
      const referenced = row.columnName ? AuditReferences[row.columnName] : undefined;
      if (referenced) {
        want(wanted, referenced, row.valueBefore);
        want(wanted, referenced, row.valueAfter);
      }
      want(wanted, 'users', row.implementedByUser);
      want(wanted, 'machines', row.implementedAtMachine);
      want(wanted, 'locations', row.implementedAtLocation);
    }
    for (const row of everyone) want(wanted, 'users', row.implementedByUser);
    const names = await this.namesOf(wanted);
    const nameOf = (id: string | null) => (id === null ? null : (names.get(id) ?? null));

    return {
      entries: shown.map((row) => ({
        id: row.id,
        at: row.implementedAtDate.toISOString(),
        table: row.tableName,
        tableLabel: tableLabel(row.tableName),
        recordId: row.recordId,
        recordName: nameOf(row.recordId),
        column: row.columnName,
        columnLabel: columnLabel(row.columnName),
        before: shownValue(row.columnName, row.valueBefore, names),
        after: shownValue(row.columnName, row.valueAfter, names),
        changeType: row.changeType as ChangeType,
        source: row.changeSource as ChangeSource,
        userId: row.implementedByUser,
        userName: nameOf(row.implementedByUser),
        machineName: nameOf(row.implementedAtMachine),
        shopName: nameOf(row.implementedAtLocation),
      })),
      more: rows.length > AuditLimit,
      people: everyone
        .flatMap((row) => (row.implementedByUser && names.has(row.implementedByUser) ? [{ id: row.implementedByUser, name: names.get(row.implementedByUser)! }] : []))
        .sort((a, b) => a.name.localeCompare(b.name)),
      byKVNsys: everyone.some((row) => row.implementedByUser === null),
    };
  }

  /** Each id's name now, from its table. An id whose record isn't there any more has none. */
  private async namesOf(wanted: Wanted): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const ids = (table: AuditedTable) => [...(wanted.get(table) ?? [])];
    const keep = (rows: { id: string; name: string }[]) => rows.forEach((row) => names.set(row.id, row.name));
    const byName = { id: true, name: true } as const;
    const among = (table: AuditedTable) => ({ where: { id: { in: ids(table) } } });

    for (const product of await this.db.product.findMany({ ...among('products'), select: { id: true, name: true, code: true } })) {
      names.set(product.id, `${product.name} (${product.code})`);
    }
    for (const user of await this.db.user.findMany({ ...among('users'), select: { id: true, username: true, firstName: true, middleName: true, lastName: true } })) {
      names.set(user.id, `${accountDisplayName(user)} (${user.username})`);
    }
    keep(await this.db.brand.findMany({ ...among('brands'), select: byName }));
    keep(await this.db.manufacturer.findMany({ ...among('manufacturers'), select: byName }));
    keep(await this.db.supplier.findMany({ ...among('suppliers'), select: byName }));
    keep(await this.db.category.findMany({ ...among('categories'), select: byName }));
    keep(await this.db.role.findMany({ ...among('roles'), select: byName }));
    keep(await this.db.machine.findMany({ ...among('machines'), select: byName }));
    keep(await this.db.location.findMany({ ...among('locations'), select: byName }));
    return names;
  }
}
