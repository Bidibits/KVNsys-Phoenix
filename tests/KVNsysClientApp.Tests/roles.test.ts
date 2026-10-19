import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';
const SeeProducts = 'See the products and their prices';
const ChangeProducts = 'Add products, and change their details and prices';

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

  const rolesTile = () => window.getByRole('button', { name: /^Roles/ });
  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const box = (form: ReturnType<typeof panel>, label: string) => form.getByRole('checkbox', { name: label, exact: true });
  const rowsShown = () =>
    window
      .getByRole('table', { name: 'Roles' })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].slice(0, 4).map((cell) => cell.textContent)));

  it('shows an administrator the Roles tile, and a new install has only the Administrator, with every right', async () => {
    await signIn('admin', AdminPassword);
    expect(await rolesTile().isEnabled()).toBe(true);
    await rolesTile().click();
    await window.getByRole('table', { name: 'Roles' }).waitFor();
    expect(await rowsShown()).toEqual([['Administrator', 'Every right', '1', 'Active']]);
  });

  it("shows the Administrator's boxes all ticked and locked, so it can only be renamed", async () => {
    await window.getByRole('button', { name: 'Edit Administrator' }).click();
    const form = panel('Edit role');
    await form.getByText('The Administrator always has every right').waitFor();
    const boxes = form.getByRole('checkbox');
    expect(await boxes.count()).toBe(9);
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
    expect(await rowsShown()).toContainEqual(['Cashier', 'See products', '0', 'Active']);
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

  it('offers the new role for accounts, and someone with it finds Roles greyed out', async () => {
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
    expect(await rolesTile().isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see roles. Ask a manager.").isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: /^Products/ }).isEnabled()).toBe(true);
  });
});
