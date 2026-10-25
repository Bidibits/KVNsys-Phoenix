import { randomUUID } from 'node:crypto';
import { createPrismaClient, type PrismaClient } from '@kvnsys/postgres';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

/** Every table Release/SCHEMA-PLAN.md names, 1 to 29. Its 30th, schema_migrations, is Prisma's own record. */
const PlannedTables = [
  'countries', 'regions', 'provinces', 'municipalities', 'barangays',
  'locations', 'roles', 'accesses', 'users', 'machines', 'audits',
  'brands', 'manufacturers', 'suppliers', 'categories', 'affiliations', 'products',
  'stock_documents', 'stock_document_items', 'inventory', 'inventory_logs',
  'shifts', 'receipts', 'receipt_items', 'receipt_payments',
  'transfer_imports', 'sales_imports', 'consolidated_sales',
  'user_settings',
];

describeWithDatabase("SCHEMA-PLAN's tables in PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let shop: string;
  let product: string;
  let supplier: string;

  const named = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    shop = (await db.location.create({ data: { id: randomUUID(), code: 'HQ', name: 'Head Office' } })).id;
    product = (await db.product.create({ data: { id: randomUUID(), code: 'PRD-0001', name: 'Electric fan', retailPrice: '1499.00' } })).id;
    supplier = (await db.supplier.create({ data: { id: randomUUID(), code: 'SUP-001', name: 'Asia Appliances' } })).id;
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    await database?.drop();
  });

  it('has every table the plan names', async () => {
    const rows = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const present = rows.map((row) => row.table_name);
    expect(PlannedTables.filter((table) => !present.includes(table))).toEqual([]);
  });

  it('chains places from a country down to a barangay, and a shop can point at them', async () => {
    await db.country.create({ data: { code: 'PH', name: 'Philippines' } });
    await db.region.create({ data: { code: '0400000000', name: 'CALABARZON', countryCode: 'PH' } });
    await db.province.create({ data: { code: '0456000000', name: 'Quezon', regionCode: '0400000000' } });
    const lopez = await db.municipality.create({ data: { code: '0456200000', name: 'Lopez', provinceCode: '0456000000' } });
    expect(lopez.type).toBe('Municipality');
    await db.barangay.create({ data: { code: '0456200001', name: 'Poblacion', municipalityCode: '0456200000' } });
    const branch = await db.location.create({
      data: { id: randomUUID(), code: 'LOPEZ', name: 'Lopez branch', countryCode: 'PH', regionCode: '0400000000', provinceCode: '0456000000', municipalityCode: '0456200000', barangayCode: '0456200001' },
    });
    expect(branch.barangayCode).toBe('0456200001');

    await expect(db.location.create({ data: { id: randomUUID(), code: named('X'), name: 'Nowhere', regionCode: '9999999999' } })).rejects.toThrow();
    await expect(db.region.create({ data: { code: '0500000000', name: 'Bicol', countryCode: 'XX' } })).rejects.toThrow();
    await expect(db.municipality.create({ data: { code: '0456300000', name: 'Gumaca', provinceCode: '0456000000', type: 'Town' } })).rejects.toThrow(/municipalities_type_known/);
    expect((await db.municipality.create({ data: { code: '0456400000', name: 'Lucena', provinceCode: '0456000000', type: 'City' } })).type).toBe('City');
  });

  it('keeps every product field the plan names, with safe defaults, and refuses nonsense', async () => {
    const brand = await db.brand.create({ data: { id: randomUUID(), code: 'BR-001', name: 'Hanabishi' } });
    const maker = await db.manufacturer.create({ data: { id: randomUUID(), code: 'MF-001', name: 'Hanabishi Corp.' } });
    const appliances = await db.category.create({ data: { id: randomUUID(), code: 'CAT-APP', name: 'Appliances' } });
    const fans = await db.category.create({ data: { id: randomUUID(), code: 'CAT-FAN', name: 'Fans', parentCategoryId: appliances.id } });
    await db.affiliation.create({ data: { id: randomUUID(), brandId: brand.id, manufacturerId: maker.id, supplierId: supplier, categoryId: fans.id } });

    const plain = await db.product.findUniqueOrThrow({ where: { id: product } });
    expect(plain).toMatchObject({ tracksStock: true, hasWarranty: false, warrantyMonths: 0, image: null, promoPrice: null });
    expect(plain.costPrice.toString()).toBe('0');

    const full = await db.product.create({
      data: {
        id: randomUUID(), code: 'PRD-0002', barcode: '4800000000017', name: 'Stand fan 16"', image: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        categoryId: fans.id, brandId: brand.id, supplierId: supplier, manufacturerId: maker.id, unitOfMeasure: 'pc', tracksStock: true,
        costPrice: '1100.00', retailPrice: '1499.00', promoPrice: '1399.00', wholesalePrice: '1350.00', wholesaleQuantity: 5,
        hasWarranty: true, warrantyMonths: 12,
      },
    });
    expect(full).toMatchObject({ categoryId: fans.id, wholesaleQuantity: 5, warrantyMonths: 12, unitOfMeasure: 'pc' });

    const bad = (data: Record<string, unknown>) => db.product.create({ data: { id: randomUUID(), code: named('PRD'), name: 'Bad', retailPrice: '1.00', ...data } });
    await expect(bad({ costPrice: '-1.00' })).rejects.toThrow(/products_other_prices_not_negative/);
    await expect(bad({ promoPrice: '-0.01' })).rejects.toThrow(/products_other_prices_not_negative/);
    await expect(bad({ wholesaleQuantity: 0 })).rejects.toThrow(/products_wholesale_quantity_sensible/);
    await expect(bad({ warrantyMonths: -1 })).rejects.toThrow(/products_warranty_months_not_negative/);
    await expect(bad({ categoryId: randomUUID() })).rejects.toThrow();
  });

  it('keeps reorder levels on stock, with a ceiling never below the floor', async () => {
    const row = await db.inventory.create({ data: { locationId: shop, productId: product, minStock: 2, maxStock: 10, reorderPoint: 4 } });
    expect(row).toMatchObject({ stock: 0, minStock: 2, maxStock: 10, reorderPoint: 4 });
    await expect(db.inventory.update({ where: { locationId_productId: { locationId: shop, productId: product } }, data: { maxStock: 1 } })).rejects.toThrow(
      /inventory_reorder_levels_sensible/,
    );
    await expect(db.inventory.update({ where: { locationId_productId: { locationId: shop, productId: product } }, data: { reorderPoint: -1 } })).rejects.toThrow(
      /inventory_reorder_levels_sensible/,
    );
  });

  it("takes all seven of the plan's kinds of stock movement", async () => {
    const kinds = ['from_supplier', 'to_supplier', 'transfer', 'to_customer', 'from_customer', 'disposal', 'adjustment'];
    for (const kind of kinds) {
      await db.$executeRaw`INSERT INTO inventory_logs (id, location_id, product_id, quantity_change, movement_type, resulting_on_hand)
                           VALUES (${randomUUID()}::uuid, ${shop}::uuid, ${product}::uuid, 1, ${kind}, 1)`;
    }
    expect(await db.inventoryLog.count({ where: { movementType: { in: kinds } } })).toBe(7);
  });

  it("gives every stock document exactly one supplier or shop at each end, matching its kind", async () => {
    const document = (data: Record<string, unknown>) => db.stockDocument.create({ data: { id: randomUUID(), code: named('DOC'), ...data } as never });
    const delivery = await document({ kind: 'from_supplier', sourceSupplierId: supplier, destinationLocationId: shop });
    expect(delivery.status).toBe('draft');
    await db.stockDocumentItem.create({ data: { id: randomUUID(), documentId: delivery.id, productId: product, expectedQuantity: 10 } });
    expect((await db.stockDocumentItem.findFirstOrThrow({ where: { documentId: delivery.id } })).receivedQuantity).toBe(0);

    await expect(document({ kind: 'from_supplier', sourceSupplierId: supplier, sourceLocationId: shop, destinationLocationId: shop })).rejects.toThrow(/stock_documents_one_source/);
    await expect(document({ kind: 'from_supplier', sourceSupplierId: supplier, destinationLocationId: shop, destinationSupplierId: supplier })).rejects.toThrow(
      /stock_documents_one_destination/,
    );
    await expect(document({ kind: 'transfer', sourceSupplierId: supplier, destinationLocationId: shop })).rejects.toThrow(/stock_documents_kind_matches_ends/);
    await expect(document({ kind: 'lost', sourceLocationId: shop, destinationLocationId: shop })).rejects.toThrow(/stock_documents_kind_matches_ends/);
    await expect(document({ kind: 'to_supplier', sourceLocationId: shop, destinationSupplierId: supplier, status: 'done' })).rejects.toThrow(/stock_documents_status_known/);
    await expect(db.stockDocumentItem.create({ data: { id: randomUUID(), documentId: delivery.id, productId: product, expectedQuantity: -1 } })).rejects.toThrow(
      /stock_document_items_quantities_not_negative/,
    );
  });

  it('keeps the audit log as written, with Beta\'s two lists', async () => {
    const entry = await db.audit.create({
      data: { id: randomUUID(), tableName: 'products', recordId: product, columnName: 'retail_price', valueBefore: '1499.00', valueAfter: '1399.00', changeType: 'Updated', changeSource: 'Manual' },
    });
    const keptAsWritten = /kept as written/;
    await expect(db.audit.update({ where: { id: entry.id }, data: { valueAfter: '1.00' } })).rejects.toThrow(keptAsWritten);
    await expect(db.audit.deleteMany({})).rejects.toThrow(keptAsWritten);
    await expect(db.$executeRawUnsafe('TRUNCATE audits')).rejects.toThrow(keptAsWritten);
    const audit = (data: Record<string, string>) =>
      db.audit.create({ data: { id: randomUUID(), tableName: 'products', recordId: product, changeType: 'Created', changeSource: 'Manual', ...data } });
    await expect(audit({ changeType: 'Deleted' })).rejects.toThrow(/audits_change_type_known/);
    await expect(audit({ changeSource: 'Robot' })).rejects.toThrow(/audits_change_source_known/);
  });

  it('lets a voided receipt be told apart: its reason and when, or neither for a paid one', async () => {
    const receipt = (data: Record<string, unknown>) =>
      db.receipt.create({ data: { id: randomUUID(), code: named('HQ'), locationId: shop, number: Math.floor(Math.random() * 1e9) + 1, subtotal: '10.00', discountTotal: '0.00', total: '10.00', ...data } });
    const paid = await receipt({});
    expect(paid).toMatchObject({ status: 'Paid', voidReason: null, openedAtDate: null, voidedAtDate: null });
    expect(paid.settledAtDate).toBeInstanceOf(Date);
    await expect(receipt({ status: 'Voided' })).rejects.toThrow(/receipts_void_whole/);
    await expect(receipt({ voidReason: 'wrong item' })).rejects.toThrow(/receipts_void_whole/);
    await expect(receipt({ status: 'Refunded' })).rejects.toThrow(/receipts_status_known/);
    expect(await receipt({ status: 'Voided', voidReason: 'rang twice', voidedAtDate: new Date() })).toMatchObject({ status: 'Voided' });
  });

  it("keeps HQ and branch files apart from stock: transfers, sales files, HQ's totals, and a person's settings", async () => {
    await db.transferImport.create({ data: { documentId: randomUUID(), fromLocation: randomUUID(), toLocation: shop, createdAtSource: new Date(), lineCount: 3 } });
    await expect(
      db.transferImport.create({ data: { documentId: randomUUID(), fromLocation: randomUUID(), toLocation: shop, createdAtSource: new Date(), lineCount: -1 } }),
    ).rejects.toThrow(/transfer_imports_line_count_not_negative/);

    const sales = await db.salesImport.create({ data: { documentId: randomUUID(), locationId: randomUUID(), generatedAt: new Date() } });
    await db.consolidatedSale.create({
      data: { id: randomUUID(), documentId: sales.documentId, locationId: sales.locationId, productId: product, productCode: 'PRD-0001', productName: 'Electric fan', quantity: 4, revenue: '5996.00' },
    });
    expect(await db.consolidatedSale.count({ where: { documentId: sales.documentId } })).toBe(1);

    const role = await db.role.create({ data: { id: randomUUID(), code: 'R1', name: 'Anyone' } });
    const user = await db.user.create({ data: { id: randomUUID(), username: 'ana', firstName: 'Ana', lastName: 'Cruz', passwordHash: 'x', roleId: role.id } });
    await db.userSetting.create({ data: { userId: user.id, settings: '{"theme":"Standard"}' } });
    expect((await db.userSetting.findUniqueOrThrow({ where: { userId: user.id } })).settings).toContain('Standard');
  });
});
