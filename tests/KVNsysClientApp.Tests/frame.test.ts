import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaProductCatalog, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher, Sessions } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const nobody = { userId: null, machineId: null, locationId: null };

describeWithDatabase('the window frame, Home and the products list, in the real app', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let catalog: PrismaProductCatalog;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  async function addUser(username: string, roleCode: string): Promise<void> {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName: username, lastName: 'Tester', passwordHash, roleId: role.id } });
  }

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: Password,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    await addUser('cashier', 'CASHIER');
    await db.role.create({ data: { id: randomUUID(), code: 'GUEST', name: 'Guest', level: 0 } });
    await addUser('guest', 'GUEST');
    catalog = new PrismaProductCatalog(db);
    const product = { barcode: null, status: 'Active' as const, description: null };
    await catalog.create({ ...product, code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: 145050 }, nobody);
    await catalog.create({ ...product, code: 'PRD-0007', name: 'Sardines 155g', retailPrice: 2575, status: 'Inactive' }, nobody);
    await catalog.create({ ...product, code: 'PRD-0100', name: 'Cooking oil 1L', retailPrice: 9800 }, nobody);

    server = await createServer({ logger: false, certificate: await createServerCertificate(), databaseUrl: database.url });
    await server.listen(0, '127.0.0.1');
    const address = `127.0.0.1:${(server.getHttpServer().address() as AddressInfo).port}`;

    dataDir = freshDataDir();
    app = await launchApp(dataDir);
    window = await app.firstWindow();
    await window.getByLabel('Server address').fill(address);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await db?.$disconnect();
    await database?.drop();
  });

  async function signIn(username: string) {
    await window.getByLabel('Username').fill(username);
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
  }

  async function signOut() {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  }

  const productsTile = () => window.getByRole('button', { name: /^Products/ });
  const table = () => window.getByRole('table', { name: 'Products' });
  const rowsShown = () =>
    table()
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent)));

  it('opens Home in the frame after sign-in, with Products open to an administrator', async () => {
    await signIn('admin');
    expect(await window.getByRole('heading', { name: 'Home' }).isVisible()).toBe(true);
    expect(await productsTile().isEnabled()).toBe(true);
  });

  it('lists every product by name, prices in pesos to the centavo, statuses as labels', async () => {
    await productsTile().click();
    await table().waitFor();
    expect(await window.getByRole('heading', { name: 'Products' }).isVisible()).toBe(true);
    expect(await window.getByText('3 products').isVisible()).toBe(true);
    expect(await rowsShown()).toEqual([
      ['PRD-0100', '', 'Cooking oil 1L', '₱98.00', 'Active'],
      ['PRD-0042', '4800016641503', 'Sack of rice 25kg', '₱1,450.50', 'Active'],
      ['PRD-0007', '', 'Sardines 155g', '₱25.75', 'Inactive'],
    ]);
  });

  it('goes back Home from the title bar', async () => {
    await window.getByRole('button', { name: 'Home' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
    expect(await table().count()).toBe(0);
  });

  it('keeps a long list inside the window: the header stays put while the rows scroll', async () => {
    for (let i = 1; i <= 40; i++) {
      const code = `BULK-${String(i).padStart(3, '0')}`;
      await catalog.create({ code, barcode: null, name: `Bulk item ${code}`, retailPrice: 100 * i, status: 'Active', description: null }, nobody);
    }
    await productsTile().click();
    await table().waitFor();
    const header = table().locator('thead');
    const before = await header.boundingBox();
    await table().evaluate((element) => {
      const box = element.parentElement!;
      box.scrollTop = box.scrollHeight;
    });
    const after = await header.boundingBox();
    expect(after?.y).toBe(before?.y);
    expect(await table().locator('tbody tr').last().isVisible()).toBe(true);
    // The window itself never scrolls, either way: only the table's own box does.
    const page = await window.evaluate(() => ({
      tall: document.documentElement.scrollHeight - innerHeight,
      wide: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(page).toEqual({ tall: 0, wide: 0 });
    await window.getByRole('button', { name: 'Home' }).click();
  });

  it("greys out Products for a role without the right, and says why", async () => {
    await signOut();
    await signIn('guest');
    expect(await productsTile().isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see products. Ask a manager.").isVisible()).toBe(true);
  });

  it('lets a cashier see the list', async () => {
    await signOut();
    await signIn('cashier');
    await productsTile().click();
    await table().waitFor();
    expect((await rowsShown()).length).toBe(43);
    await window.getByRole('button', { name: 'Home' }).click();
  });

  it('sends someone switched off back to sign in, saying why', async () => {
    const before = server.get(Sessions).activeCount();
    await db.user.update({ where: { username: 'cashier' }, data: { status: 'Inactive' } });
    try {
      await productsTile().click();
      await window.getByText('This account is switched off. Ask a manager.').waitFor();
      expect(server.get(Sessions).activeCount()).toBe(before - 1);
      await window.getByRole('button', { name: 'Sign in again' }).click();
      await window.getByLabel('Username').waitFor();
    } finally {
      await db.user.update({ where: { username: 'cashier' }, data: { status: 'Active' } });
    }
  });

  it('signs out from the title bar, and the server cancels the pass', async () => {
    await signIn('admin');
    const before = server.get(Sessions).activeCount();
    await signOut();
    expect(server.get(Sessions).activeCount()).toBe(before - 1);
  });
});
