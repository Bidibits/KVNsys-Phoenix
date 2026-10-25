import { randomUUID } from 'node:crypto';
import { ProductDefaults } from '@kvnsys/core';
import { createPrismaClient, PrismaCatalogBook, PrismaProductCatalog, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const hq = { userId: '0199c7a0-0000-7000-8000-000000000001', machineId: '0199c7a0-0000-7000-8000-000000000002', locationId: '0199c7a0-0000-7000-8000-000000000003' };
const branch = { userId: '0199c7a0-0000-7000-8000-000000000011', machineId: '0199c7a0-0000-7000-8000-000000000012', locationId: '0199c7a0-0000-7000-8000-000000000013' };

const rice = {
  ...ProductDefaults,
  code: 'PRD-0042',
  barcode: '4800016641503',
  name: 'Sack of rice 25kg',
  retailPrice: 145050,
  status: 'Active' as const,
  description: null,
};
const sardines = { ...rice, code: 'PRD-0007', barcode: '4800249211116', name: 'Sardines 155g', retailPrice: 2575 };

describeWithDatabase('the product catalog in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let catalog: PrismaProductCatalog;

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    catalog = new PrismaProductCatalog(db);
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('saves a product and finds it again by id, code and barcode, ignoring capitals', async () => {
    const saved = await catalog.create({ ...rice, code: ' PRD-0042 ' }, hq);
    expect(saved).toEqual({ ...rice, id: saved.id });
    expect(await catalog.get(saved.id)).toEqual(saved);
    expect(await catalog.findByCode('prd-0042')).toEqual(saved);
    expect(await catalog.findByBarcode(' 4800016641503 ')).toEqual(saved);
    expect(await catalog.findByCode('PRD-9999')).toBeNull();
    expect(await catalog.findByBarcode('PRD-0042')).toBeNull();
  });

  it('keeps the price exact to the centavo, as numeric, never a float', async () => {
    // 0.29 is the trap: in floating point 0.29 * 100 is 28.999..., which a cut-off makes 28 centavos.
    const cheap = await catalog.create({ ...rice, retailPrice: 29 }, hq);
    const dear = await catalog.create({ ...sardines, retailPrice: 99_999_999_999_999 }, hq);
    const stored = await db.$queryRaw<{ code: string; price: string; type: string }[]>`
      SELECT code, retail_price::text AS price, pg_typeof(retail_price)::text AS type FROM products ORDER BY code`;
    expect(stored).toEqual([
      { code: 'PRD-0007', price: '999999999999.99', type: 'numeric' },
      { code: 'PRD-0042', price: '0.29', type: 'numeric' },
    ]);
    expect((await catalog.get(cheap.id))?.retailPrice).toBe(29);
    expect((await catalog.get(dear.id))?.retailPrice).toBe(99_999_999_999_999);
  });

  it('records who made it, where, and when; and who changed it, without losing the first', async () => {
    const saved = await catalog.create(rice, hq);
    const changed = await catalog.update(saved.id, { ...rice, name: 'Rice 25kg', retailPrice: 139900, status: 'Inactive' }, branch);
    expect(changed).toEqual({ ...rice, id: saved.id, name: 'Rice 25kg', retailPrice: 139900, status: 'Inactive' });
    const row = await db.product.findUniqueOrThrow({ where: { id: saved.id } });
    expect(row).toMatchObject({
      createdByUser: hq.userId,
      createdAtMachine: hq.machineId,
      createdAtLocation: hq.locationId,
      updatedByUser: branch.userId,
      updatedAtMachine: branch.machineId,
      updatedAtLocation: branch.locationId,
    });
    expect(row.createdAtDate).toBeInstanceOf(Date);
    expect(row.updatedAtDate!.getTime()).toBeGreaterThanOrEqual(row.createdAtDate.getTime());
  });

  it("refuses another product's code or barcode, ignoring capitals, and names that product", async () => {
    await catalog.create(rice, hq);
    await expect(catalog.create({ ...sardines, code: 'prd-0042' }, hq)).rejects.toMatchObject({
      name: 'Refusal',
      kind: 'conflict',
      message: 'prd-0042 is already the code of Sack of rice 25kg.',
    });
    await expect(catalog.create({ ...sardines, barcode: rice.barcode }, hq)).rejects.toMatchObject({
      kind: 'conflict',
      message: '4800016641503 is already the barcode of Sack of rice 25kg.',
    });
    expect(await catalog.list()).toHaveLength(1);
  });

  it("never lets one product's code be another's barcode, so a scan finds one product at most", async () => {
    await catalog.create(rice, hq);
    await expect(catalog.create({ ...sardines, code: rice.barcode }, hq)).rejects.toMatchObject({
      message: "4800016641503 is already the barcode of Sack of rice 25kg, so it can't be this product's code.",
    });
    await expect(catalog.create({ ...sardines, barcode: 'Prd-0042' }, hq)).rejects.toMatchObject({
      message: "Prd-0042 is already the code of Sack of rice 25kg, so it can't be this product's barcode.",
    });
  });

  it('lets a product use its own barcode as its code, and keep its own code when it changes', async () => {
    const loose = await catalog.create({ ...rice, code: '4800016641503', barcode: '4800016641503' }, hq);
    expect(await catalog.update(loose.id, { ...rice, code: '4800016641503', barcode: '4800016641503', name: 'Rice' }, hq)).toMatchObject({
      name: 'Rice',
    });
    expect(await catalog.findByCode('4800016641503')).toEqual(await catalog.findByBarcode('4800016641503'));
  });

  it('lets any number of products have no barcode', async () => {
    await catalog.create({ ...rice, barcode: null }, hq);
    await catalog.create({ ...sardines, barcode: '' }, hq);
    expect((await catalog.list()).map((p) => p.barcode)).toEqual([null, null]);
  });

  it('checks the rules before touching the database', async () => {
    await expect(catalog.create({ ...rice, name: ' ' }, hq)).rejects.toMatchObject({ kind: 'invalid', message: 'A product needs a name.' });
    await expect(catalog.create({ ...rice, retailPrice: -100 }, hq)).rejects.toMatchObject({ kind: 'invalid' });
    expect(await catalog.list()).toEqual([]);
  });

  it('refuses a negative price even past the rules: the database has its own check', async () => {
    const insert = db.$executeRaw`
      INSERT INTO products (id, code, name, retail_price) VALUES ('0199c7a0-0000-7000-8000-0000000000ff', 'X', 'X', -0.01)`;
    await expect(insert).rejects.toThrow(/products_retail_price_not_negative/);
  });

  it('says so when the product being changed has gone', async () => {
    await expect(catalog.update('0199c7a0-0000-7000-8000-0000000000aa', rice, hq)).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('lists every product by name', async () => {
    await catalog.create(sardines, hq);
    await catalog.create(rice, hq);
    await catalog.create({ ...rice, code: 'PRD-0100', barcode: null, name: 'Cooking oil 1L', retailPrice: 9800 }, hq);
    expect((await catalog.list()).map((p) => p.name)).toEqual(['Cooking oil 1L', 'Sack of rice 25kg', 'Sardines 155g']);
  });

  /** A category, brand, supplier and manufacturer to sort a product under. */
  async function sorting() {
    const book = new PrismaCatalogBook(db);
    const entry = (code: string, name: string) => ({ code, name, address: null, parentId: null, status: 'Active' as const, description: null });
    return {
      categoryId: (await book.create('categories', entry('CAT-FAN', 'Fans'), hq)).id,
      brandId: (await book.create('brands', entry('HANABISHI', 'Hanabishi'), hq)).id,
      supplierId: (await book.create('suppliers', entry('SUP-001', 'Asia Appliances'), hq)).id,
      manufacturerId: (await book.create('manufacturers', entry('MF-001', 'Hanabishi Corp.'), hq)).id,
    };
  }

  it("keeps every one of the plan's fields, prices exact to the centavo", async () => {
    const fan = {
      ...rice,
      code: 'HNB-SF16',
      barcode: null,
      name: 'Hanabishi stand fan 16"',
      retailPrice: 189900,
      ...(await sorting()),
      unitOfMeasure: 'pc',
      tracksStock: false,
      costPrice: 145029,
      promoPrice: 169929,
      wholesalePrice: 159929,
      wholesaleQuantity: 10,
      hasWarranty: true,
      warrantyMonths: 12,
    };
    const saved = await catalog.create(fan, hq);
    expect(saved).toEqual({ ...fan, id: saved.id });
    expect(await catalog.get(saved.id)).toEqual(saved);
    expect(await catalog.list()).toEqual([saved]);
    const stored = await db.$queryRaw<{ cost: string; promo: string; wholesale: string }[]>`
      SELECT cost_price::text AS cost, promo_price::text AS promo, wholesale_price::text AS wholesale FROM products`;
    expect(stored).toEqual([{ cost: '1450.29', promo: '1699.29', wholesale: '1599.29' }]);
    const changed = await catalog.update(saved.id, { ...fan, promoPrice: null, wholesalePrice: null, wholesaleQuantity: null, hasWarranty: false, warrantyMonths: 0 }, hq);
    expect(changed).toMatchObject({ promoPrice: null, wholesalePrice: null, wholesaleQuantity: null, hasWarranty: false, warrantyMonths: 0 });
  });

  it('refuses a category, brand, supplier or manufacturer that is not there, in words', async () => {
    const chosen = await sorting();
    for (const [field, one] of [['categoryId', 'category'], ['brandId', 'brand'], ['supplierId', 'supplier'], ['manufacturerId', 'manufacturer']]) {
      await expect(catalog.create({ ...rice, ...chosen, [field!]: randomUUID() }, hq), field).rejects.toMatchObject({
        kind: 'invalid',
        message: `That ${one} isn't there any more. Choose another.`,
      });
    }
    expect(await catalog.list()).toEqual([]);
  });

  /** The start of a real JPEG, then filler: enough for KVNsysCore's check. */
  const jpeg = (fill: number, length = 2000) => Uint8Array.from({ length }, (_, i) => [0xff, 0xd8, 0xff, 0xe0][i] ?? fill);

  it('keeps a picture apart from the details: saved with them, kept when a change leaves it out, removed by none', async () => {
    const saved = await catalog.create(rice, hq, jpeg(1));
    expect(saved).not.toHaveProperty('picture');
    expect(await catalog.picture(saved.id)).toEqual(jpeg(1));
    await catalog.update(saved.id, { ...rice, name: 'Rice 25kg' }, hq);
    expect(await catalog.picture(saved.id)).toEqual(jpeg(1));
    await catalog.update(saved.id, rice, hq, jpeg(2));
    expect(await catalog.picture(saved.id)).toEqual(jpeg(2));
    await catalog.update(saved.id, rice, hq, null);
    expect(await catalog.picture(saved.id)).toBeNull();
    expect(await catalog.picture(randomUUID())).toBeNull();
    expect(await catalog.picture((await catalog.create(sardines, hq)).id)).toBeNull();
  });

  it('refuses a picture that is not a JPEG, or too big, before saving anything', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(catalog.create(rice, hq, png)).rejects.toMatchObject({ kind: 'invalid', message: "A product's picture has to be a JPEG." });
    await expect(catalog.create(rice, hq, jpeg(1, 256 * 1024 + 1))).rejects.toMatchObject({ kind: 'invalid' });
    expect(await catalog.list()).toEqual([]);
  });
});
