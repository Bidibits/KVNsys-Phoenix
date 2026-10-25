import { randomUUID } from 'node:crypto';
import { connect, createServer as createRelay, type AddressInfo, type Server as Relay, type Socket } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
/** How long the slow network holds every piece of data, each way. */
const Lag = 100;
/** Each lookup crosses the slow network, so a few in a row take seconds, not milliseconds. */
const Settle = { timeout: 20_000 };

/**
 * A slow network between the register and the server: everything sent either way arrives Lag ms
 * late, in order. On this PC a lookup takes a few milliseconds, faster than a test can scan again,
 * so without it the scans never overlap and the bug never shows. At a branch they will.
 */
function slowNetwork(serverPort: number): Promise<Relay> {
  const relay = createRelay((register) => {
    const toServer = connect(serverPort, '127.0.0.1');
    const later = (work: () => void) => setTimeout(work, Lag);
    const pass = (from: Socket, to: Socket) => {
      from.on('data', (chunk) => later(() => to.write(chunk)));
      from.on('end', () => later(() => to.end()));
      from.on('error', () => later(() => to.destroy()));
    };
    pass(register, toServer);
    pass(toServer, register);
  });
  return new Promise((resolve) => relay.listen(0, '127.0.0.1', () => resolve(relay)));
}

describeWithDatabase('scanning fast at the till, in the real app: no scan is lost', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;
  let network: Relay;

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
    await db.product.create({ data: { id: randomUUID(), code: 'PRD-0007', barcode: '4800249211116', name: 'Sardines 155g', retailPrice: '25.75' } });
    await db.product.create({ data: { id: randomUUID(), code: 'PRD-0042', name: 'Sack of rice 25kg', retailPrice: '1450.50' } });

    server = await createServer({ logger: false, certificate: await createServerCertificate(), databaseUrl: database.url });
    await server.listen(0, '127.0.0.1');
    network = await slowNetwork((server.getHttpServer().address() as AddressInfo).port);
    const address = `127.0.0.1:${(network.address() as AddressInfo).port}`;
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
    network?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await db?.$disconnect();
    await database?.drop();
  });

  const codeBox = () => window.getByLabel('Scan or type a code');
  const total = () => window.getByLabel('Total', { exact: true }).textContent();
  /** Each line as [item, how many]. */
  const linesShown = () =>
    window
      .getByRole('table', { name: 'This sale' })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [row.querySelectorAll('td')[0]?.textContent ?? '', (row.querySelectorAll('td')[2]?.textContent ?? '').replace(/[−+]/g, '')]));
  /**
   * Scans one after another the way a scanner sends them: the code, then Enter, with no wait for
   * the one before to be found. (Waiting is what every other test does, and why none saw the bug.)
   */
  async function scanQuickly(codes: string[]) {
    for (const code of codes) {
      await codeBox().fill(code);
      await codeBox().press('Enter');
    }
  }

  it('counts every scan sent back to back, in the order they came', async () => {
    await scanQuickly(['4800249211116', '4800249211116', '4800249211116', 'PRD-0042', '4800249211116']);
    await expect.poll(total, Settle).toBe('₱1,553.50');
    expect(await linesShown()).toEqual([
      ['Sardines 155gPRD-0007', '4'],
      ['Sack of rice 25kgPRD-0042', '1'],
    ]);
    expect(await codeBox().inputValue()).toBe('');
    expect(await codeBox().evaluate((box) => box === document.activeElement)).toBe(true);
  });

  it('names a code it cannot find, last among quick scans, keeps the rest, and leaves that code selected for the next scan', async () => {
    await scanQuickly(['4800249211116', 'PRD-0042', 'NOPE-1']);
    await window.getByText('No product has the code or barcode NOPE-1.').waitFor({ timeout: 20_000 });
    await expect.poll(total, Settle).toBe('₱3,029.75');
    expect(await linesShown()).toEqual([
      ['Sardines 155gPRD-0007', '5'],
      ['Sack of rice 25kgPRD-0042', '2'],
    ]);
    await expect.poll(() => codeBox().inputValue(), Settle).toBe('NOPE-1');
    expect(await codeBox().evaluate((box: HTMLInputElement) => [box.selectionStart, box.selectionEnd])).toEqual([0, 6]);
    // The next scan replaces it, as a scanner types into whatever is in the box.
    await window.keyboard.type('4800249211116');
    await window.keyboard.press('Enter');
    await expect.poll(total, Settle).toBe('₱3,055.50');
    expect(await window.getByText('No product has the code or barcode NOPE-1.').count()).toBe(0);
  });

  it('loses no scan that comes right after one it cannot find', async () => {
    // Whether the refused code is still being looked up when the next one comes depends on timing;
    // either way the next one is counted.
    await scanQuickly(['NOPE-2', '4800249211116']);
    await expect.poll(total, Settle).toBe('₱3,081.25');
    expect(await linesShown()).toEqual([
      ['Sardines 155gPRD-0007', '7'],
      ['Sack of rice 25kgPRD-0042', '2'],
    ]);
  });

  it('records the sale with every scan in it', async () => {
    await window.getByRole('button', { name: 'Pay', exact: true }).click();
    const pay = window.getByRole('dialog', { name: 'Pay' });
    await pay.getByLabel('Cash given').fill('3100');
    await pay.getByLabel('Cash given').press('Enter');
    await window.getByRole('article', { name: 'Receipt' }).waitFor();
    const items = await db.receiptItem.findMany({ orderBy: { lineNumber: 'asc' } });
    expect(items.map((item) => [item.productCode, item.quantity])).toEqual([
      ['PRD-0007', 7],
      ['PRD-0042', 2],
    ]);
  });
});
