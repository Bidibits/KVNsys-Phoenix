import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

describeWithDatabase('getting around the real app: Back and Forward, the search box, notices and dialogs', () => {
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
    for (const [code, barcode, name, price] of [
      ['PRD-0007', '4800249211116', 'Sardines 155g', '25.75'],
      ['PRD-0042', null, 'Sack of rice 25kg', '1450.50'],
      ['PRD-0100', null, 'Bath soap', '35.00'],
    ] as const) {
      await db.product.create({ data: { id: randomUUID(), code, barcode, name, retailPrice: price } });
    }

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

  const title = () => window.locator('header h1').textContent();
  const back = () => window.getByRole('button', { name: 'Back', exact: true });
  const forward = () => window.getByRole('button', { name: 'Forward', exact: true });
  const tile = (name: string) => window.getByRole('button', { name: new RegExp(`^${name}`) });
  const searchBox = () => window.getByLabel('Search this list');
  const productNames = () =>
    window
      .getByRole('table', { name: 'Products' })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.querySelectorAll('td')[2]?.textContent ?? row.textContent));
  async function arrive(name: string) {
    await window.waitForFunction((expected) => document.querySelector('header h1')?.textContent === expected, name);
  }

  it('goes Back and Forward through the screens opened, and nowhere before the first', async () => {
    expect(await back().isDisabled()).toBe(true);
    expect(await forward().isDisabled()).toBe(true);
    await tile('Products').click();
    await arrive('Products');
    await window.getByRole('button', { name: 'Home' }).click();
    await tile('Stock').click();
    await arrive('Stock');
    await back().click();
    await arrive('Home');
    await back().click();
    await arrive('Products');
    expect(await back().isDisabled()).toBe(false);
    await forward().click();
    await arrive('Home');
    await forward().click();
    await arrive('Stock');
    expect(await forward().isDisabled()).toBe(true);
  });

  it('answers Alt+Left and Alt+Right, and the mouse’s own back and forward buttons', async () => {
    await window.keyboard.press('Alt+ArrowLeft');
    await arrive('Home');
    await window.keyboard.press('Alt+ArrowRight');
    await arrive('Stock');
    await window.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 3 })));
    await arrive('Home');
    await window.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 4 })));
    await arrive('Stock');
  });

  it("doesn't pile up copies of a screen opened again", async () => {
    await window.getByRole('button', { name: 'Home' }).click();
    await arrive('Home');
    await window.getByRole('button', { name: 'Home' }).click();
    await back().click();
    await arrive('Stock');
  });

  it('filters the list on screen by every word typed, says when nothing matches, and starts empty on the next screen', async () => {
    await window.getByRole('button', { name: 'Home' }).click();
    await tile('Products').click();
    await window.getByRole('table', { name: 'Products' }).waitFor();
    expect(await productNames()).toEqual(['Bath soap', 'Sack of rice 25kg', 'Sardines 155g']);
    await searchBox().fill('RICE');
    expect(await productNames()).toEqual(['Sack of rice 25kg']);
    await searchBox().fill('4800249211116');
    expect(await productNames()).toEqual(['Sardines 155g']);
    await searchBox().fill('sack 25kg');
    expect(await productNames()).toEqual(['Sack of rice 25kg']);
    await searchBox().fill('rice sardines');
    await window.getByText('Nothing here matches “rice sardines”.').waitFor();
    await searchBox().fill('lamp');
    await window.getByText('Nothing here matches “lamp”.').waitFor();
    await window.getByRole('button', { name: 'Home' }).click();
    expect(await searchBox().count()).toBe(0);
    await tile('Stock').click();
    expect(await searchBox().inputValue()).toBe('');
  });

  it('pops up "Saved" in a corner, and it goes on its own', async () => {
    await window.getByRole('button', { name: 'Home' }).click();
    await tile('Products').click();
    await window.getByRole('table', { name: 'Products' }).waitFor();
    await window.getByRole('button', { name: 'Edit Bath soap' }).click();
    const form = window.getByRole('dialog', { name: 'Edit product' });
    await form.getByLabel('Name', { exact: true }).fill('Bath soap 90g');
    await form.getByRole('button', { name: 'Save' }).click();
    const notice = window.getByRole('status').filter({ hasText: 'Saved Bath soap 90g.' });
    await notice.waitFor();
    await notice.waitFor({ state: 'detached', timeout: 10_000 });
  });

  it("asks before throwing away a delivery that hasn't been saved, whether by Esc or Cancel", async () => {
    await window.getByRole('button', { name: 'Home' }).click();
    await tile('Stock').click();
    await window.getByRole('button', { name: 'Receive stock' }).click();
    const form = window.getByRole('dialog', { name: 'Receive stock' });
    await form.getByLabel('Code or barcode').fill('PRD-0007');
    await form.getByLabel('Pieces', { exact: true }).fill('12');
    await form.getByRole('button', { name: 'Add to delivery' }).click();
    await form.getByRole('button', { name: 'Remove Sardines 155g' }).waitFor();

    await window.keyboard.press('Escape');
    const ask = window.getByRole('alertdialog', { name: 'Throw this delivery away?' });
    await ask.getByText("Its line hasn't been saved, and nothing will be.").waitFor();
    await ask.getByRole('button', { name: 'Keep it' }).click();
    await ask.waitFor({ state: 'detached' });
    expect(await form.getByRole('button', { name: 'Remove Sardines 155g' }).isVisible()).toBe(true);

    await form.getByRole('button', { name: 'Cancel' }).click();
    await window.getByRole('alertdialog').getByRole('button', { name: 'Throw it away' }).click();
    await form.waitFor({ state: 'detached' });
    expect(await db.inventoryLog.count()).toBe(0);
  });
});
