import {
  checkProduct,
  checkProductPicture,
  chosenEntryGone,
  newId,
  parsePesos,
  pesosText,
  ProductCatalog,
  ProductSortingFields,
  Refusal,
  type FullProductDetails,
  type Lineage,
  type Product,
  type ProductDetails,
  type ProductSortingField,
  type ProductStatus,
} from '@kvnsys/core';
import { auditValues, pictureText, recordChanged, recordCreated } from '../audits/audit-log.js';
import { Prisma, type PrismaClient, type Product as ProductRow } from '../generated/prisma/client.js';

/** A row without its picture: lists and finds never carry it, only picture() does. */
type ProductRowWithoutPicture = Omit<ProductRow, 'image'>;
const WithoutPicture = { omit: { image: true } } as const;

/** Exact numeric to centavos, through text, never a float. */
function centavos(code: string, what: string, value: Prisma.Decimal): number {
  const amount = parsePesos(value.toFixed(2));
  if (amount === null) throw new Error(`The ${what} of product ${code} isn't an amount: ${value.toString()}`);
  return amount;
}

/** A row as KVNsys sees it, and whether it has a picture (worked out apart: see withPictures). */
function fromRow(row: ProductRowWithoutPicture, hasPicture: boolean): Product {
  return {
    id: row.id,
    hasPicture,
    code: row.code,
    barcode: row.barcode,
    name: row.name,
    retailPrice: centavos(row.code, 'price', row.retailPrice),
    status: row.status as ProductStatus,
    description: row.description,
    categoryId: row.categoryId,
    brandId: row.brandId,
    supplierId: row.supplierId,
    manufacturerId: row.manufacturerId,
    unitOfMeasure: row.unitOfMeasure,
    tracksStock: row.tracksStock,
    costPrice: centavos(row.code, 'cost', row.costPrice),
    promoPrice: row.promoPrice === null ? null : centavos(row.code, 'promo price', row.promoPrice),
    wholesalePrice: row.wholesalePrice === null ? null : centavos(row.code, 'wholesale price', row.wholesalePrice),
    wholesaleQuantity: row.wholesaleQuantity,
    hasWarranty: row.hasWarranty,
    warrantyMonths: row.warrantyMonths,
  };
}

function toRow(product: FullProductDetails) {
  const pesos = (amount: number | null) => (amount === null ? null : pesosText(amount));
  return {
    code: product.code,
    barcode: product.barcode,
    name: product.name,
    retailPrice: pesosText(product.retailPrice),
    status: product.status,
    description: product.description,
    categoryId: product.categoryId,
    brandId: product.brandId,
    supplierId: product.supplierId,
    manufacturerId: product.manufacturerId,
    unitOfMeasure: product.unitOfMeasure,
    tracksStock: product.tracksStock,
    costPrice: pesosText(product.costPrice),
    promoPrice: pesos(product.promoPrice),
    wholesalePrice: pesos(product.wholesalePrice),
    wholesaleQuantity: product.wholesaleQuantity,
    hasWarranty: product.hasWarranty,
    warrantyMonths: product.warrantyMonths,
  };
}

/**
 * A picture to save: checked, or null for none. Left out (undefined), a change keeps the one it
 * has. Copied into bytes of its own, as Prisma takes them (never a view of a shared buffer).
 */
function pictureColumn(picture: Uint8Array | null | undefined) {
  if (picture === undefined) return {};
  return { image: picture === null ? null : new Uint8Array(checkProductPicture(picture)) };
}

/** Products, kept in PostgreSQL. The rules are KVNsysCore's; this checks them before every save. */
export class PrismaProductCatalog extends ProductCatalog {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async create(details: ProductDetails, lineage: Lineage, picture: Uint8Array | null = null): Promise<Product> {
    const product = checkProduct(details);
    const image = pictureColumn(picture);
    return this.saving(async (tx) => {
      await refuseClashes(tx, product, null);
      await refuseGoneChoices(tx, product);
      const row = await tx.product.create({
        data: {
          id: newId(),
          ...toRow(product),
          ...image,
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
        },
        ...WithoutPicture,
      });
      await recordCreated(tx, audited(row.id, lineage), { ...auditValues(row), image: picture === null ? null : pictureText(picture) });
      return fromRow(row, picture !== null);
    });
  }

