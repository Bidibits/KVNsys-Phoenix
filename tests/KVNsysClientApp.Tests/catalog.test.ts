import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';
const Password = 'a-good-password';

describeWithDatabase("the catalogue's lists in the real app", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

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

  async function signIn(username: string, password: string) {
    await window.getByLabel('Username').fill(username);
    await window.getByLabel('Password').fill(password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
  }
  async function signOut() {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  }
  const tile = (title: string) => window.getByRole('button', { name: new RegExp(`^${title}`) });
  const goHome = () => window.getByRole('button', { name: 'Home', exact: true }).click();
  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const field = (form: ReturnType<typeof panel>, label: string) => form.getByLabel(label, { exact: true });
  const rowsOf = (table: string) =>
    window
      .getByRole('table', { name: table })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent)));

  it('shows the four lists on Home, and an empty one says so', async () => {
    await signIn('admin', AdminPassword);
    for (const title of ['Suppliers', 'Brands', 'Manufacturers', 'Categories']) expect(await tile(title).isEnabled()).toBe(true);
    await tile('Suppliers').click();
    await window.getByText('No suppliers yet.').waitFor();
  });

  it("adds a supplier, with its address, and the list shows it", async () => {
    await window.getByRole('button', { name: 'Add supplier' }).click();
    const form = panel('New supplier');
    await field(form, 'Code').fill('SUP-001');
    await field(form, 'Name').fill('Asia Appliances');
    await field(form, 'Address (if known)').fill('Quezon Ave., Lucena City');
    expect(await form.getByLabel('Inside', { exact: true }).count()).toBe(0);
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Asia Appliances.').waitFor();
    expect(await rowsOf('Suppliers')).toEqual([['SUP-001', 'Asia Appliances', 'Quezon Ave., Lucena City', 'Active', 'Edit']]);
  });

  it('puts a category inside another, and the list says where each sits', async () => {
    await goHome();
    await tile('Categories').click();
    await window.getByRole('button', { name: 'Add category' }).click();
    let form = panel('New category');
    await field(form, 'Code').fill('CAT-APP');
    await field(form, 'Name').fill('Appliances');
    expect(await form.getByLabel('Address (if known)', { exact: true }).count()).toBe(0);
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Appliances.').waitFor();

    await window.getByRole('button', { name: 'Add category' }).click();
    form = panel('New category');
    await field(form, 'Code').fill('CAT-FAN');
    await field(form, 'Name').fill('Fans');
    await field(form, 'Inside').selectOption({ label: 'Appliances' });
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Fans.').waitFor();
    expect(await rowsOf('Categories')).toEqual([
      ['CAT-APP', 'Appliances', '', 'Active', 'Edit'],
      ['CAT-FAN', 'Fans', 'Appliances', 'Active', 'Edit'],
    ]);
  });

  it("refuses to put a category inside one of its own, and keeps what was typed", async () => {
    await window.getByRole('button', { name: 'Edit Appliances' }).click();
    const form = panel('Edit category');
    await field(form, 'Inside').selectOption({ label: 'Fans' });
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText("A category can't sit inside one of the categories inside it.").waitFor();
    expect(await field(form, 'Name').inputValue()).toBe('Appliances');
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
  });

  it('refuses a brand code already taken, ignoring capitals, naming whose it is', async () => {
    await goHome();
    await tile('Brands').click();
    await window.getByRole('button', { name: 'Add brand' }).click();
    let form = panel('New brand');
    await field(form, 'Code').fill('BR-001');
    await field(form, 'Name').fill('Hanabishi');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Hanabishi.').waitFor();
    await window.getByRole('button', { name: 'Add brand' }).click();
    form = panel('New brand');
    await field(form, 'Code').fill('br-001');
    await field(form, 'Name').fill('Imarflex');
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText('br-001 is already the code of Hanabishi.').waitFor();
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
  });

  it('lets someone who may only see products look, without Add or Edit', async () => {
    await signOut();
    await signIn('viewer', Password);
    await tile('Brands').click();
    await window.getByRole('table', { name: 'Brands' }).waitFor();
    expect(await window.getByRole('button', { name: 'Add brand' }).count()).toBe(0);
    expect(await window.getByRole('button', { name: 'Edit Hanabishi' }).count()).toBe(0);
  });

  it("greys the four out for someone who may not see products", async () => {
    await signOut();
    await signIn('cashier', Password);
    for (const title of ['Suppliers', 'Brands', 'Manufacturers', 'Categories']) expect(await tile(title).isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see the product lists. Ask a manager.").first().isVisible()).toBe(true);
  });
});
