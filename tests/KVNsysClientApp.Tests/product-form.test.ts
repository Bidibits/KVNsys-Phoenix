import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaProductCatalog, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

describeWithDatabase('adding and changing products from the real app', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
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
    await addUser('manager', 'MANAGER');
    await new PrismaProductCatalog(db).create(
      { code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: 145050, status: 'Active', description: null },
      { userId: null, machineId: null, locationId: null },
    );

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

  async function signInAndOpenProducts(username: string) {
    await window.getByLabel('Username').fill(username);
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('button', { name: /^Products/ }).click();
    await window.getByText(/products?$|No products yet/).first().waitFor();
  }

  async function signOut() {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  }

  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const table = () => window.getByRole('table', { name: 'Products' });
  const rowsShown = () =>
    table()
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].slice(0, 5).map((cell) => cell.textContent)));
  const isFocused = (locator: ReturnType<Page['getByLabel']>) => locator.evaluate((element) => element === document.activeElement);

  it('gives someone who may manage products Add, and Edit on every row', async () => {
    await signInAndOpenProducts('admin');
    await table().waitFor();
    expect(await window.getByRole('button', { name: 'Add product' }).isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: 'Edit Sack of rice 25kg' }).isVisible()).toBe(true);
  });

  it('adds a product from the panel, and the list shows it', async () => {
    await window.getByRole('button', { name: 'Add product' }).click();
    const form = panel('New product');
    await form.waitFor();
    expect(await isFocused(form.getByLabel('Code', { exact: true }))).toBe(true);
    await form.getByLabel('Code', { exact: true }).fill('PRD-0007');
    await form.getByLabel('Name', { exact: true }).fill('Sardines 155g');
    await form.getByLabel('Price (pesos)').fill('25.75');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Sardines 155g.').waitFor();
    expect(await form.count()).toBe(0);
    expect(await rowsShown()).toContainEqual(['PRD-0007', '', 'Sardines 155g', '₱25.75', 'Active']);
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(await db.product.findUniqueOrThrow({ where: { code: 'PRD-0007' } })).toMatchObject({ createdByUser: admin.id });
  });

  it("moves from the barcode to the name when a scanner presses Enter, instead of saving", async () => {
    await window.getByRole('button', { name: 'Add product' }).click();
    const form = panel('New product');
    await form.getByLabel('Code', { exact: true }).fill('PRD-0300');
    await form.getByLabel('Barcode (if it has one)').fill('4800249211116');
    await form.getByLabel('Barcode (if it has one)').press('Enter');
    expect(await form.isVisible()).toBe(true);
    expect(await isFocused(form.getByLabel('Name', { exact: true }))).toBe(true);
    // Cancel closes it, and nothing was saved.
    await form.getByRole('button', { name: 'Cancel' }).click();
    await form.waitFor({ state: 'detached' });
    expect(await db.product.count({ where: { code: 'PRD-0300' } })).toBe(0);
  });

  it("starts an edit from the server's copy of the product, not the list's", async () => {
    // Someone else changed the price after this list was shown.
    await db.product.update({ where: { code: 'PRD-0042' }, data: { retailPrice: '1499.00' } });
    await window.getByRole('button', { name: 'Edit Sack of rice 25kg' }).click();
    const form = panel('Edit product');
    await form.getByLabel('Price (pesos)').waitFor();
    expect(await form.getByLabel('Price (pesos)').inputValue()).toBe('1499.00');
    expect(await form.getByLabel('Barcode (if it has one)').inputValue()).toBe('4800016641503');
    await form.getByLabel('Price (pesos)').fill('1,520');
    await form.getByLabel('Status').selectOption('Inactive');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Sack of rice 25kg.').waitFor();
    expect(await rowsShown()).toContainEqual(['PRD-0042', '4800016641503', 'Sack of rice 25kg', '₱1,520.00', 'Inactive']);
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(await db.product.findUniqueOrThrow({ where: { code: 'PRD-0042' } })).toMatchObject({ updatedByUser: admin.id });
  });

  it('refuses what breaks a rule, in plain words, and keeps what was typed', async () => {
    const before = await db.product.count();
    await window.getByRole('button', { name: 'Add product' }).click();
    const form = panel('New product');
    await form.getByLabel('Code', { exact: true }).fill('prd-0042');
    await form.getByLabel('Name', { exact: true }).fill('Rice again');
    await form.getByLabel('Price (pesos)').fill('10');
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText('prd-0042 is already the code of Sack of rice 25kg.').waitFor();
    expect(await form.getByLabel('Code', { exact: true }).inputValue()).toBe('prd-0042');

    await form.getByLabel('Code', { exact: true }).fill('PRD-0400');
    await form.getByLabel('Price (pesos)').fill('12.555');
    await form.getByLabel('Price (pesos)').press('Enter');
    await form.getByText('"12.555" isn\'t a price. Type it in pesos, like 1450.50, with at most two decimals.').waitFor();
    expect(await db.product.count()).toBe(before);

    // Esc closes it without saving.
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
    expect(await db.product.count()).toBe(before);
  });

  it('shows a cashier the list, with no Add and no Edit', async () => {
    await signOut();
    await signInAndOpenProducts('cashier');
    await table().waitFor();
    expect(await window.getByRole('button', { name: 'Add product' }).count()).toBe(0);
    expect(await window.getByRole('button', { name: /^Edit / }).count()).toBe(0);
  });

  it('says why when a save is refused because the account was switched off, and offers sign-in', async () => {
    await signOut();
    await signInAndOpenProducts('manager');
    await window.getByRole('button', { name: 'Add product' }).click();
    const form = panel('New product');
    await form.getByLabel('Code', { exact: true }).fill('PRD-0500');
    await form.getByLabel('Name', { exact: true }).fill('Bottled water 1L');
    await form.getByLabel('Price (pesos)').fill('22');
    await db.user.update({ where: { username: 'manager' }, data: { status: 'Inactive' } });
    try {
      await form.getByRole('button', { name: 'Save' }).click();
      await form.getByText('This account is switched off. Ask a manager.').waitFor();
      await form.getByRole('button', { name: 'Sign in again' }).click();
      await window.getByLabel('Username').waitFor();
      expect(await db.product.count({ where: { code: 'PRD-0500' } })).toBe(0);
    } finally {
      await db.user.update({ where: { username: 'manager' }, data: { status: 'Active' } });
    }
  });
});
