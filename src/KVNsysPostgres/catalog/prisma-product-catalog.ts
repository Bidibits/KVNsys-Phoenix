import {
  checkProduct,
  newId,
  parsePesos,
  pesosText,
  ProductCatalog,
  Refusal,
  type Lineage,
  type Product,
  type ProductDetails,
  type ProductStatus,
} from '@kvnsys/core';
import { Prisma, type PrismaClient, type Product as ProductRow } from '../generated/prisma/client.js';

/** A row as KVNsys sees it. The price goes from exact numeric to centavos through text, never a float. */
function fromRow(row: ProductRow): Product {
  const retailPrice = parsePesos(row.retailPrice.toFixed(2));
  if (retailPrice === null) throw new Error(`The price of product ${row.code} isn't an amount: ${row.retailPrice.toString()}`);
  return {
    id: row.id,
    code: row.code,
    barcode: row.barcode,
    name: row.name,
    retailPrice,
    status: row.status as ProductStatus,
    description: row.description,
  };
}

function toRow(product: ProductDetails) {
  return {
    code: product.code,
    barcode: product.barcode,
    name: product.name,
    retailPrice: pesosText(product.retailPrice),
    status: product.status,
    description: product.description,
  };
}

/** Products, kept in PostgreSQL. The rules are KVNsysCore's; this checks them before every save. */
export class PrismaProductCatalog extends ProductCatalog {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async create(details: ProductDetails, lineage: Lineage): Promise<Product> {
    const product = checkProduct(details);
    return this.saving(async (tx) => {
      await refuseClashes(tx, product, null);
      const row = await tx.product.create({
        data: {
          id: newId(),
          ...toRow(product),
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
        },
      });
      return fromRow(row);
    });
  }

  async update(id: string, details: ProductDetails, lineage: Lineage): Promise<Product> {
    const product = checkProduct(details);
    return this.saving(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw new Refusal('not-found', "That product isn't in the catalog any more.");
      await refuseClashes(tx, product, id);
      const row = await tx.product.update({
        where: { id },
        data: {
          ...toRow(product),
          updatedByUser: lineage.userId,
          updatedAtMachine: lineage.machineId,
          updatedAtLocation: lineage.locationId,
          updatedAtDate: new Date(),
        },
      });
      return fromRow(row);
    });
  }

  async get(id: string): Promise<Product | null> {
    const row = await this.db.product.findUnique({ where: { id } });
    return row ? fromRow(row) : null;
  }

  findByCode(code: string): Promise<Product | null> {
    return this.findOne(Prisma.sql`lower(code) = lower(${code.trim()})`);
  }

  findByBarcode(barcode: string): Promise<Product | null> {
    return this.findOne(Prisma.sql`lower(barcode) = lower(${barcode.trim()})`);
  }

  async list(): Promise<Product[]> {
    const rows = await this.db.product.findMany({ orderBy: [{ name: 'asc' }, { code: 'asc' }] });
    return rows.map(fromRow);
  }

  /** Capitals ignored, which saving keeps unambiguous: no two products share a code or barcode that way. */
  private async findOne(where: Prisma.Sql): Promise<Product | null> {
    const ids = await this.db.$queryRaw<{ id: string }[]>`SELECT id FROM products WHERE ${where} LIMIT 1`;
    return ids[0] ? this.get(ids[0].id) : null;
  }

  /**
   * One transaction per save. The unique indexes are the last word: if two saves race past the
   * clash check with the same code or barcode, the second is refused here.
   */
  private async saving(work: (tx: Prisma.TransactionClient) => Promise<Product>): Promise<Product> {
    try {
      return await this.db.$transaction(work);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Refusal('conflict', 'Another product already has that code or barcode.');
      }
      throw error;
    }
  }
}

/**
 * Refuses a code or barcode that's already another product's code or barcode, ignoring capitals,
 * and names that product, so whoever is encoding knows which one to look at.
 */
async function refuseClashes(tx: Prisma.TransactionClient, product: ProductDetails, ownId: string | null) {
  const values = product.barcode === null ? [product.code] : [product.code, product.barcode];
  const others = await tx.$queryRaw<{ code: string; barcode: string | null; name: string }[]>`
    SELECT code, barcode, name FROM products
     WHERE (${ownId}::uuid IS NULL OR id <> ${ownId}::uuid)
       AND (lower(code) = ANY (SELECT lower(v) FROM unnest(${values}::text[]) AS v)
            OR lower(barcode) = ANY (SELECT lower(v) FROM unnest(${values}::text[]) AS v))`;
  const same = (a: string | null, b: string | null) => a !== null && b !== null && a.toLowerCase() === b.toLowerCase();
  for (const other of others) {
    if (same(other.code, product.code)) refuse(`${product.code} is already the code of ${other.name}.`);
    if (same(other.barcode, product.barcode)) refuse(`${product.barcode} is already the barcode of ${other.name}.`);
    if (same(other.barcode, product.code)) {
      refuse(`${product.code} is already the barcode of ${other.name}, so it can't be this product's code.`);
    }
    if (same(other.code, product.barcode)) {
      refuse(`${product.barcode} is already the code of ${other.name}, so it can't be this product's barcode.`);
    }
  }
}

function refuse(message: string): never {
  throw new Refusal('conflict', message);
}