  async update(id: string, details: ProductDetails, lineage: Lineage, picture?: Uint8Array | null): Promise<Product> {
    const product = checkProduct(details);
    const image = pictureColumn(picture);
    return this.saving(async (tx) => {
      const existing = await tx.product.findUnique({ where: { id }, ...WithoutPicture });
      if (!existing) throw new Refusal('not-found', "That product isn't in the catalog any more.");
      // The picture is read only when this save replaces or removes it; otherwise it isn't touched.
      const pictureBefore = picture === undefined ? undefined : (await tx.product.findUnique({ where: { id }, select: { image: true } }))?.image ?? null;
      await refuseClashes(tx, product, id);
      await refuseGoneChoices(tx, product);
      const row = await tx.product.update({
        where: { id },
        data: {
          ...toRow(product),
          ...image,
          updatedByUser: lineage.userId,
          updatedAtMachine: lineage.machineId,
          updatedAtLocation: lineage.locationId,
          updatedAtDate: new Date(),
        },
        ...WithoutPicture,
      });
      const pictures = (bytes: Uint8Array | null | undefined): Record<string, string | null> =>
        bytes === undefined ? {} : { image: bytes === null ? null : pictureText(bytes) };
      await recordChanged(tx, audited(id, lineage), { ...auditValues(existing), ...pictures(pictureBefore) }, { ...auditValues(row), ...pictures(picture) });
      if (picture !== undefined) return fromRow(row, picture !== null);
      return (await withPictures(tx, [row]))[0]!;
    });
  }

  async get(id: string): Promise<Product | null> {
    const row = await this.db.product.findUnique({ where: { id }, ...WithoutPicture });
    return row ? (await withPictures(this.db, [row]))[0]! : null;
  }

  async picture(id: string): Promise<Uint8Array | null> {
    const row = await this.db.product.findUnique({ where: { id }, select: { image: true } });
    return row?.image ?? null;
  }

  findByCode(code: string): Promise<Product | null> {
    return this.findOne(Prisma.sql`lower(code) = lower(${code.trim()})`);
  }

  findByBarcode(barcode: string): Promise<Product | null> {
    return this.findOne(Prisma.sql`lower(barcode) = lower(${barcode.trim()})`);
  }

  async list(): Promise<Product[]> {
    const rows = await this.db.product.findMany({ orderBy: [{ name: 'asc' }, { code: 'asc' }], ...WithoutPicture });
    return withPictures(this.db, rows);
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

/** Every product save is a person's, through the product form. */
const audited = (recordId: string, lineage: Lineage) => ({ table: 'products', recordId, lineage, source: 'Manual' as const });

/** The rows as products, each saying whether it has a picture: one question for them all, no picture read. */
async function withPictures(db: Prisma.TransactionClient | PrismaClient, rows: ProductRowWithoutPicture[]): Promise<Product[]> {
  if (rows.length === 0) return [];
  const pictured = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM products WHERE id = ANY (${rows.map((row) => row.id)}::uuid[]) AND image IS NOT NULL`;
  const has = new Set(pictured.map((row) => row.id));
  return rows.map((row) => fromRow(row, has.has(row.id)));
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

/** Each list's table. Fixed here, never from what a request sends, so it's safe to put in SQL. */
const SortingTables: Record<ProductSortingField, string> = {
  categoryId: 'categories',
  brandId: 'brands',
  supplierId: 'suppliers',
  manufacturerId: 'manufacturers',
};

/**
 * A category, brand, supplier or manufacturer the product is sorted under has to be there still.
 * Someone may have chosen it a moment before another register's change took it away; the foreign
 * key would refuse it anyway, but not in words.
 */
async function refuseGoneChoices(tx: Prisma.TransactionClient, product: FullProductDetails) {
  for (const field of ProductSortingFields) {
    const id = product[field];
    if (id === null) continue;
    const found = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM ${Prisma.raw(`"${SortingTables[field]}"`)} WHERE id = ${id}::uuid`;
    if (found.length === 0) throw new Refusal('invalid', chosenEntryGone(field));
  }
}

function refuse(message: string): never {
  throw new Refusal('conflict', message);
}
