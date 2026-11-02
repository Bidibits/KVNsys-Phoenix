import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { AllAccesses } from '@kvnsys/core';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { cellsUnder, expectTableOrder, headingsOf, HistoryColumnsShown } from './table-cells.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';
const SeeProducts = 'See the products and their prices';
const ChangeProducts = 'Add products, and change their details and prices';

/** Set KVNSYS_SCREENSHOTS to a folder to keep a picture of each step, for a person to look at. */
async function picture(window: Page, name: string) {
  const folder = process.env.KVNSYS_SCREENSHOTS;
  if (folder) await window.screenshot({ path: join(folder, `${name}.png`), animations: 'disabled' });
}

describeWithDatabase('making roles from the real app', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    // A new install, as it is: the Administrator role and the admin account, nothing else.
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: AdminPassword,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
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

  const onHome = (title: RegExp) => window.getByRole('navigation', { name: 'Areas' }).getByRole('button', { name: title });
  /** Roles opens from inside Users. */
  async function openRoles() {
    await window.getByRole('button', { name: 'Home', exact: true }).click();
    await window.getByRole('button', { name: /^Users/ }).click();
    await window.getByRole('button', { name: 'Roles', exact: true }).click();
  }
  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const box = (form: ReturnType<typeof panel>, label: string) => form.getByRole('checkbox', { name: label, exact: true });
  const rowsShown = () => cellsUnder(window.getByRole('table', { name: 'Roles' }), ['Name', 'Rights', 'Accounts', 'Status']);

  it('opens Roles from inside Users, not from Home, and a new install has only the Administrator, with every right', async () => {
    await signIn('admin', AdminPassword);
    expect(await onHome(/^Roles/).count()).toBe(0);
    await window.getByRole('button', { name: /^Users/ }).click();
    await window.getByRole('table', { name: 'Users' }).waitFor();
    await picture(window, 'users-with-roles');
    await openRoles();
    await window.getByRole('table', { name: 'Roles' }).waitFor();
    expect(await rowsShown()).toEqual([['Administrator', 'Every right', '1', 'Active']]);
    // The table's columns in its order (its level only sorts the list), then the rights and the
    // accounts, which no column holds, then the history.
    await expectTableOrder(
      db,
      'roles',
      await headingsOf(window.getByRole('table', { name: 'Roles' })),
      { Id: 'id', Code: 'code', Name: 'name', Status: 'status', Description: 'description', ...HistoryColumnsShown },
      { notShown: ['level'], extra: ['Rights', 'Accounts'] },
    );
  });

  it("shows the Administrator's boxes all ticked and locked, so it can only be renamed", async () => {
    await window.getByRole('button', { name: 'Edit Administrator' }).click();
    const form = panel('Edit role');
    await form.getByText('The Administrator always has every right').waitFor();
    const boxes = form.getByRole('checkbox');
    // Every right there is, not today's number: each version that adds a right adds a box.
    expect(await boxes.count()).toBe(AllAccesses.length);
    for (const each of await boxes.all()) {
      expect(await each.isChecked()).toBe(true);
      expect(await each.isDisabled()).toBe(true);
    }
    expect(await form.getByLabel('Status', { exact: true }).isDisabled()).toBe(true);
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
  });

  it('makes a role by ticking boxes: changing products ticks seeing them, and unticking seeing unticks changing', async () => {
    await window.getByRole('button', { name: 'Add role' }).click();
    const form = panel('New role');
    await form.getByLabel('Name', { exact: true }).fill('Cashier');
    await box(form, ChangeProducts).click();
    expect(await box(form, SeeProducts).isChecked()).toBe(true);
    await box(form, SeeProducts).click();
    expect(await box(form, ChangeProducts).isChecked()).toBe(false);
    await box(form, SeeProducts).click();
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Cashier.').waitFor();
    await expect.poll(() => rowsShown()).toContainEqual(['Cashier', 'See products', '0', 'Active']);
  });

  it('refuses a name another role has, and keeps what was typed', async () => {
    await window.getByRole('button', { name: 'Add role' }).click();
    const form = panel('New role');
    await form.getByLabel('Name', { exact: true }).fill('cashier');
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText("There's already a role called Cashier.").waitFor();
    expect(await form.getByLabel('Name', { exact: true }).inputValue()).toBe('cashier');
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
    expect(await db.role.count()).toBe(2);
  });

  it('offers the new role for accounts, and someone with it can reach neither Users nor the Roles inside it', async () => {
    await window.getByRole('button', { name: 'Home' }).click();
    await window.getByRole('button', { name: /^Users/ }).click();
    await window.getByRole('button', { name: 'Add user' }).click();
    const form = panel('New user');
    await form.getByLabel('First name', { exact: true }).fill('Ana');
    await form.getByLabel('Last name', { exact: true }).fill('Cruz');
    await form.getByLabel('Username', { exact: true }).fill('ana');
    await form.getByLabel('Role', { exact: true }).selectOption({ label: 'Cashier' });
    await form.getByLabel('Password (at least 8 characters)', { exact: true }).fill('a-good-password');
    await form.getByLabel('Type the password again', { exact: true }).fill('a-good-password');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Ana Cruz.').waitFor();

    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
    await signIn('ana', 'a-good-password');
    expect(await onHome(/^Users/).isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see users. Ask a manager.").isVisible()).toBe(true);
    expect(await onHome(/^Roles/).count()).toBe(0);
    expect(await window.getByRole('button', { name: /^Products/ }).isEnabled()).toBe(true);
  });
});
