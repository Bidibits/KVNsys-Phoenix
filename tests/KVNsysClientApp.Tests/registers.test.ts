import type { AddressInfo } from 'node:net';
import { hostname } from 'node:os';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const firstName = `New register (${hostname()})`.slice(0, 60);

describeWithDatabase('registers from the real app', () => {
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

  async function signIn() {
    await window.getByLabel('Username').fill('admin');
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
  }

  const signedIn = () => window.getByLabel('Signed in').textContent();
  const rowsShown = () =>
    window
      .getByRole('table', { name: 'Registers' })
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll('td')].slice(0, 3).map((cell) => cell.textContent ?? '')));

  it('records this PC as a register the first time someone signs in at it, and shows it in the title bar', async () => {
    await signIn();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
    expect(await signedIn()).toBe(`System Administratoradmin · ${firstName}`);
    expect(await db.machine.findFirstOrThrow({ where: { code: 'HQ-R01' } })).toMatchObject({ name: firstName, machineName: hostname() });
  });

  it('lists the registers, the server PC first, and names this one', async () => {
    await window.getByRole('button', { name: /^Registers/ }).click();
    await window.getByRole('table', { name: 'Registers' }).waitFor();
    expect(await rowsShown()).toEqual([
      ['HQ-SRV', 'Serverthe server PC', 'TEST-SERVER'],
      ['HQ-R01', firstName, hostname()],
    ]);
    await window.getByRole('button', { name: `Edit ${firstName}` }).click();
    const form = window.getByRole('dialog', { name: 'Edit register' });
    await form.getByLabel('Name', { exact: true }).fill('Counter 1');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Counter 1.').waitFor();
    expect((await rowsShown())[1]).toEqual(['HQ-R01', 'Counter 1', hostname()]);
  });

  it('lets the server PC be renamed, never switched off', async () => {
    await window.getByRole('button', { name: 'Edit Server' }).click();
    const form = window.getByRole('dialog', { name: 'Edit register' });
    expect(await form.getByLabel('Status').isDisabled()).toBe(true);
    expect(await form.getByText('The server PC stays switched on. Only its name can change.').isVisible()).toBe(true);
    await window.keyboard.press('Escape');
    await form.waitFor({ state: 'detached' });
  });

  it('shows the new name in the title bar at the next sign-in', async () => {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await signIn();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
    expect(await signedIn()).toBe('System Administratoradmin · Counter 1');
  });

  it('switching this register off signs it out at once, and nobody can sign in at it after', async () => {
    await window.getByRole('button', { name: /^Registers/ }).click();
    await window.getByRole('button', { name: 'Edit Counter 1' }).click();
    const form = window.getByRole('dialog', { name: 'Edit register' });
    await form.getByLabel('Status').selectOption('Inactive');
    await form.getByRole('button', { name: 'Save' }).click();
    // The save itself was allowed; the list asked for after it finds the sign-in ended.
    await window.getByText('Your sign-in has ended. Sign in again.').waitFor();
    await window.getByRole('button', { name: 'Sign in again' }).click();
    await signIn();
    await window.getByText('This register, Counter 1, is switched off. Ask a manager.').waitFor();
  });
});
