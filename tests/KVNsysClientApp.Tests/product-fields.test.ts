import { writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { createPrismaClient, PrismaCatalogBook, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

/** A PNG file of the given size: see-through all over, with an opaque red block in the middle. */
function seeThroughPng(width: number, height: number): Buffer {
  const row = width * 4 + 1;
  const raw = Buffer.alloc(row * height);
  for (let y = height / 4; y < (height * 3) / 4; y++) {
    for (let x = width / 4; x < (width * 3) / 4; x++) raw.set([220, 30, 30, 255], y * row + 1 + x * 4);
  }
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, check]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits, red-green-blue-alpha, no interlacing.
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

describeWithDatabase("a product's every field, and its picture, from the real app", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;
  let pictureFile: string;
  let notAPicture: string;
  const ids: Record<string, string> = {};

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
    const book = new PrismaCatalogBook(db);
    const nobody = { userId: null, machineId: null, locationId: null };
    const entry = (code: string, name: string, extra = {}) => ({ code, name, address: null, parentId: null, status: 'Active' as const, description: null, ...extra });
    ids.appliances = (await book.create('categories', entry('CAT-APP', 'Appliances'), nobody)).id;
    ids.fans = (await book.create('categories', entry('CAT-FAN', 'Fans', { parentId: ids.appliances }), nobody)).id;
    ids.hanabishi = (await book.create('brands', entry('HANABISHI', 'Hanabishi'), nobody)).id;
    await book.create('brands', entry('OLD', 'Old brand', { status: 'Inactive' }), nobody);
    ids.maker = (await book.create('manufacturers', entry('MF-001', 'Hanabishi Corp.'), nobody)).id;
    ids.supplier = (await book.create('suppliers', entry('SUP-001', 'Asia Appliances'), nobody)).id;

    server = await createServer({ logger: false, certificate: await createServerCertificate(), databaseUrl: database.url });
    await server.listen(0, '127.0.0.1');
    const address = `127.0.0.1:${(server.getHttpServer().address() as AddressInfo).port}`;

    dataDir = freshDataDir();
    pictureFile = join(dataDir, 'fan.png');
    writeFileSync(pictureFile, seeThroughPng(2400, 1600));
    notAPicture = join(dataDir, 'notes.png');
    writeFileSync(notAPicture, 'Not a picture at all.');
    app = await launchApp(dataDir);
    window = await app.firstWindow();
    await window.getByLabel('Server address').fill(address);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').fill('admin');
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('button', { name: /^Products/ }).click();
    await window.getByText('No products yet.').waitFor();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await db?.$disconnect();
    await database?.drop();
  });

  /** The file dialog is Windows' own, which a test can't click: it answers with this file instead. */
  const choosing = (file: string | null) =>
    app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = (async () => ({ canceled: path === null, filePaths: path === null ? [] : [path] })) as never;
    }, file);
  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const field = (form: ReturnType<typeof panel>, label: string) => form.getByLabel(label, { exact: true });
  const optionsOf = (form: ReturnType<typeof panel>, label: string) =>
    field(form, label).locator('option').evaluateAll((options) => options.map((option) => option.textContent));
  /** What a saved picture is, as Electron reads it back: its size and its top-left pixel. */
  const pictureOf = async (code: string) => {
    const { image } = await db.product.findFirstOrThrow({ where: { code }, select: { image: true } });
    if (!image) return null;
    const base64 = Buffer.from(image).toString('base64');
    return app.evaluate(({ nativeImage }, text) => {
      const read = nativeImage.createFromBuffer(Buffer.from(text, 'base64'));
      return { size: read.getSize(), corner: [...read.toBitmap().subarray(0, 3)], jpeg: text.startsWith('/9j/') };
    }, base64);
  };

  it("offers each list's switched-on entries in its picker, a category with those above it", async () => {
    await window.getByRole('button', { name: 'Add product' }).click();
    const form = panel('New product');
    await field(form, 'Category').waitFor();
    expect(await optionsOf(form, 'Category')).toEqual(['(none)', 'Appliances', 'Appliances › Fans']);
    expect(await optionsOf(form, 'Brand')).toEqual(['(none)', 'Hanabishi']);
    expect(await optionsOf(form, 'Manufacturer')).toEqual(['(none)', 'Hanabishi Corp.']);
    expect(await optionsOf(form, 'Supplier')).toEqual(['(none)', 'Asia Appliances']);
    expect(await field(form, 'Warranty (months)').isDisabled()).toBe(true);
    expect(await form.getByRole('checkbox', { name: 'Selling it takes it out of stock' }).isChecked()).toBe(true);
  });

  it('fits the wide panel in the window, with nothing cut off sideways', async () => {
    const form = panel('New product');
    const width = await window.evaluate(() => document.documentElement.clientWidth);
    // The panel slides in from the right, so it's measured once it has stopped.
    await expect.poll(async () => (await form.boundingBox())!.x + (await form.boundingBox())!.width).toBeLessThanOrEqual(width);
    expect((await form.boundingBox())!.x).toBeGreaterThan(0);
    const sideways = await form.locator('form > div').first().evaluate((body) => body.scrollWidth - body.clientWidth);
    expect(sideways).toBe(0);
    // Boxes side by side sit level: a label that wraps onto two lines pushes its box down (a screenshot found one).
    const top = async (label: string) => (await field(form, label).boundingBox())!.y;
    expect(await top('From (pieces)')).toBe(await top('Wholesale price (if any)'));
    expect(await top('Cost (if known)')).toBe(await top('Price (pesos)'));
  });

  it('says why a file is no picture, and changes nothing when the person chooses none', async () => {
    const form = panel('New product');
    await choosing(notAPicture);
    await form.getByRole('button', { name: 'Choose picture…' }).click();
    await form.getByText("That file isn't a picture KVNsys can read. Choose a JPEG or PNG picture.").waitFor();
    await choosing(null);
    await form.getByRole('button', { name: 'Choose picture…' }).click();
    await expect.poll(() => form.getByRole('button', { name: 'Choose picture…' }).isEnabled()).toBe(true);
    expect(await form.getByText('No picture').isVisible()).toBe(true);
  });

  it('refuses a promo price that is not below the shelf price, in plain words, keeping what was typed', async () => {
    const form = panel('New product');
    await field(form, 'Code').fill('HNB-SF16');
    await field(form, 'Name').fill('Hanabishi stand fan 16"');
    await field(form, 'Price (pesos)').fill('1899');
    await field(form, 'Promo price (if any)').fill('1999');
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText('A promo price has to be below the shelf price (₱1,899.00).').waitFor();
    expect(await field(form, 'Promo price (if any)').inputValue()).toBe('1999');
  });

  it('saves every field and the picture, shrunk to 600 pixels across on white, and shows them all again to edit', async () => {
    const form = panel('New product');
    await field(form, 'Category').selectOption({ label: 'Appliances › Fans' });
    await field(form, 'Brand').selectOption({ label: 'Hanabishi' });
    await field(form, 'Manufacturer').selectOption({ label: 'Hanabishi Corp.' });
    await field(form, 'Supplier').selectOption({ label: 'Asia Appliances' });
    await field(form, 'Unit (like pc, box, pack)').fill('pc');
    await field(form, 'Description (if any)').fill('Three speeds, timer');
    await field(form, 'Cost (if known)').fill('1,450');
    await field(form, 'Promo price (if any)').fill('1699');
    await field(form, 'Wholesale price (if any)').fill('1599');
    await field(form, 'From (pieces)').fill('10');
    await form.getByRole('checkbox', { name: 'It has a warranty' }).click();
    await field(form, 'Warranty (months)').fill('12');
    await choosing(pictureFile);
    await form.getByRole('button', { name: 'Choose picture…' }).click();
    await form.getByRole('img', { name: "The product's picture" }).waitFor();
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Hanabishi stand fan 16".').waitFor();

    expect(await db.product.findFirstOrThrow({ where: { code: 'HNB-SF16' }, omit: { image: true } })).toMatchObject({
      categoryId: ids.fans,
      brandId: ids.hanabishi,
      manufacturerId: ids.maker,
      supplierId: ids.supplier,
      unitOfMeasure: 'pc',
      description: 'Three speeds, timer',
      tracksStock: true,
      wholesaleQuantity: 10,
      hasWarranty: true,
      warrantyMonths: 12,
    });
    const prices = await db.$queryRaw<{ prices: string }[]>`
      SELECT concat_ws(' ', retail_price, cost_price, promo_price, wholesale_price) AS prices FROM products WHERE code = 'HNB-SF16'`;
    expect(prices).toEqual([{ prices: '1899.00 1450.00 1699.00 1599.00' }]);
    const picture = await pictureOf('HNB-SF16');
    expect(picture).toMatchObject({ size: { width: 600, height: 400 }, jpeg: true });
    for (const channel of picture!.corner) expect(channel).toBeGreaterThanOrEqual(245);

    await window.getByRole('button', { name: 'Edit Hanabishi stand fan 16"' }).click();
    const editing = panel('Edit product');
    await editing.getByRole('img', { name: "The product's picture" }).waitFor();
    expect(await field(editing, 'Category').evaluate((select: HTMLSelectElement) => select.selectedOptions[0]?.textContent)).toBe('Appliances › Fans');
    expect(await field(editing, 'Cost (if known)').inputValue()).toBe('1450.00');
    expect(await field(editing, 'From (pieces)').inputValue()).toBe('10');
    expect(await field(editing, 'Warranty (months)').inputValue()).toBe('12');
    expect(await editing.getByRole('checkbox', { name: 'It has a warranty' }).isChecked()).toBe(true);
  });

  it('takes the picture away, and the product goes on without one', async () => {
    const editing = panel('Edit product');
    await editing.getByRole('button', { name: 'Remove picture' }).click();
    await editing.getByText('No picture').waitFor();
    await editing.getByRole('button', { name: 'Save' }).click();
    // The first save's "Saved" notice may still be up, so wait for the panel to close instead.
    await editing.waitFor({ state: 'detached' });
    expect(await pictureOf('HNB-SF16')).toBeNull();
  });
});
