import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

describeWithDatabase('promo and wholesale prices at the till, in the real app', () => {
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
    // The user's example: shelf ₱100, promo ₱90; and ₱85 each from 3 pieces.
    await db.product.create({
      data: { id: randomUUID(), code: 'FAN-16', name: 'Stand fan', retailPrice: '100.00', promoPrice: '90.00', wholesalePrice: '85.00', wholesaleQuantity: 3 },
    });
    await db.product.create({ data: { id: randomUUID(), code: 'SVC-ASM', name: 'Assembly service', retailPrice: '50.00', tracksStock: false } });

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
    await window.getByRole('button', { name: /^Sell/ }).click();
    const start = window.getByRole('region', { name: 'Start your shift' });
    await start.getByLabel('Cash in the drawer').fill('1000');
    await start.getByLabel('Cash in the drawer').press('Enter');
    await window.getByText('Scan a product to start a sale.').waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await db?.$disconnect();
    await database?.drop();
  });

  const codeBox = () => window.getByLabel('Scan or type a code');
  const total = () => window.getByLabel('Total', { exact: true }).textContent();
  /** The Price cell of the first line: the price, and what kind it is when it isn't the shelf price. */
  const firstPrice = () => window.getByRole('table', { name: 'This sale' }).locator('tbody tr').first().locator('td').nth(1).textContent();
  async function scan(typed: string) {
    await codeBox().fill(typed);
    await codeBox().press('Enter');
  }

  it('charges the promo price, and says so under the price', async () => {
    await scan('FAN-16');
    await window.getByRole('table', { name: 'This sale' }).waitFor();
    expect(await firstPrice()).toBe('₱90.00Promo price');
    expect(await total()).toBe('₱90.00');
  });

  it('switches to the wholesale price once the line reaches its pieces, and back below them', async () => {
    await window.getByRole('button', { name: 'One more Stand fan' }).click();
    await expect.poll(total).toBe('₱180.00');
    await window.getByRole('button', { name: 'One more Stand fan' }).click();
    await expect.poll(total).toBe('₱255.00');
    expect(await firstPrice()).toBe('₱85.00Wholesale price');
    await window.getByRole('button', { name: 'One fewer Stand fan' }).click();
    await expect.poll(firstPrice).toBe('₱90.00Promo price');
    await window.getByRole('button', { name: 'One more Stand fan' }).click();
    await expect.poll(total).toBe('₱255.00');
  });

  it('gives a senior the better of the wholesale price and 20% off the shelf price, not both', async () => {
    await window.getByRole('button', { name: 'Senior/PWD discount' }).click();
    const form = window.getByRole('dialog', { name: 'Senior/PWD discount' });
    await form.getByLabel('ID number').fill('OSCA-12345');
    await form.getByLabel('Name on the ID').fill('Lola Cruz');
    await form.getByRole('button', { name: 'Give 20% off' }).click();
    await form.waitFor({ state: 'detached' });
    // 3 × ₱100 less 20% is ₱240, which beats 3 × ₱85 = ₱255: the shelf price, discounted.
    await expect.poll(total).toBe('₱240.00');
    expect(await firstPrice()).toBe('₱100.00');
  });

  it('records the sale with the price each line was charged at, and takes no service out of stock', async () => {
    await window.getByRole('button', { name: 'Change discount' }).click();
    const form = window.getByRole('dialog', { name: /discount/i });
    await form.getByRole('button', { name: 'Take it off' }).click();
    await form.waitFor({ state: 'detached' });
    await expect.poll(total).toBe('₱255.00');
    await scan('SVC-ASM');
    await expect.poll(total).toBe('₱305.00');

    await window.getByRole('button', { name: 'Pay', exact: true }).click();
    const pay = window.getByRole('dialog', { name: 'Pay' });
    await pay.getByLabel('Cash given').fill('305');
    await pay.getByLabel('Cash given').press('Enter');
    const receipt = window.getByRole('article', { name: 'Receipt' });
    await receipt.waitFor();
    expect(await receipt.getByText('@ ₱85.00 · Wholesale price').isVisible()).toBe(true);

    const items = await db.receiptItem.findMany({ orderBy: { lineNumber: 'asc' } });
    expect(items.map((item) => [item.productCode, item.quantity, item.priceBasis, item.unitPrice.toFixed(2)])).toEqual([
      ['FAN-16', 3, 'Wholesale', '85.00'],
      ['SVC-ASM', 1, 'Retail', '50.00'],
    ]);
    const service = await db.product.findUniqueOrThrow({ where: { code: 'SVC-ASM' } });
    expect(await db.inventoryLog.count({ where: { productId: service.id } })).toBe(0);
  });
});
