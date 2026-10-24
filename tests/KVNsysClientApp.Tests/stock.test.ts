import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaProductCatalog, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';

describeWithDatabase('stock from the real app: deliveries, counts and history', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  /** A role made by hand, as a shop makes one: a new install has only the Administrator. */
  async function addRole(code: string, rights: string[]): Promise<void> {
    const role = await db.role.create({ data: { id: randomUUID(), code, name: code, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
  }

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
    await addRole('RECEIVER', ['stock.view', 'stock.receive']);
    await addRole('LOOKER', ['stock.view']);
    await addRole('CASHIER', ['products.view']);
    await addUser('receiver', 'RECEIVER');
    await addUser('looker', 'LOOKER');
    await addUser('cashier', 'CASHIER');
    const catalog = new PrismaProductCatalog(db);
    const nobody = { userId: null, machineId: null, locationId: null };
    await catalog.create({ code: 'PRD-0042', barcode: null, name: 'Sack of rice 25kg', retailPrice: 145050, status: 'Active', description: null }, nobody);
    await catalog.create({ code: 'PRD-0007', barcode: '4800249211116', name: 'Sardines 155g', retailPrice: 2575, status: 'Active', description: null }, nobody);

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

  async function openStock() {
    await window.getByRole('button', { name: /^Stock/ }).click();
    await table().waitFor();
  }

  async function signOut() {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  }

  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const table = () => window.getByRole('table', { name: 'Stock' });
  const rowsShown = (name = 'Stock') =>
    window
      .getByRole('table', { name })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? '')));
  const stockShown = async () => (await rowsShown()).map((row) => [row[1], row[3]]);
  const isFocused = (locator: ReturnType<Page['getByLabel']>) => locator.evaluate((element) => element === document.activeElement);

  it('lists every product with how many the shop has, never-moved ones at 0', async () => {
    await signIn('admin');
    await openStock();
    expect(await window.getByText('2 products at Head Office').isVisible()).toBe(true);
    expect(await stockShown()).toEqual([
      ['Sack of rice 25kg', '0'],
      ['Sardines 155g', '0'],
    ]);
    expect(await window.getByRole('button', { name: 'Receive stock' }).isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: 'Adjust Sardines 155g' }).isVisible()).toBe(true);
  });

  it('takes in a delivery by scanning: Enter finds the product, then Enter adds its pieces, and nothing saves until asked', async () => {
    await window.getByRole('button', { name: 'Receive stock' }).click();
    const form = panel('Receive stock');
    const code = form.getByLabel('Code or barcode');
    const pieces = form.getByLabel('Pieces', { exact: true });
    expect(await isFocused(code)).toBe(true);

    // What a scanner does: types the barcode and presses Enter.
    await code.fill('4800249211116');
    await code.press('Enter');
    await form.getByText('Sardines 155g: KVNsys has 0 here.').waitFor();
    expect(await isFocused(pieces)).toBe(true);
    await pieces.fill('24');
    await pieces.press('Enter');
    await form.getByRole('list', { name: 'This delivery' }).waitFor();
    expect(await isFocused(code)).toBe(true);

    // Typed by hand, in any capitals. Enter finds it, and with a line already in, still doesn't save.
    await code.fill('prd-0042');
    await code.press('Enter');
    await form.getByText('Sack of rice 25kg: KVNsys has 0 here.').waitFor();
    expect(await db.inventoryLog.count()).toBe(0);
    await pieces.fill('1,200');
    await form.getByRole('button', { name: 'Add to delivery' }).click();
    await form.getByText('Sack of rice 25kg', { exact: true }).waitFor();

    // The same product again, as a second carton scanned later: Enter in Pieces adds it, never saves.
    await code.fill('4800249211116');
    await code.press('Enter');
    await form.getByText('Sardines 155g: KVNsys has 0 here.').waitFor();
    await pieces.fill('6');
    await pieces.press('Enter');
    await form.getByRole('listitem').nth(2).waitFor();
    expect(await db.inventoryLog.count()).toBe(0);

    await form.getByLabel('Note (optional)').fill('DR 10234');
    await form.getByRole('button', { name: 'Save delivery' }).click();
    await window.getByText('Saved the delivery: 3 lines.').waitFor();
    expect(await form.count()).toBe(0);
    expect(await stockShown()).toEqual([
      ['Sack of rice 25kg', '1,200'],
      ['Sardines 155g', '30'],
    ]);
    const admin = await db.user.findUniqueOrThrow({ where: { username: 'admin' } });
    expect(await db.inventoryLog.findMany({ select: { quantityChange: true, note: true, createdByUser: true }, orderBy: { quantityChange: 'asc' } })).toEqual([
      { quantityChange: 6, note: 'DR 10234', createdByUser: admin.id },
      { quantityChange: 24, note: 'DR 10234', createdByUser: admin.id },
      { quantityChange: 1200, note: 'DR 10234', createdByUser: admin.id },
    ]);
  });

  it("says when a code isn't any product's, and names the line whose pieces aren't a number, keeping what was typed", async () => {
    await window.getByRole('button', { name: 'Receive stock' }).click();
    const form = panel('Receive stock');
    await form.getByLabel('Code or barcode').fill('PRD-9999');
    await form.getByLabel('Code or barcode').press('Enter');
    await form.getByText('No product has the code or barcode PRD-9999.').waitFor();

    await form.getByLabel('Code or barcode').fill('PRD-0007');
    await form.getByLabel('Pieces', { exact: true }).fill('ten');
    await form.getByRole('button', { name: 'Add to delivery' }).click();
    await form.getByRole('button', { name: 'Remove Sardines 155g' }).waitFor();
    await form.getByRole('button', { name: 'Save delivery' }).click();
    await form.getByText(`Sardines 155g: "ten" isn't a number of pieces. Type a whole number, like 24.`).waitFor();

    await form.getByRole('button', { name: 'Remove Sardines 155g' }).click();
    expect(await form.getByText('Nothing added yet.').isVisible()).toBe(true);
    expect(await form.getByRole('button', { name: 'Save delivery' }).isDisabled()).toBe(true);
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
    expect(await db.inventoryLog.count()).toBe(3);
  });

  it('puts a count right from what was counted, with the reason', async () => {
    await window.getByRole('button', { name: 'Adjust Sardines 155g' }).click();
    const form = panel('Adjust stock');
    await form.getByText('KVNsys has 30 here.', { exact: false }).waitFor();
    await form.getByLabel('Pieces counted').fill('30');
    await form.getByLabel("Why it's different").fill('2 torn, thrown away');
    await form.getByRole('button', { name: 'Save count' }).click();
    await form.getByText("KVNsys already has 30, so there's nothing to put right.").waitFor();

    await form.getByLabel('Pieces counted').fill('28');
    await form.getByRole('button', { name: 'Save count' }).click();
    await window.getByText('Sardines 155g is now 28.').waitFor();
    expect(await stockShown()).toContainEqual(['Sardines 155g', '28']);
  });

  it("shows a product's history, newest first, and goes back to the list", async () => {
    await window.getByRole('button', { name: 'History of Sardines 155g' }).click();
    await window.getByRole('table', { name: 'Movements' }).waitFor();
    expect(await window.getByText('In stock: 28').isVisible()).toBe(true);
    const lines = (await rowsShown('Movements')).map(([, what, pieces, after, who, note]) => [what, pieces, after, who, note]);
    expect(lines).toEqual([
      ['Count put right', '−2', '28', 'System Administrator', '2 torn, thrown away'],
      ['Received', '+6', '30', 'System Administrator', 'DR 10234'],
      ['Received', '+24', '24', 'System Administrator', 'DR 10234'],
    ]);
    await window.getByRole('button', { name: 'Back to stock' }).click();
    await table().waitFor();
    await signOut();
  });

  it('gives someone who may only receive goods Receive stock but no Adjust, and someone who may only look neither', async () => {
    await signIn('receiver');
    await openStock();
    expect(await window.getByRole('button', { name: 'Receive stock' }).isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: 'History of Sardines 155g' }).isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: /^Adjust / }).count()).toBe(0);
    await signOut();

    await signIn('looker');
    await openStock();
    expect(await window.getByRole('button', { name: 'Receive stock' }).count()).toBe(0);
    expect(await window.getByRole('button', { name: /^Adjust / }).count()).toBe(0);
    await signOut();
  });

  it('greys out the Stock tile for a role without the right to see stock, and says why', async () => {
    await signIn('cashier');
    expect(await window.getByRole('button', { name: /^Stock/ }).isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see stock. Ask a manager.").isVisible()).toBe(true);
    await signOut();
  });
});
