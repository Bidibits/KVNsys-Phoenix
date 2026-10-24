import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

describeWithDatabase('selling from the real app: scan, discount, pay, receipt', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  async function addRole(code: string, rights: string[]): Promise<void> {
    const role = await db.role.create({ data: { id: randomUUID(), code, name: code, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
  }

  async function addUser(username: string, firstName: string, roleCode: string): Promise<void> {
    const role = await db.role.findUniqueOrThrow({ where: { code: roleCode } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName, lastName: 'Cruz', passwordHash, roleId: role.id } });
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
    await addRole('CASHIER', ['sales.sell']);
    await addRole('STOCKMAN', ['stock.view']);
    await addUser('ana', 'Ana', 'CASHIER');
    await addUser('ben', 'Ben', 'STOCKMAN');
    const product = (code: string, barcode: string | null, name: string, retailPrice: string) =>
      db.product.create({ data: { id: randomUUID(), code, barcode, name, retailPrice } });
    await product('PRD-0007', '4800249211116', 'Sardines 155g', '25.75');
    await product('PRD-0042', null, 'Sack of rice 25kg', '1450.50');
    await product('PRD-0099', null, 'Unpriced lamp', '0.00');

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

  const codeBox = () => window.getByLabel('Scan or type a code');
  const total = () => window.getByLabel('Total', { exact: true }).textContent();
  const linesShown = () =>
    window
      .getByRole('table', { name: 'This sale' })
      .locator('tbody tr')
      .evaluateAll((rows) =>
        rows.map((row) => {
          const cells = [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? '');
          return [cells[0], cells[2]?.replace(/[−+]/g, ''), cells[3]];
        }),
      );
  const isFocused = (locator: ReturnType<Page['getByLabel']>) => locator.evaluate((element) => element === document.activeElement);
  async function scan(typed: string) {
    await codeBox().fill(typed);
    await codeBox().press('Enter');
  }

  it('asks for the cash in the drawer first, then opens the till with the cursor in the code box', async () => {
    await signIn('ana');
    await window.getByRole('button', { name: /^Sell/ }).click();
    const start = window.getByRole('region', { name: 'Start your shift' });
    await start.waitFor();
    expect(await isFocused(start.getByLabel('Cash in the drawer'))).toBe(true);
    await start.getByLabel('Cash in the drawer').fill('1,000');
    await start.getByLabel('Cash in the drawer').press('Enter');
    await window.getByText('Scan a product to start a sale.').waitFor();
    expect(await window.getByText(/^Shift HQ-S00001 · started/).isVisible()).toBe(true);
    expect(await isFocused(codeBox())).toBe(true);
    expect(await total()).toBe('₱0.00');
  });

  it('adds one of each scan, one more on a repeat scan, and keeps the cursor in the code box', async () => {
    await scan('4800249211116');
    await window.getByRole('table', { name: 'This sale' }).waitFor();
    await scan('4800249211116');
    await window.getByText('₱51.50').first().waitFor();
    await scan('prd-0042');
    await window.getByText('Sack of rice 25kg').waitFor();
    expect(await linesShown()).toEqual([
      ['Sardines 155gPRD-0007', '2', '₱51.50'],
      ['Sack of rice 25kgPRD-0042', '1', '₱1,450.50'],
    ]);
    expect(await total()).toBe('₱1,502.00');
    expect(await codeBox().inputValue()).toBe('');
    expect(await isFocused(codeBox())).toBe(true);
    // Every column fits, the buttons included: a screenshot once showed Remove cut off by a ₱1,450.50 line.
    const fits = await window
      .getByRole('table', { name: 'This sale' })
      .evaluate((table) => table.parentElement!.scrollWidth <= table.parentElement!.clientWidth);
    expect(fits).toBe(true);
  });

  it("says why a code can't be added, and leaves the sale as it was", async () => {
    await scan('PRD-9999');
    await window.getByText('No product has the code or barcode PRD-9999.').waitFor();
    await scan('PRD-0099');
    await window.getByText(/^Unpriced lamp has no price yet, so it can't be sold/).waitFor();
    expect(await total()).toBe('₱1,502.00');
    // What failed stays on show, but a scanner typing the next code replaces it rather than adding to it.
    expect(await codeBox().inputValue()).toBe('PRD-0099');
    await codeBox().pressSequentially('PRD-0042');
    await codeBox().press('Enter');
    await window.getByText('₱2,901.00').waitFor();
    expect(await total()).toBe('₱2,952.50');
  });

  it('changes how many with − and +, and removes a line', async () => {
    await window.getByRole('button', { name: 'One fewer Sack of rice 25kg' }).click();
    await window.getByText('₱2,901.00').waitFor({ state: 'detached' });
    expect(await window.getByRole('button', { name: 'One fewer Sack of rice 25kg' }).isDisabled()).toBe(true);
    await window.getByRole('button', { name: 'One more Sack of rice 25kg' }).click();
    await window.getByText('₱2,901.00').waitFor();
    await window.getByRole('button', { name: 'Remove Sack of rice 25kg' }).click();
    await window.getByText('Sack of rice 25kg').waitFor({ state: 'detached' });
    expect(await total()).toBe('₱51.50');
  });

  it('gives the senior discount only with the ID number and the name, and shows it on the totals', async () => {
    await window.getByRole('button', { name: 'Senior/PWD discount' }).click();
    const form = window.getByRole('dialog', { name: 'Senior/PWD discount' });
    await form.getByLabel('Name on the ID').fill('Lola Cruz');
    await form.getByRole('button', { name: 'Give 20% off' }).click();
    await form.getByText("Type the senior citizen's ID number.").waitFor();
    await form.getByLabel('ID number').fill('OSCA-12345');
    await form.getByRole('button', { name: 'Give 20% off' }).click();
    await form.waitFor({ state: 'detached' });
    await window.getByText('Lola Cruz · OSCA-12345').waitFor();
    expect(await total()).toBe('₱41.20');
  });

  it('takes cash, refusing too little, then shows the receipt and the change, with the pieces out of stock', async () => {
    await window.getByRole('button', { name: 'Pay', exact: true }).click();
    const form = window.getByRole('dialog', { name: 'Pay' });
    await form.getByLabel('Cash given').fill('40');
    await form.getByLabel('Cash given').press('Enter');
    await form.getByText("₱40.00 isn't enough: the total is ₱41.20.").waitFor();
    expect(await db.receipt.count()).toBe(0);

    await form.getByLabel('Cash given').fill('50');
    await form.getByLabel('Cash given').press('Enter');
    const receipt = window.getByRole('article', { name: 'Receipt' });
    await receipt.waitFor();
    expect(await receipt.getByText('Receipt HQ-000001').isVisible()).toBe(true);
    expect(await receipt.getByText('Cashier: Ana Cruz').isVisible()).toBe(true);
    expect(await receipt.getByText('Lola Cruz · ID OSCA-12345').isVisible()).toBe(true);
    expect(await window.getByLabel('Change to give').textContent()).toBe('₱8.80');

    const sardines = await db.product.findUniqueOrThrow({ where: { code: 'PRD-0007' } });
    expect((await db.inventory.findFirstOrThrow({ where: { productId: sardines.id } })).stock).toBe(-2);
    expect(await db.receipt.findFirstOrThrow()).toMatchObject({ code: 'HQ-000001', discountIdNumber: 'OSCA-12345' });
  });

  it('starts a new, empty sale from the receipt, with the cursor back in the code box', async () => {
    expect(await isFocused(window.getByRole('button', { name: 'New sale' }))).toBe(true);
    await window.keyboard.press('Enter');
    await window.getByText('Scan a product to start a sale.').waitFor();
    expect(await total()).toBe('₱0.00');
    expect(await isFocused(codeBox())).toBe(true);
  });

  it('ends the shift by counting the drawer, and shows how far out it is', async () => {
    await window.getByRole('button', { name: 'End shift' }).click();
    const form = window.getByRole('dialog', { name: 'End shift' });
    await form.getByText('Cash sales (1 receipt)').waitFor();
    await form.getByLabel('Cash counted in the drawer').fill('1021.20');
    await form.getByLabel('Note (optional)').fill('gave too much change once');
    await form.getByRole('button', { name: 'End shift' }).click();
    const report = window.getByRole('article', { name: 'Shift report' });
    await report.waitFor();
    expect(await report.getByLabel('Should be in the drawer').textContent()).toBe('₱1,041.20');
    expect(await report.getByLabel('Counted').textContent()).toBe('₱1,021.20');
    expect(await window.getByLabel('The drawer is', { exact: true }).textContent()).toBe('₱20.00 short');
    expect(await db.shift.findFirstOrThrow()).toMatchObject({ status: 'Closed', description: 'gave too much change once' });
    await window.getByRole('button', { name: 'Done' }).click();
    await window.getByRole('region', { name: 'Start your shift' }).waitFor();
    await signOut();
  });

  it('greys out Sell for a role without the right to sell, and says why', async () => {
    await signIn('ben');
    expect(await window.getByRole('button', { name: /^Sell/ }).isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't sell. Ask a manager.").isVisible()).toBe(true);
    await signOut();
  });
});
