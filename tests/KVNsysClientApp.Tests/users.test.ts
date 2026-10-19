import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';

describeWithDatabase('managing user accounts from the real app', () => {
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
      adminPassword: AdminPassword,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    // A new install has only the Administrator role; the shop makes a cashier role itself.
    const cashier = await db.role.create({ data: { id: randomUUID(), code: 'CASHIER', name: 'Cashier', level: 10 } });
    await db.access.create({ data: { id: randomUUID(), roleId: cashier.id, access: 'products.view' } });

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
  async function signOut() {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  }

  const usersTile = () => window.getByRole('button', { name: /^Users/ });
  const panel = (title: string) => window.getByRole('dialog', { name: title });
  const field = (form: ReturnType<typeof panel>, label: string) => form.getByLabel(label, { exact: true });
  const rowsShown = () =>
    window
      .getByRole('table', { name: 'Users' })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].slice(0, 4).map((cell) => cell.textContent)));

  it('shows an administrator the Users tile, and a new install has only them', async () => {
    await signIn('admin', AdminPassword);
    expect(await usersTile().isEnabled()).toBe(true);
    await usersTile().click();
    await window.getByRole('table', { name: 'Users' }).waitFor();
    expect(await rowsShown()).toEqual([['System Administrator', 'admin', 'Administrator', 'Active']]);
  });

  it('adds a cashier from the panel, and the list shows them', async () => {
    await window.getByRole('button', { name: 'Add user' }).click();
    const form = panel('New user');
    await field(form, 'First name').fill('Ana');
    await field(form, 'Last name').fill('Cruz');
    await field(form, 'Username').fill('Ana');
    await field(form, 'Role').selectOption({ label: 'Cashier' });
    await field(form, 'Password (at least 8 characters)').fill('a-good-password');
    await field(form, 'Type the password again').fill('a-good-password');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Ana Cruz.').waitFor();
    expect(await rowsShown()).toContainEqual(['Ana Cruz', 'ana', 'Cashier', 'Active']);
  });

  it('refuses mismatched passwords in the panel, and saves nothing', async () => {
    await window.getByRole('button', { name: 'Add user' }).click();
    const form = panel('New user');
    await field(form, 'First name').fill('Ben');
    await field(form, 'Last name').fill('Reyes');
    await field(form, 'Username').fill('ben');
    await field(form, 'Password (at least 8 characters)').fill('a-good-password');
    await field(form, 'Type the password again').fill('another-password');
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText("Those two passwords didn't match. Type them again.").waitFor();
    expect(await db.user.count({ where: { username: 'ben' } })).toBe(0);
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
  });

  it("changes a cashier's password from their account", async () => {
    await window.getByRole('button', { name: 'Edit Ana Cruz' }).click();
    const form = panel('Edit user');
    await field(form, 'New password').fill('ana-new-password');
    await field(form, 'Type the new password again').fill('ana-new-password');
    await form.getByRole('button', { name: 'Set new password' }).click();
    await form.getByText('Password changed. They have to sign in again with the new one.').waitFor();
    await form.getByRole('button', { name: 'Cancel' }).click();
    await form.waitFor({ state: 'detached' });
  });

  it('will not let the only administrator switch themselves off', async () => {
    await window.getByRole('button', { name: 'Edit System Administrator' }).click();
    const form = panel('Edit user');
    await field(form, 'Status').selectOption({ label: 'Switched off: cannot sign in' });
    await form.getByRole('button', { name: 'Save' }).click();
    await form.getByText(/leave nobody able to manage users/).waitFor();
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
    expect(await rowsShown()).toContainEqual(['System Administrator', 'admin', 'Administrator', 'Active']);
  });

  it('lets the cashier sign in with the new password, and greys out Users for them', async () => {
    await signOut();
    await signIn('ana', 'ana-new-password');
    expect(await usersTile().isDisabled()).toBe(true);
    expect(await window.getByText("Your role can't see users. Ask a manager.").isVisible()).toBe(true);
    expect(await window.getByRole('button', { name: /^Products/ }).isEnabled()).toBe(true);
  });

  it('switches the cashier off, and the list says so', async () => {
    await signOut();
    await signIn('admin', AdminPassword);
    await usersTile().click();
    await window.getByRole('button', { name: 'Edit Ana Cruz' }).click();
    const form = panel('Edit user');
    await field(form, 'Status').selectOption({ label: 'Switched off: cannot sign in' });
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Ana Cruz.').waitFor();
    expect(await rowsShown()).toContainEqual(['Ana Cruz', 'ana', 'Cashier', 'Inactive']);
  });
});
