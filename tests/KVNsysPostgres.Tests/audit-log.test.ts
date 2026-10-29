import { randomUUID } from 'node:crypto';
import { ProductDefaults } from '@kvnsys/core';
import {
  createPrismaClient,
  PrismaCatalogBook,
  PrismaProductCatalog,
  PrismaRegisterBook,
  PrismaRoleCatalog,
  PrismaSetupStore,
  PrismaUserAccounts,
  type PrismaClient,
} from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const ana = { userId: '0199c7a0-0000-7000-8000-000000000001', machineId: '0199c7a0-0000-7000-8000-000000000002', locationId: '0199c7a0-0000-7000-8000-000000000003' };

const rice = {
  ...ProductDefaults,
  code: 'PRD-0042',
  barcode: '4800016641503',
  name: 'Sack of rice 25kg',
  retailPrice: 145050,
  status: 'Active' as const,
  description: null,
};

const entry = (code: string, name: string) => ({ code, name, address: null, parentId: null, status: 'Active' as const, description: null });

/** A small JPEG's first and last bytes are enough: the server only checks it's a JPEG. */
const jpeg = (filler: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, filler, filler, 0xff, 0xd9]);

describeWithDatabase('the audit log, written by every save', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;

  /** One record's rows, oldest first, as [column, before, after, type, source]. */
  async function logged(table: string, recordId: string) {
    const rows = await db.audit.findMany({ where: { tableName: table, recordId }, orderBy: { id: 'asc' } });
    return rows.map((row) => [row.columnName, row.valueBefore, row.valueAfter, row.changeType, row.changeSource]);
  }

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it("logs a new product's every column with a value, who added it and where, and no lineage columns", async () => {
    const product = await new PrismaProductCatalog(db).create(rice, ana, jpeg(1));
    const rows = await logged('products', product.id);
    expect(rows).toContainEqual(['code', null, 'PRD-0042', 'Created', 'Manual']);
    expect(rows).toContainEqual(['retail_price', null, '1450.50', 'Created', 'Manual']);
    expect(rows).toContainEqual(['tracks_stock', null, 'true', 'Created', 'Manual']);
    expect(rows.find((row) => row[0] === 'image')?.[2]).toMatch(/^a picture, 1 KB \([0-9a-f]{12}\)$/);
    expect(rows.map((row) => row[0])).not.toContain('description');
    expect(rows.map((row) => row[0]).filter((column) => /^(id|created_|updated_)/.test(String(column)))).toEqual([]);
    const one = await db.audit.findFirstOrThrow({ where: { recordId: product.id } });
    expect(one).toMatchObject({ implementedByUser: ana.userId, implementedAtMachine: ana.machineId, implementedAtLocation: ana.locationId });
  });

  it("logs only what a product save changed, the picture only when it's replaced, and nothing when nothing changed", async () => {
    const catalog = new PrismaProductCatalog(db);
    const product = await catalog.create(rice, ana, jpeg(1));
    const created = (await logged('products', product.id)).length;

    await catalog.update(product.id, { ...rice, retailPrice: 149900, description: 'Dinorado' }, ana);
    expect((await logged('products', product.id)).slice(created)).toEqual([
      ['retail_price', '1450.50', '1499.00', 'Updated', 'Manual'],
      ['description', null, 'Dinorado', 'Updated', 'Manual'],
    ]);

    await catalog.update(product.id, { ...rice, retailPrice: 149900, description: 'Dinorado' }, ana);
    expect(await logged('products', product.id)).toHaveLength(created + 2);

    await catalog.update(product.id, { ...rice, retailPrice: 149900, description: 'Dinorado' }, ana, jpeg(2));
    const replaced = (await logged('products', product.id)).slice(created + 2);
    expect(replaced).toHaveLength(1);
    expect(replaced[0]![0]).toBe('image');
    expect(replaced[0]![1]).not.toBe(replaced[0]![2]);

    await catalog.update(product.id, { ...rice, retailPrice: 149900, description: 'Dinorado' }, ana, null);
    expect((await logged('products', product.id)).at(-1)).toEqual(['image', replaced[0]![2], null, 'Updated', 'Manual']);
  });

  it('keeps no log of a save that was refused', async () => {
    const catalog = new PrismaProductCatalog(db);
    const first = await catalog.create(rice, ana);
    const second = await catalog.create({ ...rice, code: 'PRD-0007', barcode: null, name: 'Sardines' }, ana);
    const before = await db.audit.count();
    await expect(catalog.update(second.id, { ...rice, name: 'Sardines' }, ana)).rejects.toMatchObject({ kind: 'conflict' });
    expect(await db.audit.count()).toBe(before);
    expect(first.id).not.toBe(second.id);
  });

  it('logs the four lists, in their own table names, and switching an entry off as Decommissioned', async () => {
    const book = new PrismaCatalogBook(db);
    const brand = await book.create('brands', entry('BR-001', 'Hanabishi'), ana);
    await book.update('brands', brand.id, { ...entry('BR-001', 'Hanabishi'), status: 'Inactive' }, ana);
    expect(await logged('brands', brand.id)).toEqual([
      ['code', null, 'BR-001', 'Created', 'Manual'],
      ['name', null, 'Hanabishi', 'Created', 'Manual'],
      ['status', null, 'Active', 'Created', 'Manual'],
      ['status', 'Active', 'Inactive', 'Decommissioned', 'Manual'],
    ]);
    const appliances = await book.create('categories', entry('CAT-APP', 'Appliances'), ana);
    const fans = await book.create('categories', entry('CAT-FAN', 'Fans'), ana);
    await book.update('categories', fans.id, { ...entry('CAT-FAN', 'Fans'), parentId: appliances.id }, ana);
    expect((await logged('categories', fans.id)).at(-1)).toEqual(['parent_category_id', null, appliances.id, 'Updated', 'Manual']);
    const supplier = await book.create('suppliers', { ...entry('SUP-001', 'Asia Appliances'), address: 'Lucena City' }, ana);
    expect(await logged('suppliers', supplier.id)).toContainEqual(['address', null, 'Lucena City', 'Created', 'Manual']);
  });

  it("logs a role's rights as one list, before and after, when one is given or taken away", async () => {
    const roles = new PrismaRoleCatalog(db);
    const accounts = new PrismaUserAccounts(db);
    const admin = randomUUID();
    await db.role.create({ data: { id: admin, code: 'ADMIN', name: 'Administrator', level: 100 } });
    await accounts.create({ username: 'admin', firstName: 'A', middleName: null, lastName: 'B', roleId: admin, status: 'Active' }, 'hash', ana);

    const cashier = await roles.create({ name: 'Cashier', status: 'Active', rights: ['users.view', 'products.view'] }, ana);
    expect(await logged('roles', cashier.id)).toContainEqual(['accesses', null, 'products.view, users.view', 'Created', 'Manual']);
    await roles.update(cashier.id, { name: 'Cashier', status: 'Active', rights: ['users.view'] }, ana);
    expect((await logged('roles', cashier.id)).at(-1)).toEqual(['accesses', 'products.view, users.view', 'users.view', 'Updated', 'Manual']);
  });

  it("logs that an account's password was set or changed, never the password", async () => {
    const accounts = new PrismaUserAccounts(db);
    const admin = randomUUID();
    await db.role.create({ data: { id: admin, code: 'ADMIN', name: 'Administrator', level: 100 } });
    const person = { username: 'ana', firstName: 'Ana', middleName: null, lastName: 'Cruz', roleId: admin, status: 'Active' as const };
    const account = await accounts.create(person, 'scrypt$first', ana);
    await accounts.setPassword(account.id, 'scrypt$second', ana);
    await accounts.update(account.id, { ...person, lastName: 'Reyes' }, ana);
    const rows = await logged('users', account.id);
    expect(rows).toContainEqual(['password_hash', null, '(hidden)', 'Created', 'Manual']);
    expect(rows.slice(-2)).toEqual([
      ['password_hash', '(hidden)', '(hidden)', 'Updated', 'Manual'],
      ['last_name', 'Cruz', 'Reyes', 'Updated', 'Manual'],
    ]);
    const everything = JSON.stringify(await db.audit.findMany());
    expect(everything).not.toContain('scrypt$');
  });

  it('logs a PC recording itself and its new Windows name as Automatic, and a change on the screen as Manual', async () => {
    const shop = (await db.location.create({ data: { id: randomUUID(), code: 'HQ', name: 'Head Office' } })).id;
    const book = new PrismaRegisterBook(db);
    const pc = await book.recognise({ hardwareId: 'pc-1', computerName: 'OLD-NAME' }, shop, ana);
    await book.recognise({ hardwareId: 'pc-1', computerName: 'NEW-NAME' }, shop, ana);
    await book.update(pc.id, { name: 'Counter 1', status: 'Active' }, ana);
    const rows = await logged('machines', pc.id);
    expect(rows).toContainEqual(['machine_uuid', null, 'pc-1', 'Created', 'Automatic']);
    expect(rows.slice(-2)).toEqual([
      ['machine_name', 'OLD-NAME', 'NEW-NAME', 'Updated', 'Automatic'],
      ['name', 'New register (OLD-NAME)', 'Counter 1', 'Updated', 'Manual'],
    ]);
  });

  it("logs setting a shop up as Automatic, by nobody, including the Administrator role's rights", async () => {
    const lineage = { userId: null, machineId: randomUUID(), locationId: randomUUID() };
    const roleId = randomUUID();
    await new PrismaSetupStore(db).transaction(async (tx) => {
      await tx.createLocation({ id: lineage.locationId, code: 'HQ', name: 'Kenlyn', lineage });
      await tx.createMachine({ id: lineage.machineId, code: 'HQ-SRV', name: 'Server', machineUuid: 'srv', machineName: 'SERVER-PC', locationId: lineage.locationId, lineage });
      await tx.createRole({ id: roleId, code: 'ADMIN', name: 'Administrator', level: 100, lineage });
      await tx.addAccess({ id: randomUUID(), roleId, access: 'users.manage', description: '', lineage });
      await tx.createUser({ id: randomUUID(), username: 'admin', firstName: 'System', lastName: 'Administrator', passwordHash: 'scrypt$x', roleId, lineage });
    });
    expect(await logged('locations', lineage.locationId)).toContainEqual(['name', null, 'Kenlyn', 'Created', 'Automatic']);
    expect(await logged('machines', lineage.machineId)).toContainEqual(['machine_name', null, 'SERVER-PC', 'Created', 'Automatic']);
    expect((await logged('roles', roleId)).at(-1)).toEqual(['accesses', null, 'users.manage', 'Updated', 'Automatic']);
    const users = await db.audit.findMany({ where: { tableName: 'users' } });
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((row) => row.implementedByUser === null && row.changeSource === 'Automatic')).toBe(true);
    expect(users.find((row) => row.columnName === 'password_hash')?.valueAfter).toBe('(hidden)');
  });
});
