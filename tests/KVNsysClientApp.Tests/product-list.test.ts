import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createPrismaClient, PrismaCatalogBook, PrismaProductCatalog, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { headingsOf, HistoryHeadings } from './table-cells.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const LongName = 'Hanabishi stand fan 16 inch, three speeds, with timer, remote control and a carry handle';

describeWithDatabase("the Products list's pictures, categories and brands, in the real app", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;
  let otherPicture: string;

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
    server = await createServer({ logger: false, certificate: await createServerCertificate(), databaseUrl: database.url });
    await server.listen(0, '127.0.0.1');
    const address = `127.0.0.1:${(server.getHttpServer().address() as AddressInfo).port}`;
    dataDir = freshDataDir();
    app = await launchApp(dataDir);
    window = await app.firstWindow();

    // Real JPEGs, made by Electron itself, since the list shrinks each picture it shows: grey, and red for a change.
    const jpeg = async (red: number) =>
      Buffer.from(
        await app.evaluate(({ nativeImage }, red) => {
          const pixels = Buffer.alloc(300 * 200 * 4, 0x99);
          for (let i = 2; i < pixels.length; i += 4) pixels[i] = red; // BGRA: the third byte is red.
          return nativeImage.createFromBitmap(pixels, { width: 300, height: 200 }).toJPEG(85).toString('base64');
        }, red),
        'base64',
      );
    const picture = await jpeg(0x99);
    otherPicture = join(dataDir, 'red.jpg');
    writeFileSync(otherPicture, await jpeg(0xff));
    const book = new PrismaCatalogBook(db);
    const catalog = new PrismaProductCatalog(db);
    const nobody = { userId: null, machineId: null, locationId: null };
    const entry = (code: string, name: string, extra = {}) => ({ code, name, address: null, parentId: null, status: 'Active' as const, description: null, ...extra });
    const appliances = await book.create('categories', entry('CAT-APP', 'Appliances'), nobody);
    const fans = await book.create('categories', entry('CAT-FAN', 'Fans', { parentId: appliances.id }), nobody);
    const hanabishi = await book.create('brands', entry('HANABISHI', 'Hanabishi'), nobody);
    const oldBrand = await book.create('brands', entry('OLD', 'Old brand', { status: 'Inactive' }), nobody);
    const product = (code: string, name: string, extra = {}) => ({ code, barcode: null, name, retailPrice: 100000, status: 'Active' as const, description: null, ...extra });
    await catalog.create(product('HNB-SF16', LongName, { categoryId: fans.id, brandId: hanabishi.id }), nobody, picture);
    await catalog.create(product('DSK-FAN', 'Desk fan', { categoryId: fans.id, brandId: oldBrand.id }), nobody);
    await catalog.create(product('PRD-0042', 'Sack of rice 25kg'), nobody);
    // Further down the list than the window shows, each with a picture.
    for (let i = 1; i <= 30; i++) await catalog.create(product(`ZZ-${String(i).padStart(2, '0')}`, `Zz picture ${String(i).padStart(2, '0')}`), nobody, picture);

    await window.getByLabel('Server address').fill(address);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').fill('admin');
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('button', { name: /^Products/ }).click();
    await window.getByRole('table', { name: 'Products' }).waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await db?.$disconnect();
    await database?.drop();
  });

  const table = () => window.getByRole('table', { name: 'Products' });
  const searchBox = () => window.getByLabel('Search this list');
  /** The rows shown, as [name, category, brand], read by heading. */
  const rowsShown = () =>
    table()
      .locator('tbody tr')
      .evaluateAll((rows) => {
        const headings = [...rows[0]!.closest('table')!.querySelectorAll('th')].map((heading) => heading.textContent);
        const wanted = ['Name', 'Category', 'Brand'].map((heading) => headings.indexOf(heading));
        return rows.map((row) => wanted.map((index) => row.querySelectorAll('td')[index]?.textContent ?? null));
      });
  const pictures = () => table().getByRole('img', { name: /^Picture of / });

  it("shows each product's category with those above it, and its brand, even one switched off", async () => {
    const rows = await rowsShown();
    expect(rows.slice(0, 3)).toEqual([
      ['Desk fan', 'Appliances › Fans', 'Old brand'],
      [LongName, 'Appliances › Fans', 'Hanabishi'],
      ['Sack of rice 25kg', '—', '—'],
    ]);
  });

  it("shows a product's picture small, and nothing for one without", async () => {
    const fan = table().getByRole('img', { name: `Picture of ${LongName}` });
    await fan.waitFor();
    const box = (await fan.boundingBox())!;
    expect(Math.round(box.width)).toBeLessThanOrEqual(40);
    expect(await table().getByRole('img', { name: 'Picture of Desk fan' }).count()).toBe(0);
    // Shrunk on this register before the screens get it: 80 pixels at most, from a 300-pixel picture.
    expect(await fan.evaluate((image: HTMLImageElement) => Math.max(image.naturalWidth, image.naturalHeight))).toBe(80);
  });

  it('fetches pictures only as their rows come into view, not the whole list at once', async () => {
    // The 30 further down have pictures; only those near the window's bottom are asked for yet.
    const before = await pictures().count();
    expect(before).toBeGreaterThan(1);
    expect(before).toBeLessThan(31);
    await table().evaluate((element) => {
      const box = element.parentElement!;
      box.scrollTop = box.scrollHeight;
    });
    await table().getByRole('img', { name: 'Picture of Zz picture 30' }).waitFor();
    expect(await pictures().count()).toBeGreaterThan(before);
    await table().evaluate((element) => {
      element.parentElement!.scrollTop = 0;
    });
  });

  it('shows every column like a Beta grid: each keeps its width, a long name is cut short and shown whole when pointed at, and only the table scrolls sideways', async () => {
    // Every column of the products table, then its history; this administrator may change products, so Cost and Edit too.
    expect(await headingsOf(table())).toEqual([
      'Picture',
      'Code',
      'Barcode',
      'Name',
      'Category',
      'Brand',
      'Supplier',
      'Manufacturer',
      'Unit',
      'Price',
      'Promo price',
      'Wholesale price',
      'Wholesale from',
      'Cost',
      'Tracks stock',
      'Warranty',
      'Status',
      'Description',
      ...HistoryHeadings,
      'Change',
    ]);
    const name = table().getByRole('cell', { name: LongName, exact: true });
    expect(await name.evaluate((cell) => cell.scrollWidth > cell.clientWidth)).toBe(true);
    await name.hover();
    expect(await name.getAttribute('title')).toBe(LongName);
    const sideways = await table().evaluate((element) => element.parentElement!.scrollWidth - element.parentElement!.clientWidth);
    expect(sideways).toBeGreaterThan(0);
    const page = await window.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(page).toBe(0);
    // The Edit buttons stay at the box's right-hand edge however far it's scrolled.
    const box = (await table().locator('xpath=..').boundingBox())!;
    const edit = (await table().getByRole('button', { name: `Edit ${LongName}` }).boundingBox())!;
    expect(edit.x + edit.width).toBeLessThanOrEqual(box.x + box.width);
  });

  it('finds products by their category, those above it included, and by their brand', async () => {
    // Words found only in the category path, or only in the brand, so the name and code can't stand in for them.
    await searchBox().fill('appliances');
    expect((await rowsShown()).map(([name]) => name)).toEqual(['Desk fan', LongName]);
    await searchBox().fill('old brand');
    expect((await rowsShown()).map(([name]) => name)).toEqual(['Desk fan']);
    await searchBox().fill('fans desk');
    expect((await rowsShown()).map(([name]) => name)).toEqual(['Desk fan']);
    await searchBox().fill('');
  });

  /** Opens the fan to edit, does something to its picture, and saves. */
  async function editFanPicture(change: (form: ReturnType<Page['getByRole']>) => Promise<void>) {
    await window.getByRole('button', { name: `Edit ${LongName}` }).click();
    const form = window.getByRole('dialog', { name: 'Edit product' });
    await form.getByRole('img', { name: "The product's picture" }).waitFor();
    await change(form);
    await form.getByRole('button', { name: 'Save' }).click();
    await form.waitFor({ state: 'detached' });
  }
  const fanThumbnail = () => table().getByRole('img', { name: `Picture of ${LongName}` });

  it('shows a changed picture once the product is saved, not the one it had', async () => {
    const before = await fanThumbnail().getAttribute('src');
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [path] })) as never;
    }, otherPicture);
    await editFanPicture((form) => form.getByRole('button', { name: 'Change picture…' }).click());
    await expect.poll(() => fanThumbnail().getAttribute('src')).not.toBe(before);
  });

  it('shows none once the picture is taken away', async () => {
    await editFanPicture((form) => form.getByRole('button', { name: 'Remove picture' }).click());
    await expect.poll(() => fanThumbnail().count()).toBe(0);
  });
});
