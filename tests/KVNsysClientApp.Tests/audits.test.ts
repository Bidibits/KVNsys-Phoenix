import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { ProductDefaults } from '@kvnsys/core';
import { createPrismaClient, PrismaCatalogBook, PrismaProductCatalog, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { headingsOf } from './table-cells.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const Described = 'Three speeds, a timer, and a remote that also turns the swing on and off';
const fan = { ...ProductDefaults, code: 'PRD-0100', barcode: null, name: 'Stand fan', retailPrice: 189900, status: 'Active' as const, description: Described };

/** Set KVNSYS_SCREENSHOTS to a folder to keep a picture of each step, for a person to look at. */
async function picture(window: Page, name: string) {
  const folder = process.env.KVNSYS_SCREENSHOTS;
  if (folder) await window.screenshot({ path: join(folder, `${name}.png`) });
}

describeWithDatabase('the audit log in the real app', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Kenlyn',
      adminUsername: 'admin',
      adminPassword: Password,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    // Two saves by the administrator, at the server PC: a product, then its price and category.
    const admin = await db.user.findFirstOrThrow({ where: { username: 'admin' } });
    const shop = await db.location.findFirstOrThrow({ where: { code: 'HQ' } });
    const serverPc = await db.machine.findFirstOrThrow({ where: { code: 'HQ-SRV' } });
    const byAdmin = { userId: admin.id, machineId: serverPc.id, locationId: shop.id };
    const appliances = await new PrismaCatalogBook(db).create('categories', { code: 'CAT-APP', name: 'Appliances', address: null, parentId: null, status: 'Active', description: null }, byAdmin);
    const catalog = new PrismaProductCatalog(db);
    const product = await catalog.create(fan, byAdmin);
    await catalog.update(product.id, { ...fan, retailPrice: 179900, categoryId: appliances.id }, byAdmin);

    server = await createServer({ logger: false, certificate: await createServerCertificate(), databaseUrl: database.url });
    await server.listen(0, '127.0.0.1');
    const address = `127.0.0.1:${(server.getHttpServer().address() as AddressInfo).port}`;

    dataDir = freshDataDir();
    app = await launchApp(dataDir);
    window = await app.firstWindow();
    await window.getByLabel('Server address').fill(address);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').fill('admin');
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await db?.$disconnect();
    await database?.drop();
  });

  const table = () => window.getByRole('table', { name: 'Audit log' });
  /** Each row as shown, but for when: By, Machine, Shop, Table, Record, Column, Change, Source, Before, After. */
  const rowsShown = () =>
    table()
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].slice(1).map((cell) => cell.textContent ?? '')));
  const RecordAt = 4;

  it('opens from Home and shows the newest change first: who, on which machine, at which shop, then what changed', async () => {
    await window.getByRole('button', { name: /^Audit log/ }).click();
    await table().waitFor();
    await picture(window, 'audit-log');
    expect(await headingsOf(table())).toEqual(['At', 'By', 'Machine', 'Shop', 'Table', 'Record', 'Column', 'Change', 'Source', 'Before', 'After']);
    const rows = await rowsShown();
    // This PC recorded itself when the administrator signed in, so that's the newest.
    expect(rows[0]!.slice(3, 5)).toEqual(['Machines', expect.stringMatching(/^New register/)]);
    // The product's last save, its columns in the form's order; setting the shop up was KVNsys's.
    expect(rows.filter((row) => row[RecordAt] === 'Stand fan (PRD-0100)').slice(0, 2)).toEqual([
      ['System Administrator (admin)', 'Server', 'Kenlyn', 'Products', 'Stand fan (PRD-0100)', 'Category', 'Updated', 'Manual', '—', 'Appliances'],
      ['System Administrator (admin)', 'Server', 'Kenlyn', 'Products', 'Stand fan (PRD-0100)', 'Price', 'Updated', 'Manual', '1899.00', '1799.00'],
    ]);
    expect(rows).toContainEqual(['KVNsys itself', 'Server', 'Kenlyn', 'Shops', 'Kenlyn', 'Name', 'Created', 'Automatic', '—', 'Kenlyn']);
  });

  it('keeps every column its width, like a Beta grid: a long value is cut short, shown whole when pointed at, and the log scrolls sideways', async () => {
    const after = table().getByRole('cell', { name: Described, exact: true });
    expect(await after.evaluate((cell) => cell.scrollWidth > cell.clientWidth)).toBe(true);
    await after.hover();
    expect(await after.getAttribute('title')).toBe(Described);
    // As wide as After was set, however long what's in it.
    expect(await after.evaluate((cell) => cell.offsetWidth / parseFloat(getComputedStyle(document.documentElement).fontSize))).toBe(16);
    expect(await table().locator('xpath=..').evaluate((box) => box.scrollWidth > box.clientWidth)).toBe(true);
    expect(await window.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });

  it('sorts by a heading when it is clicked, the other way when clicked again, and back to newest first the third time', async () => {
    const tables = async () => (await rowsShown()).map((row) => row[3]!);
    const newestFirst = await rowsShown();
    const heading = () => table().locator('th', { hasText: 'Table' });
    await heading().getByRole('button').click();
    expect(await heading().getAttribute('aria-sort')).toBe('ascending');
    const ascending = await tables();
    expect(ascending).toEqual([...ascending].sort((a, b) => a.localeCompare(b)));
    expect(new Set(ascending).size).toBeGreaterThan(2);
    await heading().getByRole('button').click();
    expect(await heading().getAttribute('aria-sort')).toBe('descending');
    expect(await tables()).toEqual([...ascending].sort((a, b) => b.localeCompare(a)));
    await picture(window, 'audit-log-sorted');
    await heading().getByRole('button').click();
    expect(await heading().getAttribute('aria-sort')).toBe('none');
    expect(await rowsShown()).toEqual(newestFirst);
  });

  /** Waits for the list asked for to arrive with every row's cell `column` (0 is At) starting with `text`. */
  const rowsBecome = (column: number, text: string) =>
    window.waitForFunction(
      ([at, start]) => {
        const rows = [...document.querySelectorAll('table[aria-label="Audit log"] tbody tr')];
        return rows.length > 0 && rows.every((row) => (row.querySelectorAll('td')[at as number]?.textContent ?? '').startsWith(start as string));
      },
      [column, text] as const,
    );

  it("follows one record's history from its name, and goes back to everything", async () => {
    await table().getByRole('button', { name: 'Stand fan (PRD-0100)' }).first().click();
    await window.getByText('Only the changes to').waitFor();
    await rowsBecome(RecordAt + 1, 'Stand fan (PRD-0100)');
    await picture(window, 'audit-log-one-record');
    const rows = await rowsShown();
    expect(rows.every((row) => row[RecordAt] === 'Stand fan (PRD-0100)')).toBe(true);
    expect(rows.filter((row) => row[6] === 'Created').map((row) => row[5])).toContain('Code');
    await window.getByRole('button', { name: 'Show every record' }).click();
    await window.getByText('Only the changes to').waitFor({ state: 'detached' });
    await table().getByRole('button', { name: 'Kenlyn' }).first().waitFor();
  });

  it('narrows the log by what and by who', async () => {
    await window.getByLabel('What').selectOption('categories');
    await rowsBecome(4, 'Categories');
    expect((await rowsShown()).every((row) => row[3] === 'Categories')).toBe(true);
    await window.getByLabel('What').selectOption('');
    await window.getByLabel('Who').selectOption({ label: 'KVNsys itself' });
    await rowsBecome(1, 'KVNsys itself');
    expect((await rowsShown()).every((row) => row[0]!.startsWith('KVNsys itself'))).toBe(true);
    await picture(window, 'audit-log-by-kvnsys');
  });
});
