import { readFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createServer, createServerCertificate, type ServerCertificate } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';

/** A port with nothing listening on it. */
async function deadAddress(): Promise<string> {
  const probe = createHttpServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise((resolve) => probe.close(resolve));
  return `127.0.0.1:${port}`;
}

describe('remembering the server, across real restarts of the app', () => {
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  let serverAddress: string;
  let serverPort: number;
  let certificate: ServerCertificate;
  let dataDir: string;

  const saved = () => JSON.parse(readFileSync(join(dataDir, 'settings.json'), 'utf8')) as { serverAddress?: string };
  const trusted = () =>
    JSON.parse(readFileSync(join(dataDir, 'trusted-servers.json'), 'utf8')) as Record<string, { fingerprint256: string }>;

  /** Opens the app, runs `steps` in its window, and closes it again, like a day at the register. */
  async function session(steps: (window: Page) => Promise<void>) {
    const app: ElectronApplication = await launchApp(dataDir);
    try {
      await steps(await app.firstWindow());
    } finally {
      await app.close();
    }
  }

  beforeAll(async () => {
    certificate = await createServerCertificate();
    server = await createServer({ logger: false, certificate });
    await server.listen(0, '127.0.0.1');
    serverPort = (server.getHttpServer().address() as AddressInfo).port;
    serverAddress = `127.0.0.1:${serverPort}`;
    dataDir = freshDataDir();
  });

  afterAll(async () => {
    await server?.close();
    if (dataDir) removeDataDir(dataDir);
  });

  it('starts with an empty box on a PC that remembers nothing', async () => {
    await session(async (window) => {
      await window.getByRole('button', { name: 'Connect' }).waitFor();
      expect(await window.getByLabel('Server address').inputValue()).toBe('');
      expect(await window.getByRole('status').count()).toBe(0);
    });
  });

  it('saves the address once it has connected', async () => {
    await session(async (window) => {
      await window.getByLabel('Server address').fill(serverAddress);
      await window.getByRole('button', { name: 'Connect' }).click();
      await window.getByRole('status').waitFor();
    });
    expect(saved()).toEqual({ serverAddress: `https://${serverAddress}` });
    expect(trusted()[`https://${serverAddress}`]?.fingerprint256).toBe(certificate.fingerprint256);
  });

  it('connects on its own the next time it opens', async () => {
    await session(async (window) => {
      const notice = window.getByRole('status');
      await notice.waitFor();
      expect(await notice.textContent()).toContain(`Connected to KVNsys Server`);
      expect(await notice.textContent()).toContain(`at https://${serverAddress}.`);
      expect(await window.getByLabel('Username').isVisible()).toBe(true);
    });
  });

  it('keeps the saved address when a different one fails', async () => {
    await session(async (window) => {
      await window.getByRole('status').waitFor();
      await window.getByRole('button', { name: 'Use a different server' }).click();
      await window.getByLabel('Server address').fill(await deadAddress());
      await window.getByRole('button', { name: 'Connect' }).click();
      await window.getByRole('alert').waitFor();
    });
    expect(saved()).toEqual({ serverAddress: `https://${serverAddress}` });
  });

  it('keeps the address, and explains, when the server is switched off', async () => {
    await server?.close();
    server = undefined;
    await session(async (window) => {
      const problem = window.getByRole('alert');
      await problem.waitFor();
      expect(await problem.textContent()).toMatch(/Couldn't reach a server/);
      expect(await window.getByLabel('Server address').inputValue()).toBe(`https://${serverAddress}`);
    });
    expect(saved()).toEqual({ serverAddress: `https://${serverAddress}` });
  });

  it('refuses an impostor answering at the trusted address, and keeps trusting the real one', async () => {
    // A different machine, with its own certificate, takes over the trusted server's address.
    const impostor = await createServer({ logger: false, certificate: await createServerCertificate() });
    await impostor.listen(serverPort, '127.0.0.1');
    try {
      await session(async (window) => {
        const problem = window.getByRole('alert');
        await problem.waitFor();
        expect(await problem.textContent()).toMatch(/isn't the one this register trusts/);
      });
    } finally {
      await impostor.close();
    }
    expect(trusted()[`https://${serverAddress}`]?.fingerprint256).toBe(certificate.fingerprint256);
  });
});
