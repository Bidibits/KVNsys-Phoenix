import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createPrismaClient, PrismaSetupStore } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher, ServerPassword } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';
const ServerPasswordTyped = 'shop-door-1234';

describeWithDatabase('a server with a password, from the real app, across restarts', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let server: Awaited<ReturnType<typeof createServer>>;
  let address: string;
  let dataDir: string;
  let app: ElectronApplication | undefined;
  let window: Page;

  const saved = () =>
    JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) as { serverAddress?: string; serverPassword?: { address: string; sealed: string } };
  const serverPassword = () => server.get(ServerPassword);

  async function open() {
    app = await launchApp(dataDir);
    window = await app.firstWindow();
  }
  async function close() {
    await app?.close();
    app = undefined;
  }
  async function signIn() {
    await window.getByLabel('Username').fill('admin');
    await window.getByLabel('Password').fill(AdminPassword);
    await window.getByRole('button', { name: 'Sign in' }).click();
  }

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
    address = `127.0.0.1:${(server.getHttpServer().address() as AddressInfo).port}`;
    await serverPassword().set(ServerPasswordTyped, ServerPasswordTyped);
    dataDir = freshDataDir();
    await open();
  }, 120_000);

  afterAll(async () => {
    await close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
    await database?.drop();
  });

  it('asks for the server password when the server has one, with the box ready to type in', async () => {
    await window.getByLabel('Server address').fill(address);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByRole('alert').getByText('This server has a password. Type it to connect.').waitFor();
    const box = window.getByLabel('Server password');
    expect(await box.evaluate((input) => input === document.activeElement)).toBe(true);
  });

  it('turns away a wrong one, and empties the box', async () => {
    await window.getByLabel('Server password').fill('shop-door-9999');
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByRole('alert').getByText("That isn't this server's password.").waitFor();
    expect(await window.getByLabel('Server password').inputValue()).toBe('');
  });

  it('connects with the right one, and remembers it sealed, never as typed', async () => {
    await window.getByLabel('Server password').fill(ServerPasswordTyped);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').waitFor();
    const kept = saved().serverPassword;
    expect(kept?.address).toBe(`https://${address}`);
    expect(JSON.stringify(saved())).not.toContain(ServerPasswordTyped);
    expect(Buffer.from(kept!.sealed, 'base64').toString('utf8')).not.toContain(ServerPasswordTyped);
  });

  it('signs in, with the server password going along', async () => {
    await signIn();
    await window.getByRole('button', { name: 'Sign out' }).waitFor();
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  });

  it('reconnects on its own after a restart, without asking again', async () => {
    await close();
    await open();
    await window.getByLabel('Username').waitFor();
    expect(await window.getByLabel('Server password').count()).toBe(0);
    await signIn();
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  });

  it('goes back to ask when the server password changes, and forgets the old one', async () => {
    await serverPassword().set('new-door-5678', 'new-door-5678');
    await signIn();
    await window.getByRole('alert').getByText("That isn't this server's password.").waitFor();
    expect(await window.getByLabel('Server password').evaluate((input) => input === document.activeElement)).toBe(true);
    expect(saved().serverPassword).toBeUndefined();
    await window.getByLabel('Server password').fill('new-door-5678');
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').waitFor();
    await signIn();
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  });

  it('asks again after a restart when the remembered one has gone stale', async () => {
    await close();
    await serverPassword().set('third-door-9012', 'third-door-9012');
    await open();
    await window
      .getByRole('alert')
      .getByText("This server's password has changed since this register last connected. Type the new one.")
      .waitFor();
    expect(await window.getByLabel('Server address').inputValue()).toBe(`https://${address}`);
    await window.getByLabel('Server password').fill('third-door-9012');
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByLabel('Username').waitFor();
  });

  it('connects without one once the server password is off, and lets go of the one it kept', async () => {
    serverPassword().turnOff();
    await close();
    await open();
    await window.getByLabel('Username').waitFor();
    expect(saved().serverPassword).toBeUndefined();
    await signIn();
    await window.getByRole('button', { name: 'Sign out' }).waitFor();
  });
});
