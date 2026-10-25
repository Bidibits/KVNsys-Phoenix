import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { listCatalog, loadCatalogEntryForm, saveCatalogEntryForm, signIn, type CatalogEntryForm, type ServerPin, type SessionPass } from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';
const Password = 'a-good-password';

describeWithDatabase("the catalogue's lists over HTTPS, through the client engine, against a real database", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let pin: ServerPin;
  let admin: SessionPass;

  const options = () => ({ pin });
  const form = (code: string, name: string, extra: Partial<CatalogEntryForm> = {}): CatalogEntryForm => ({
    code,
    name,
    address: '',
    parentId: '',
    status: 'Active',
    description: '',
    ...extra,
  });
  const signInAs = async (username: string, password: string) => {
    const result = await signIn(address, { username, password }, { pin });
    if (!result.ok) throw new Error(`${username} couldn't sign in: ${result.message}`);
    return result.session;
  };
  const addPerson = async (username: string, rights: string[]) => {
    const role = await db.role.create({ data: { id: randomUUID(), code: username.toUpperCase(), name: username } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName: username, lastName: 'Tester', passwordHash, roleId: role.id } });
  };

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: AdminPassword,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    await addPerson('viewer', ['products.view']);
    await addPerson('cashier', ['sales.sell']);
    const certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    admin = await signInAs('admin', AdminPassword);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it('adds a supplier with its address, and lists it with what a supplier has', async () => {
    const saved = await saveCatalogEntryForm(address, admin, 'suppliers', null, form(' SUP-001 ', 'Asia Appliances', { address: 'Quezon Ave., Lucena City' }), options());
    expect(saved).toMatchObject({ ok: true, entry: { code: 'SUP-001', name: 'Asia Appliances', address: 'Quezon Ave., Lucena City' } });
    const listed = await listCatalog(address, admin, 'suppliers', options());
    expect(listed).toMatchObject({ ok: true, entries: [{ code: 'SUP-001' }], shape: { title: 'Suppliers', hasAddress: true, hasParent: false } });
    expect((await db.supplier.findFirstOrThrow()).createdByUser).not.toBeNull();
  });

  it("keeps each list to itself: a brand, a manufacturer, and a category inside another", async () => {
    expect(await saveCatalogEntryForm(address, admin, 'brands', null, form('BR-001', 'Hanabishi'), options())).toMatchObject({ ok: true });
    expect(await saveCatalogEntryForm(address, admin, 'manufacturers', null, form('MF-001', 'Hanabishi Corp.'), options())).toMatchObject({ ok: true });
    const appliances = await saveCatalogEntryForm(address, admin, 'categories', null, form('CAT-APP', 'Appliances'), options());
    if (!appliances.ok) throw new Error(appliances.message);

    const blank = await loadCatalogEntryForm(address, admin, 'categories', null, options());
    expect(blank).toMatchObject({ ok: true, shape: { hasParent: true }, parents: [{ name: 'Appliances' }] });
    const fans = await saveCatalogEntryForm(address, admin, 'categories', null, form('CAT-FAN', 'Fans', { parentId: appliances.entry.id }), options());
    expect(fans).toMatchObject({ ok: true, entry: { parentName: 'Appliances' } });
    if (!fans.ok) return;

    // Editing Fans offers every other category to sit inside, never Fans itself.
    const editing = await loadCatalogEntryForm(address, admin, 'categories', fans.entry.id, options());
    expect(editing).toMatchObject({ ok: true, form: { code: 'CAT-FAN', parentId: appliances.entry.id } });
    if (editing.ok) expect(editing.parents.map((p) => p.name)).toEqual(['Appliances']);
    expect(await saveCatalogEntryForm(address, admin, 'categories', appliances.entry.id, form('CAT-APP', 'Appliances', { parentId: fans.entry.id }), options())).toMatchObject({
      ok: false,
      reason: 'refused',
      message: "A category can't sit inside one of the categories inside it.",
    });
    expect([await db.brand.count(), await db.manufacturer.count(), await db.category.count()]).toEqual([1, 1, 2]);
  });

  it('catches a missing name before sending, and the server refuses a code already taken', async () => {
    expect(await saveCatalogEntryForm(address, admin, 'brands', null, form('BR-002', ' '), options())).toEqual({ ok: false, reason: 'refused', message: 'A brand needs a name.' });
    expect(await saveCatalogEntryForm(address, admin, 'brands', null, form('br-001', 'Imarflex'), options())).toEqual({
      ok: false,
      reason: 'refused',
      message: 'br-001 is already the code of Hanabishi.',
    });
  });

  it("lets someone who may see products look, but not change; and someone who may not, not even look", async () => {
    const viewer = await signInAs('viewer', Password);
    expect(await listCatalog(address, viewer, 'brands', options())).toMatchObject({ ok: true, entries: [{ name: 'Hanabishi' }] });
    expect(await saveCatalogEntryForm(address, viewer, 'brands', null, form('BR-003', 'Kyowa'), options())).toEqual({
      ok: false,
      reason: 'not-allowed',
      message: lacksRight('products.manage'),
    });
    const cashier = await signInAs('cashier', Password);
    expect(await listCatalog(address, cashier, 'suppliers', options())).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('products.view') });
  });

  it("says plainly when a list or an entry isn't there", async () => {
    expect(await listCatalog(address, admin, 'tables' as never, options())).toMatchObject({ ok: false, reason: 'not-found', message: 'There\'s no list called "tables".' });
    expect(await loadCatalogEntryForm(address, admin, 'brands', randomUUID(), options())).toMatchObject({
      ok: false,
      reason: 'not-found',
      message: "That brand isn't there any more.",
    });
  });
});
