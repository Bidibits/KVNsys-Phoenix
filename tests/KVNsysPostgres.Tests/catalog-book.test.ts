import { randomUUID } from 'node:crypto';
import { CatalogLists, type CatalogEntryDetails, type CatalogList } from '@kvnsys/core';
import { createPrismaClient, PrismaCatalogBook, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const someone = { userId: randomUUID(), machineId: null, locationId: null };
const entry = (code: string, name: string, extra: Partial<CatalogEntryDetails> = {}): CatalogEntryDetails => ({
  code,
  name,
  address: null,
  parentId: null,
  status: 'Active',
  description: null,
  ...extra,
});

describeWithDatabase("the catalogue's lists in PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let book: PrismaCatalogBook;

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    book = new PrismaCatalogBook(db);
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('adds, lists by name, changes and finds an entry in each of the four lists', async () => {
    for (const list of CatalogLists) {
      const second = await book.create(list, entry('B-2', 'Beta'), someone);
      const first = await book.create(list, entry('A-1', 'Alpha', { description: 'first' }), someone);
      expect((await book.list(list)).map((e) => e.name)).toEqual(['Alpha', 'Beta']);
      const changed = await book.update(list, second.id, entry('B-2', 'Bravo', { status: 'Inactive' }), someone);
      expect(changed).toMatchObject({ id: second.id, name: 'Bravo', status: 'Inactive' });
      expect(await book.get(list, first.id)).toMatchObject({ code: 'A-1', description: 'first', parentName: null });
    }
    // Each list is its own table: four of each, not sixteen in one.
    expect([await db.supplier.count(), await db.brand.count(), await db.manufacturer.count(), await db.category.count()]).toEqual([2, 2, 2, 2]);
    expect((await db.brand.findFirstOrThrow({ where: { code: 'A-1' } })).createdByUser).toBe(someone.userId);
  });

  it("keeps a supplier's address", async () => {
    const supplier = await book.create('suppliers', entry('SUP-001', 'Asia Appliances', { address: 'Quezon Ave., Lucena City' }), someone);
    expect(supplier.address).toBe('Quezon Ave., Lucena City');
    expect((await book.list('suppliers'))[0]!.address).toBe('Quezon Ave., Lucena City');
  });

  it('refuses a code another entry in the same list has, ignoring capitals, and names it; other lists may share it', async () => {
    await book.create('brands', entry('BR-001', 'Hanabishi'), someone);
    await expect(book.create('brands', entry('br-001', 'Imarflex'), someone)).rejects.toMatchObject({
      kind: 'conflict',
      message: 'br-001 is already the code of Hanabishi.',
    });
    const other = await book.create('brands', entry('BR-002', 'Imarflex'), someone);
    await expect(book.update('brands', other.id, entry('BR-001', 'Imarflex'), someone)).rejects.toMatchObject({ kind: 'conflict' });
    expect(await book.update('brands', other.id, entry('br-002', 'Imarflex'), someone)).toMatchObject({ code: 'br-002' });
    expect(await book.create('manufacturers', entry('BR-001', 'Hanabishi Corp.'), someone)).toMatchObject({ code: 'BR-001' });
  });

  it('puts a category inside another, and never lets the tree loop', async () => {
    const appliances = await book.create('categories', entry('CAT-APP', 'Appliances'), someone);
    const fans = await book.create('categories', entry('CAT-FAN', 'Fans', { parentId: appliances.id }), someone);
    const stand = await book.create('categories', entry('CAT-STD', 'Stand fans', { parentId: fans.id }), someone);
    expect(stand).toMatchObject({ parentId: fans.id, parentName: 'Fans' });
    expect((await book.list('categories')).find((e) => e.id === fans.id)).toMatchObject({ parentName: 'Appliances' });

    await expect(book.update('categories', appliances.id, entry('CAT-APP', 'Appliances', { parentId: appliances.id }), someone)).rejects.toMatchObject({
      kind: 'invalid',
      message: "A category can't sit inside itself.",
    });
    await expect(book.update('categories', appliances.id, entry('CAT-APP', 'Appliances', { parentId: stand.id }), someone)).rejects.toMatchObject({
      message: "A category can't sit inside one of the categories inside it.",
    });
    await expect(book.create('categories', entry('CAT-X', 'Lost', { parentId: randomUUID() }), someone)).rejects.toMatchObject({
      message: "That category to put it inside isn't there any more. Choose another.",
    });
    // Moving a category to the top again is fine.
    expect(await book.update('categories', stand.id, entry('CAT-STD', 'Stand fans'), someone)).toMatchObject({ parentId: null, parentName: null });
  });

  it("says so when an entry isn't there, and refuses fields its list doesn't have", async () => {
    const lists: CatalogList[] = ['brands'];
    for (const list of lists) {
      await expect(book.update(list, randomUUID(), entry('X', 'X'), someone)).rejects.toMatchObject({ kind: 'not-found', message: "That brand isn't there any more." });
      expect(await book.get(list, 'not-an-id')).toBeNull();
    }
    await expect(book.create('brands', entry('BR-9', 'With address', { address: 'Lucena' }), someone)).rejects.toMatchObject({ kind: 'invalid' });
  });
});
