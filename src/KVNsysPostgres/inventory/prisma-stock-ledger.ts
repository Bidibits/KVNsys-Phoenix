import {
  checkStockChange,
  newId,
  Refusal,
  StockLedger,
  type Lineage,
  type MovementType,
  type StockChange,
  type StockLevel,
  type StockMovement,
} from '@kvnsys/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NoSuchProduct = "That product isn't in the catalog.";
const NoSuchShop = "That shop isn't known here.";

type Row = Prisma.InventoryLogGetPayload<object>;

function toMovement(row: Row): StockMovement {
  return {
    id: row.id,
    locationId: row.locationId,
    productId: row.productId,
    type: row.movementType as MovementType,
    quantityChange: row.quantityChange,
    note: row.note,
    source: row.sourceTable !== null && row.sourceId !== null ? { table: row.sourceTable, id: row.sourceId } : null,
    resultingOnHand: row.resultingOnHand,
    createdAt: row.createdAtDate.toISOString(),
    createdByUser: row.createdByUser,
  };
}

/**
 * The stock ledger, kept in PostgreSQL: inventory_logs holds the lines, inventory the running total
 * of each (location, product). Both are written in one transaction, so they never disagree, and the
 * database itself refuses to change or delete a line (see the baseline migration).
 */
export class PrismaStockLedger extends StockLedger {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async record(changes: StockChange[], lineage: Lineage): Promise<StockMovement[]> {
    const checked = changes.map(checkStockChange);
    if (checked.length === 0) return [];
    for (const change of checked) {
      if (!Uuid.test(change.locationId)) throw new Refusal('not-found', NoSuchShop);
      if (!Uuid.test(change.productId)) throw new Refusal('not-found', NoSuchProduct);
      if (change.source && !Uuid.test(change.source.id)) throw new Refusal('invalid', "The document's id isn't one KVNsys made.");
    }
    // Two changes to the same stock wait for each other on its inventory row. Taking those rows in
    // one fixed order (shop, then product) means two batches that share products can never each hold
    // a row the other is waiting for. Changes to the same stock keep the order they were given.
    const order = checked
      .map((change, index) => ({ change, index }))
      .sort((a, b) => a.change.locationId.localeCompare(b.change.locationId) || a.change.productId.localeCompare(b.change.productId) || a.index - b.index);

    return this.db.$transaction(async (tx) => {
      await requireKnown(tx, checked);
      const saved: StockMovement[] = new Array<StockMovement>(checked.length);
      for (const { change, index } of order) {
        // Adds the change to the running total, or starts it, and hands back the total after it,
        // all in one statement: the row stays locked until this transaction ends.
        const totals = await tx.$queryRaw<{ stock: number }[]>`
          INSERT INTO inventory (location_id, product_id, stock, created_by_user, created_at_machine, created_at_location)
          VALUES (${change.locationId}::uuid, ${change.productId}::uuid, ${change.quantityChange},
                  ${lineage.userId}::uuid, ${lineage.machineId}::uuid, ${lineage.locationId}::uuid)
          ON CONFLICT (location_id, product_id) DO UPDATE
             SET stock = inventory.stock + EXCLUDED.stock,
                 updated_by_user = EXCLUDED.created_by_user,
                 updated_at_machine = EXCLUDED.created_at_machine,
                 updated_at_location = EXCLUDED.created_at_location,
                 updated_at_date = now()
          RETURNING stock`;
        const row = await tx.inventoryLog.create({
          data: {
            id: newId(),
            locationId: change.locationId,
            productId: change.productId,
            quantityChange: change.quantityChange,
            movementType: change.type,
            sourceTable: change.source?.table ?? null,
            sourceId: change.source?.id ?? null,
            resultingOnHand: totals[0]!.stock,
            note: change.note,
            createdByUser: lineage.userId,
            createdAtMachine: lineage.machineId,
            createdAtLocation: lineage.locationId,
          },
        });
        saved[index] = toMovement(row);
      }
      return saved;
    });
  }

  async onHand(locationId: string, productId: string): Promise<number> {
    if (!Uuid.test(locationId) || !Uuid.test(productId)) return 0;
    const row = await this.db.inventory.findUnique({ where: { locationId_productId: { locationId, productId } }, select: { stock: true } });
    return row?.stock ?? 0;
  }

  async levels(locationId: string): Promise<StockLevel[]> {
    if (!Uuid.test(locationId)) return [];
    return this.db.inventory.findMany({ where: { locationId }, select: { productId: true, stock: true }, orderBy: { product: { name: 'asc' } } });
  }

  async movements(locationId: string, productId: string, limit?: number): Promise<StockMovement[]> {
    if (!Uuid.test(locationId) || !Uuid.test(productId)) return [];
    // Lines saved together share the database's clock, so the id (which counts up) settles the order.
    const rows = await this.db.inventoryLog.findMany({
      where: { locationId, productId },
      orderBy: [{ createdAtDate: 'desc' }, { id: 'desc' }],
      ...(limit === undefined ? {} : { take: limit }),
    });
    return rows.map(toMovement);
  }
}

/** Every shop and product a batch names exists, or nothing in it is saved. */
async function requireKnown(tx: Prisma.TransactionClient, changes: StockChange[]) {
  const locationIds = [...new Set(changes.map((change) => change.locationId))];
  const productIds = [...new Set(changes.map((change) => change.productId))];
  if ((await tx.location.count({ where: { id: { in: locationIds } } })) !== locationIds.length) throw new Refusal('not-found', NoSuchShop);
  if ((await tx.product.count({ where: { id: { in: productIds } } })) !== productIds.length) throw new Refusal('not-found', NoSuchProduct);
}
