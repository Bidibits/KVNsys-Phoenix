import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { priceSale, takeCash, type SaleProduct } from '@kvnsys/core';
import { createPrismaClient, PrismaSalesJournal, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

describeWithDatabase("a day's sales from the real app", () => {
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
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: Password,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    const role = await db.role.create({ data: { id: randomUUID(), code: 'CASHIER', name: 'Cashier', level: 10 } });
    await db.access.create({ data: { id: randomUUID(), roleId: role.id, access: 'sales.sell' } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username: 'ana', firstName: 'Ana', lastName: 'Cruz', passwordHash, roleId: role.id } });

    // Two sales rung up today, by the administrator.
    const product = async (code: string, name: string, retailPrice: number): Promise<SaleProduct> => {
      const id = randomUUID();
      await db.product.create({ data: { id, code, name, retailPrice: (retailPrice / 100).toFixed(2) } });
      return { id, code, name, retailPrice, status: 'Active' };
    };
    const sardines = await product('PRD-0007', 'Sardines 155g', 2575);
    const rice = await product('PRD-0042', 'Sack of rice 25kg', 145050);
    const shop = await db.location.findUniqueOrThrow({ where: { code: 'HQ' } });
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    const journal = new PrismaSalesJournal(db);
    const ring = (sale: ReturnType<typeof priceSale>, tendered: number) =>
      journal.record(sale, takeCash(sale.total, tendered), shop.id, { userId: admin.id, machineId: null, locationId: shop.id });
    await ring(priceSale([{ product: sardines, quantity: 2 }], { kind: 'senior', idNumber: 'OSCA-1', customerName: 'Lola Cruz' }), 5000);
    await ring(priceSale([{ product: rice, quantity: 1 }], null), 150000);

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

  const figure = (label: string) => window.getByLabel(label, { exact: true }).textContent();
  const rowsShown = () =>
    window
      .getByRole('table', { name: "This day's receipts" })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? '')));

  it("opens on today's sales: what they came to, and every receipt, oldest first", async () => {
    await signIn('admin');
    await window.getByRole('button', { name: /^Sales/ }).click();
    await window.getByRole('table', { name: "This day's receipts" }).waitFor();
    expect(await figure('Receipts')).toBe('2');
    expect(await figure('Sales before discounts')).toBe('₱1,502.00');
    expect(await figure('Discounts')).toBe('₱10.30');
    expect(await figure('Cash taken')).toBe('₱1,491.70');
    const rows = (await rowsShown()).map(([code, , cashier, pieces, discount, total]) => [code, cashier, pieces, discount, total]);
    expect(rows).toEqual([
      ['HQ-000001', 'System Administrator', '2', 'Senior citizen', '₱41.20'],
      ['HQ-000002', 'System Administrator', '1', '', '₱1,450.50'],
    ]);
  });

  it('shows a receipt again, as it was given, and goes back to the day', async () => {
    await window.getByRole('button', { name: 'View HQ-000001' }).click();
    const receipt = window.getByRole('article', { name: 'Receipt' });
    await receipt.waitFor();
    expect(await receipt.getByText('Receipt HQ-000001').isVisible()).toBe(true);
    expect(await receipt.getByText('Lola Cruz · ID OSCA-1').isVisible()).toBe(true);
    expect(await receipt.getByText('Cashier: System Administrator').isVisible()).toBe(true);
    await window.getByRole('button', { name: "Back to the day's sales" }).click();
    await window.getByRole('table', { name: "This day's receipts" }).waitFor();
  });

  it('shows another day when one is picked, and today again with Today', async () => {
    await window.getByLabel('Day', { exact: true }).fill('2026-01-01');
    await window.getByText('No sales on this day.').waitFor();
    expect(await figure('Cash taken')).toBe('₱0.00');
    await window.getByRole('button', { name: 'Today' }).click();
    await window.getByRole('table', { name: "This day's receipts" }).waitFor();
    expect(await figure('Receipts')).toBe('2');
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  });

  it('greys out Sales for a cashier who may only sell, and says why', async () => {
    await signIn('ana');
    expect(await window.getByRole('button', { name: /^Sales/ }).isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see sales. Ask a manager.").isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: /^Sell/ }).isDisabled()).toBe(false);
  });
});
