import { randomUUID } from 'node:crypto';
import { NotOnThisServer, ProductDefaults, type Lineage } from '@kvnsys/core';
import {
  createPrismaClient,
  PrismaCatalogBook,
  PrismaProductCatalog,
  PrismaRegisterBook,
  PrismaRoleCatalog,
  PrismaUserAccounts,
  type PrismaClient,
} from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const brand = (code: string, name: string) => ({ code, name, address: null, parentId: null, status: 'Active' as const, description: null });

describeWithDatabase("every list's history, read from PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let shopId: string;
  let serverPc: string;
  let counter: string;
  let atServer: Lineage;
  let atCounter: Lineage;

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    shopId = randomUUID();
    await db.location.create({ data: { id: shopId, code: 'HQ', name: 'Kenlyn' } });
    serverPc = randomUUID();
    counter = randomUUID();
    await db.machine.create({ data: { id: serverPc, code: 'HQ-SRV', name: 'Server', machineUuid: 'hw-server', machineName: 'SERVER-PC', locationId: shopId } });
    await db.machine.create({ data: { id: counter, code: 'HQ-R01', name: 'Counter 1', machineUuid: 'hw-counter', machineName: 'COUNTER-PC', locationId: shopId } });
    const role = randomUUID();
    await db.role.create({ data: { id: role, code: 'ADMIN', name: 'Administrator', level: 100 } });
    const accounts = new PrismaUserAccounts(db);
    const person = (username: string, firstName: string, middleName: string | null, lastName: string) =>
      accounts.create({ username, firstName, middleName, lastName, roleId: role, status: 'Active' }, 'hash', { userId: null, machineId: null, locationId: null });
    const admin = await person('admin', 'System', null, 'Administrator');
    const ana = await person('ana', 'Ana', 'Santos', 'Cruz');
    atServer = { userId: admin.id, machineId: serverPc, locationId: shopId };
    atCounter = { userId: ana.id, machineId: counter, locationId: shopId };
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('names who made a record, on which machine, at which shop and when; never updated, the updated half is empty', async () => {
    const catalog = new PrismaCatalogBook(db);
    const before = Date.now();
    await catalog.create('brands', brand('BR-HAN', 'Hanabishi'), atServer);
    const [hanabishi] = await catalog.list('brands');
    expect(hanabishi!.history).toEqual({
      createdAt: expect.stringMatching(/Z$/),
      createdBy: 'System Administrator (admin)',
      createdMachine: 'Server',
      createdShop: 'Kenlyn',
      updatedAt: null,
      updatedBy: null,
      updatedMachine: null,
      updatedShop: null,
    });
    expect(Date.parse(hanabishi!.history.createdAt)).toBeGreaterThanOrEqual(before - 5000);
  });

  it('names who updated it last, apart from who made it, each row its own', async () => {
    const catalog = new PrismaCatalogBook(db);
    const made = await catalog.create('brands', brand('BR-HAN', 'Hanabishi'), atServer);
    await catalog.update('brands', made.id, brand('BR-HAN', 'Hanabishi Electric'), atCounter);
    await catalog.create('brands', brand('BR-ASA', 'Asahi'), atCounter);
    const [asahi, changed] = await catalog.list('brands');
    expect(changed!.history).toMatchObject({
      createdBy: 'System Administrator (admin)',
      createdMachine: 'Server',
      updatedBy: 'Ana Santos Cruz (ana)',
      updatedMachine: 'Counter 1',
      updatedShop: 'Kenlyn',
    });
    expect(Date.parse(changed!.history.updatedAt!)).toBeGreaterThanOrEqual(Date.parse(changed!.history.createdAt));
    expect([asahi!.name, asahi!.history.createdBy, asahi!.history.createdMachine, asahi!.history.updatedAt]).toEqual(['Asahi', 'Ana Santos Cruz (ana)', 'Counter 1', null]);
  });

  it("leaves the person out when nobody signed in made it, and says so when a name isn't on this server", async () => {
    await new PrismaRoleCatalog(db).create({ name: 'Cashier', status: 'Active', rights: [] }, { userId: null, machineId: serverPc, locationId: shopId });
    const cashier = (await new PrismaRoleCatalog(db).list()).find((role) => role.name === 'Cashier')!;
    expect(cashier.history).toMatchObject({ createdBy: null, createdMachine: 'Server', createdShop: 'Kenlyn' });

    // Made at another shop, by someone this server has never had: lineage isn't a foreign key.
    const elsewhere = { userId: randomUUID(), machineId: randomUUID(), locationId: randomUUID() };
    await new PrismaCatalogBook(db).create('brands', brand('BR-HQ', 'From HQ'), elsewhere);
    const [fromHq] = await new PrismaCatalogBook(db).list('brands');
    expect(fromHq!.history).toMatchObject({ createdBy: NotOnThisServer, createdMachine: NotOnThisServer, createdShop: NotOnThisServer });
  });

  it('comes with every list: products, the catalogue, users, roles and machines, which also carry their hardware id', async () => {
    await new PrismaProductCatalog(db).create({ ...ProductDefaults, code: 'PRD-1', barcode: null, name: 'Stand fan', retailPrice: 189900, status: 'Active', description: null }, atCounter);
    expect((await new PrismaProductCatalog(db).list())[0]!.history).toMatchObject({ createdBy: 'Ana Santos Cruz (ana)', createdMachine: 'Counter 1' });
    expect((await new PrismaUserAccounts(db).list()).map((account) => account.history.createdAt)).toHaveLength(2);
    expect((await new PrismaRoleCatalog(db).list())[0]!.history.createdAt).toMatch(/Z$/);
    const machines = await new PrismaRegisterBook(db).list(shopId);
    expect(machines.map((machine) => [machine.code, machine.hardwareId, machine.description, typeof machine.history.createdAt])).toEqual([
      ['HQ-SRV', 'hw-server', null, 'string'],
      ['HQ-R01', 'hw-counter', null, 'string'],
    ]);
  });
});
