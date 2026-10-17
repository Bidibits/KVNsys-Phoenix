import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';

describeWithDatabase('signing in from the real app, against a real server and database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let server: Awaited<ReturnType<typeof createServer>>;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    const db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: AdminPassword,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    await db.$disconnect();

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
    await database?.drop();
  });

  async function signIn(username: string, password: string) {
    await window.getByLabel('Username').fill(username);
    await window.getByLabel('Password').fill(password);
    await window.getByRole('button', { name: 'Sign in' }).click();
  }

  it('asks for a username and a password before trying', async () => {
    await window.getByRole('button', { name: 'Sign in' }).click();
    expect(await window.getByText('Type your username.').isVisible()).toBe(true);
    expect(await window.getByText('Type your password.').isVisible()).toBe(true);
  });

  it('turns away a wrong password, and empties the password box', async () => {
    await signIn('admin', 'not-the-password');
    const problem = window.getByRole('alert');
    await problem.waitFor();
    expect(await problem.textContent()).toBe('Wrong username or password.');
    expect(await window.getByLabel('Password').inputValue()).toBe('');
  });

  it('gives a name that does not exist the very same answer', async () => {
    await signIn('nobody', 'whatever');
    await window.getByText('Wrong username or password.').waitFor();
  });

  it('signs in with the right password, and says who', async () => {
    await signIn('admin', AdminPassword);
    // Wait for this text specifically: the sign-in screen's "Connected to…" notice is a status too.
    const who = window.getByRole('status').filter({ hasText: 'Signed in as' });
    await who.waitFor();
    expect(await who.textContent()).toBe('Signed in as System Administrator (admin, role ADMIN).');
  });

  it('signs out, back to the sign-in screen', async () => {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
    expect(await window.getByLabel('Password').inputValue()).toBe('');
  });
});
