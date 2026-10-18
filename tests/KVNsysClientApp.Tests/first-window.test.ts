import type { AddressInfo } from 'node:net';
import { createServer, createServerCertificate, ServerVersion } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';

describe('the first window, driven like a person would', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let serverAddress: string;
  let dataDir: string;
  let app: ElectronApplication;
  let window: Page;

  beforeAll(async () => {
    server = await createServer({ logger: false, certificate: await createServerCertificate() });
    await server.listen(0, '127.0.0.1');
    serverAddress = `127.0.0.1:${(server.getHttpServer().address() as AddressInfo).port}`;

    dataDir = freshDataDir();
    app = await launchApp(dataDir);
    window = await app.firstWindow();
  });

  afterAll(async () => {
    await app?.close();
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
  });

  async function connect(address: string) {
    await window.getByLabel('Server address').fill(address);
    await window.getByRole('button', { name: 'Connect' }).click();
  }

  it('opens its own window, named after the app', async () => {
    expect(await window.title()).toBe('KVNsys POS & Inventory');
    expect(await window.getByRole('heading', { level: 1 }).textContent()).toBe('KVNsys POS & Inventory');
  });

  it('asks for an address before trying to connect', async () => {
    await connect('');
    expect(await window.getByText("Type the server's address first.").isVisible()).toBe(true);
  });

  it('explains, in plain words, an address that is not one', async () => {
    await connect('oops not an address');
    const problem = window.getByRole('alert');
    await problem.waitFor();
    expect(await problem.textContent()).toMatch(/isn't a server address/);
  });

  it('connects to a running KVNsys Server, says so, and moves on to signing in', async () => {
    await connect(serverAddress);
    const notice = window.getByRole('status');
    await notice.waitFor();
    expect(await notice.textContent()).toBe(
      `Connected to KVNsys Server ${ServerVersion} at https://${serverAddress}. ` +
        'This register now trusts this server, and will refuse any other that tries to answer at this address.',
    );
    expect(await window.getByLabel('Username').isVisible()).toBe(true);
  });

  it('can go back and choose a different server, without bouncing straight back', async () => {
    await window.getByRole('button', { name: 'Use a different server' }).click();
    await window.getByLabel('Server address').waitFor();
    await window.waitForTimeout(500);
    expect(await window.getByLabel('Server address').isVisible()).toBe(true);
    expect(await window.getByLabel('Username').count()).toBe(0);
  });

  it('cannot be turned into a browser: the page has no access to Node', async () => {
    expect(await window.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined');
    expect(await window.evaluate(() => Object.keys((globalThis as unknown as { kvnsys: object }).kvnsys).sort())).toEqual(['connectToServer', 'listProducts', 'savedServerAddress', 'signIn', 'signOut']);
  });
});
