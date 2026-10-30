import {
  CatalogBook,
  CatalogListShapes,
  checkCatalogEntry,
  newId,
  Refusal,
  type CatalogEntry,
  type CatalogEntryDetails,
  type CatalogEntryStatus,
  type CatalogList,
  type Lineage,
  type Listed,
} from '@kvnsys/core';
import { auditValues, recordChanged, recordCreated } from '../audits/audit-log.js';
import { listedWithHistory, type LineageColumns } from '../audits/record-history.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each list's table. Fixed here, never from what a request sends, so it's safe to put in SQL. */
const Tables: Record<CatalogList, string> = {
  suppliers: 'suppliers',
  brands: 'brands',
  manufacturers: 'manufacturers',
  categories: 'categories',
};

/** A row as the four tables share it; address is only on suppliers, parent_category_id only on categories. */
interface Row extends LineageColumns {
  id: string;
  code: string;
  name: string;
  status: string;
  description: string | null;
  address?: string | null;
  parentCategoryId?: string | null;
  parent?: { name: string } | null;
}

/** The part of Prisma's table access the lists use. The four tables differ only in their extra column. */
interface Table {
  findMany(args: object): Promise<Row[]>;
  findUnique(args: object): Promise<Row | null>;
  create(args: object): Promise<Row>;
  update(args: object): Promise<Row>;
}

function table(db: Prisma.TransactionClient | PrismaClient, list: CatalogList): Table {
  const tables = { suppliers: db.supplier, brands: db.brand, manufacturers: db.manufacturer, categories: db.category };
  return tables[list] as unknown as Table;
}

/** Categories bring their parent's name along, for showing. */
const including = (list: CatalogList) => (CatalogListShapes[list].hasParent ? { include: { parent: { select: { name: true } } } } : {});

function toEntry(row: Row): CatalogEntry {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address ?? null,
    parentId: row.parentCategoryId ?? null,
    parentName: row.parent?.name ?? null,
    status: row.status as CatalogEntryStatus,
    description: row.description,
  };
}

/** The columns a save writes: the shared ones, and whichever extra one the list has. */
function columns(list: CatalogList, details: CatalogEntryDetails) {
  const shape = CatalogListShapes[list];
  return {
    code: details.code,
    name: details.name,
    status: details.status,
    description: details.description,
    ...(shape.hasAddress ? { address: details.address } : {}),
    ...(shape.hasParent ? { parentCategoryId: details.parentId } : {}),
  };
}

/** The four catalogue lists, kept in PostgreSQL. The rules are KVNsysCore's; this checks them before every save. */
export class PrismaCatalogBook extends CatalogBook {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async list(list: CatalogList): Promise<Listed<CatalogEntry>[]> {
    const rows = await table(this.db, list).findMany({ orderBy: [{ name: 'asc' }, { code: 'asc' }], ...including(list) });
    return listedWithHistory(this.db, rows, rows.map(toEntry));
  }

  async get(list: CatalogList, id: string): Promise<CatalogEntry | null> {
    if (!Uuid.test(id)) return null;
    const row = await table(this.db, list).findUnique({ where: { id }, ...including(list) });
    return row ? toEntry(row) : null;
  }

  async create(list: CatalogList, typed: CatalogEntryDetails, lineage: Lineage): Promise<CatalogEntry> {
    const details = checkCatalogEntry(list, typed);
    return this.saving(list, async (tx) => {
      await refuseTakenCode(tx, list, details.code, null);
      await checkParent(tx, list, details.parentId, null);
      const row = await table(tx, list).create({
        data: {
          id: newId(),
          ...columns(list, details),
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
        },
        ...including(list),
      });
      await recordCreated(tx, audited(list, row.id, lineage), auditValues(row));
      return toEntry(row);
    });
  }

  async update(list: CatalogList, id: string, typed: CatalogEntryDetails, lineage: Lineage): Promise<CatalogEntry> {
    const details = checkCatalogEntry(list, typed);
    const shape = CatalogListShapes[list];
    return this.saving(list, async (tx) => {
      const existing = Uuid.test(id) ? await table(tx, list).findUnique({ where: { id } }) : null;
      if (!existing) throw new Refusal('not-found', `That ${shape.one} isn't there any more.`);
      await refuseTakenCode(tx, list, details.code, id);
      await checkParent(tx, list, details.parentId, id);
      const row = await table(tx, list).update({
        where: { id },
        data: {
          ...columns(list, details),
          updatedByUser: lineage.userId,
          updatedAtMachine: lineage.machineId,
          updatedAtLocation: lineage.locationId,
          updatedAtDate: new Date(),
        },
        ...including(list),
      });
      await recordChanged(tx, audited(list, id, lineage), auditValues(existing), auditValues(row));
      return toEntry(row);
    });
  }

  /** One transaction per save. The unique index on code has the last word if two saves race. */
  private async saving(list: CatalogList, work: (tx: Prisma.TransactionClient) => Promise<CatalogEntry>): Promise<CatalogEntry> {
    try {
      return await this.db.$transaction(work);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Refusal('conflict', `Another ${CatalogListShapes[list].one} already has that code.`);
      }
      throw error;
    }
  }
}

/** Every save to the lists is a person's, through the list's form. */
const audited = (list: CatalogList, recordId: string, lineage: Lineage) => ({ table: Tables[list], recordId, lineage, source: 'Manual' as const });

/** A code is one entry's in its list, ignoring capitals; the refusal names whose it is. */
async function refuseTakenCode(tx: Prisma.TransactionClient, list: CatalogList, code: string, ownId: string | null) {
  const others = await tx.$queryRaw<{ name: string }[]>`
    SELECT name FROM ${Prisma.raw(`"${Tables[list]}"`)}
     WHERE lower(code) = lower(${code}) AND (${ownId}::uuid IS NULL OR id <> ${ownId}::uuid)
     LIMIT 1`;
  const other = others[0];
  if (other) throw new Refusal('conflict', `${code} is already the code of ${other.name}.`);
}

/**
 * A category's parent exists, and isn't the category itself or any category inside it: walking up
 * from the parent must never reach the category being saved, or the tree would loop.
 */
async function checkParent(tx: Prisma.TransactionClient, list: CatalogList, parentId: string | null, ownId: string | null) {
  if (parentId === null || !CatalogListShapes[list].hasParent) return;
  if (!Uuid.test(parentId)) throw new Refusal('invalid', "That category to put it inside isn't there any more. Choose another.");
  if (parentId === ownId) throw new Refusal('invalid', "A category can't sit inside itself.");
  const above = await tx.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE chain AS (
      SELECT id, parent_category_id, 1 AS depth FROM categories WHERE id = ${parentId}::uuid
      UNION ALL
      SELECT c.id, c.parent_category_id, chain.depth + 1 FROM categories c JOIN chain ON c.id = chain.parent_category_id
       WHERE chain.depth < 100
    )
    SELECT id FROM chain`;
  if (above.length === 0) throw new Refusal('invalid', "That category to put it inside isn't there any more. Choose another.");
  if (ownId !== null && above.some((row) => row.id === ownId)) {
    throw new Refusal('invalid', "A category can't sit inside one of the categories inside it.");
  }
}
