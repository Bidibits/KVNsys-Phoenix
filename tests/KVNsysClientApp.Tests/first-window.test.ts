import type { AddressInfo } from 'node:net';
import { createServer, ServerVersion } from '@kvnsys/server';
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
    server = await createServer({ logger: false });
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

  it('connects to a running KVNsys Server and says so', async () => {
    await connect(serverAddress);
    const notice = window.getByRole('status');
    await notice.waitFor();
    expect(await notice.textContent()).toBe(`Connected to KVNsys Server ${ServerVersion} at http://${serverAddress}.`);
  });

  it('explains, in plain words, an address that is not one', async () => {
    await connect('oops not an address');
    const problem = window.getByRole('alert');
    await problem.waitFor();
    expect(await problem.textContent()).toMatch(/isn't a server address/);
  });

  it('cannot be turned into a browser: the page has no access to Node', async () => {
    expect(await window.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined');
    expect(await window.evaluate(() => Object.keys(window.kvnsys).sort())).toEqual(['connectToServer', 'savedServerAddress']);
  });
});
