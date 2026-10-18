import type { AddressInfo } from 'node:net';
import { createPrismaClient, PrismaSetupStore } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher, Sessions } from '@kvnsys/server';
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

  it('fits a first connection plus a wrong password in the window, without scrolling', async () => {
    // Both notices are showing, and the first-trust one is the longest. A restyle once made this
    // scroll while every other test passed, because every message was still there.
    expect(await window.getByText('This register now trusts this server').isVisible()).toBe(true);
    expect(await window.getByRole('alert').isVisible()).toBe(true);
    const page = await window.evaluate(() => ({ height: document.documentElement.scrollHeight, window: innerHeight }));
    expect(page.height).toBeLessThanOrEqual(page.window);
  });

  it('signs in with the right password, opens Home, and says who in the title bar', async () => {
    await signIn('admin', AdminPassword);
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
    expect(await window.getByLabel('Signed in').innerText()).toBe('System Administrator\nadmin');
    // The server handed this register a pass, and is keeping exactly one.
    expect(server.get(Sessions).activeCount()).toBe(1);
  });

  it('signs out, back to the sign-in screen, and the server cancels the pass', async () => {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
    expect(await window.getByLabel('Password').inputValue()).toBe('');
    // The server only cancels a pass that matches, so this proves the app kept it and showed it.
    expect(server.get(Sessions).activeCount()).toBe(0);
  });

  it('keeps the pass on the desktop side: the screens are never handed it', async () => {
    // Asked the way a screen asks. (Inside evaluate, globalThis is the window's own.)
    type Bridge = { signIn(username: string, password: string): Promise<unknown>; signOut(): Promise<void> };
    const reply = await window.evaluate(
      (password) => (globalThis as unknown as { kvnsys: Bridge }).kvnsys.signIn('admin', password),
      AdminPassword,
    );
    expect(reply).toEqual({
      ok: true,
      user: { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN', rights: expect.arrayContaining(['products.view']) },
    });
    expect(server.get(Sessions).activeCount()).toBe(1);
    await window.evaluate(() => (globalThis as unknown as { kvnsys: Bridge }).kvnsys.signOut());
    expect(server.get(Sessions).activeCount()).toBe(0);
  });
});
