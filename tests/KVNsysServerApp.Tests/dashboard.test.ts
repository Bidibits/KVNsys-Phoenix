import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import {
  createServer,
  createServerCertificate,
  DisconnectedAtServer,
  InstallSeed,
  lanAddresses,
  ScryptPasswordHasher,
  ServerPassword,
  ServerVersion,
  startServerControl,
  type ServerCertificate,
  type ServerControl,
} from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDir, launchDashboard, pretendService, removeDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';

type Pretend = { state: string; startsWithPc: boolean };
const readPretend = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Pretend;

/** The big label that says whether the server is on. */
const power = (window: Page) => window.getByRole('status', { name: 'The server is' });

describeWithDatabase('the dashboard, with the server on and people connected', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let certificate: ServerCertificate;
  let server: Awaited<ReturnType<typeof createServer>>;
  let control: ServerControl;
  let port: number;
  let serverDir: string;
  let appDataDir: string;
  let serviceFile: string;
  let app: ElectronApplication | undefined;
  let window: Page;
  const passes = new Map<string, string>();

  /** Signs the administrator in at a register named `computerName`, as a register would. */
  function signIn(computerName: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ username: 'admin', password: AdminPassword, register: { hardwareId: `hw-${computerName}`, computerName } });
      const req = request(`https://127.0.0.1:${port}/api/sign-in`, {
        method: 'POST',
        ca: certificate.cert,
        agent: false,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      });
      req.on('error', reject);
      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve((JSON.parse(Buffer.concat(chunks).toString('utf8')) as { session: { token: string } }).session.token));
      });
      req.end(body);
    });
  }

  /** What the server says about a pass now: 200, or 401 with the reason. */
  function sessionOf(token: string): Promise<{ status: number; message?: string }> {
    return new Promise((resolve, reject) => {
      const req = request(`https://127.0.0.1:${port}/api/session`, { ca: certificate.cert, agent: false, headers: { Authorization: `Bearer ${token}` } });
      req.on('error', reject);
      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, ...(JSON.parse(Buffer.concat(chunks).toString('utf8')) as { message?: string }) }));
      });
      req.end();
    });
  }

  async function open() {
    app = await launchDashboard({ serverDir, serviceFile, appDataDir });
    window = await app.firstWindow();
    await power(window).waitFor();
  }

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
    serverDir = freshDir();
    appDataDir = freshDir();
    certificate = await createServerCertificate();
    server = await createServer({ logger: false, certificate, databaseUrl: database.url, dataDir: serverDir });
    await server.listen(0, '127.0.0.1');
    port = (server.getHttpServer().address() as AddressInfo).port;
    control = await startServerControl(server, { dataDir: serverDir, port });
    passes.set('FRONT-PC', await signIn('FRONT-PC'));
    passes.set('BACK-PC', await signIn('BACK-PC'));
    serviceFile = pretendService(join(appDataDir, 'pretend-service.json'), { state: 'running', startsWithPc: false });
    await open();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await control?.close();
    await server?.close();
    await db?.$disconnect();
    await database?.drop();
    if (serverDir) removeDir(serverDir);
    if (appDataDir) removeDir(appDataDir);
  });

  it('says the server is on, where registers reach it, and its version', async () => {
    await expect.poll(() => power(window).textContent()).toBe('On');
    const addresses = await window.getByLabel('Address').allTextContents();
    expect(addresses).toEqual(lanAddresses().map((address) => `${address}:${port}`));
    expect(await window.getByText(`version ${ServerVersion}`).isVisible()).toBe(true);
  });

  it("lists who's connected, at which register", async () => {
    const table = window.getByRole('table', { name: 'Connected' });
    await table.waitFor();
    expect(await table.getByRole('row').count()).toBe(3);
    await table.getByRole('row', { name: /FRONT-PC/ }).waitFor();
    await table.getByRole('row', { name: /BACK-PC/ }).waitFor();
  });

  it('disconnects one person after asking, and their register is told why', async () => {
    const table = window.getByRole('table', { name: 'Connected' });
    await table.getByRole('row', { name: /FRONT-PC/ }).getByRole('button', { name: 'Disconnect' }).click();
    const asking = window.getByRole('alertdialog');
    expect(await asking.textContent()).toContain('New register (FRONT-PC)');
    await asking.getByRole('button', { name: 'Disconnect' }).click();
    await window.getByText('System Administrator is disconnected.').waitFor();
    await expect.poll(() => table.getByRole('row').count()).toBe(2);
    expect(await sessionOf(passes.get('FRONT-PC')!)).toEqual({ status: 401, signedIn: false, message: DisconnectedAtServer });
    expect((await sessionOf(passes.get('BACK-PC')!)).status).toBe(200);
  });

  it('keeps everyone when the question is answered "Keep it"', async () => {
    const table = window.getByRole('table', { name: 'Connected' });
    await table.getByRole('row', { name: /BACK-PC/ }).getByRole('button', { name: 'Disconnect' }).click();
    await window.getByRole('alertdialog').getByRole('button', { name: 'Keep it' }).click();
    expect((await sessionOf(passes.get('BACK-PC')!)).status).toBe(200);
  });

  it('switches starting with the PC on and off', async () => {
    const tick = window.getByRole('checkbox', { name: 'Start the server when this PC starts' });
    expect(await tick.isChecked()).toBe(false);
    await tick.click();
    await expect.poll(() => readPretend(serviceFile).startsWithPc).toBe(true);
    await expect.poll(() => tick.isChecked()).toBe(true);
    await tick.click();
    await expect.poll(() => readPretend(serviceFile).startsWithPc).toBe(false);
  });

  it('sets a server password, refusing a short one and two that differ', async () => {
    const section = window.getByRole('region', { name: 'Server password' });
    expect(await section.textContent()).toContain('Off.');
    await section.getByRole('button', { name: 'Set a server password' }).click();
    await section.getByLabel('Server password').fill('short');
    await section.getByLabel('Type it again').fill('short');
    await section.getByRole('button', { name: 'Save' }).click();
    await section.getByRole('alert').getByText('A password needs at least 8 characters.').waitFor();
    expect(await section.getByLabel('Server password').inputValue()).toBe('');

    await section.getByLabel('Server password').fill('shop-door-1234');
    await section.getByLabel('Type it again').fill('shop-door-1235');
    await section.getByRole('button', { name: 'Save' }).click();
    await section.getByRole('alert').getByText(/didn't match/).waitFor();

    await section.getByLabel('Server password').fill('shop-door-1234');
    await section.getByLabel('Type it again').fill('shop-door-1234');
    await section.getByRole('button', { name: 'Save' }).click();
    await window.getByText('The server password is on. Registers ask for it the next time they connect.').waitFor();
    await expect.poll(() => section.textContent()).toContain('On.');
    expect(await server.get(ServerPassword).check('shop-door-1234')).toBeNull();
    // Never written anywhere as typed.
    expect(readFileSync(join(serverDir, 'server-password.json'), 'utf8')).not.toContain('shop-door-1234');
  });

  it('changes the server password, then turns it off after asking', async () => {
    const section = window.getByRole('region', { name: 'Server password' });
    await section.getByRole('button', { name: 'Change it' }).click();
    await section.getByLabel('New server password').fill('new-door-5678');
    await section.getByLabel('Type it again').fill('new-door-5678');
    await section.getByRole('button', { name: 'Save' }).click();
    await window.getByText('The server password is changed. Registers ask for the new one the next time they connect.').waitFor();
    expect(await server.get(ServerPassword).check('new-door-5678')).toBeNull();

    await section.getByRole('button', { name: 'Turn it off' }).click();
    await window.getByRole('alertdialog').getByRole('button', { name: 'Turn it off' }).click();
    await expect.poll(() => section.textContent()).toContain('Off.');
    expect(server.get(ServerPassword).state()).toBe('off');
  });

  it('asks before turning the server off while someone is signed in, then turns it off', async () => {
    await window.getByRole('button', { name: 'Turn the server off' }).click();
    const asking = window.getByRole('alertdialog');
    expect(await asking.textContent()).toContain('One person is signed in.');
    await asking.getByRole('button', { name: 'Turn it off' }).click();
    await expect.poll(() => readPretend(serviceFile).state).toBe('stopped');
    await expect.poll(() => power(window).textContent()).toBe('Off');
  });

  it('leaves the server running when the window closes, unless that box is ticked', async () => {
    writeFileSync(serviceFile, JSON.stringify({ state: 'running', startsWithPc: false }));
    const tick = window.getByRole('checkbox', { name: 'Turn the server off when this window closes' });
    expect(await tick.isChecked()).toBe(false);
    expect(existsSync(join(serverDir, 'dashboard.json'))).toBe(false);
    await app!.close();
    expect(readPretend(serviceFile).state).toBe('running');
    await open();
  });

  it('turns the server off with the window when that box is ticked, and remembers the tick', async () => {
    const tick = window.getByRole('checkbox', { name: 'Turn the server off when this window closes' });
    await tick.click();
    await expect.poll(() => tick.isChecked()).toBe(true);
    expect(JSON.parse(readFileSync(join(serverDir, 'dashboard.json'), 'utf8'))).toEqual({ stopServerOnClose: true });

    const closed = app!.waitForEvent('close');
    await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
    await closed;
    app = undefined;
    expect(readPretend(serviceFile).state).toBe('stopped');

    writeFileSync(serviceFile, JSON.stringify({ state: 'running', startsWithPc: false }));
    await open();
    await expect.poll(() => window.getByRole('checkbox', { name: 'Turn the server off when this window closes' }).isChecked()).toBe(true);
  });
});

describe('the dashboard, with the server off', () => {
  let serverDir: string;
  let appDataDir: string;
  let serviceFile: string;
  let app: ElectronApplication | undefined;

  beforeEach(() => {
    serverDir = freshDir();
    appDataDir = freshDir();
    serviceFile = join(appDataDir, 'pretend-service.json');
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    removeDir(serverDir);
    removeDir(appDataDir);
  });

  it('says it is off, that nobody is connected, and turns it on', async () => {
    pretendService(serviceFile, { state: 'stopped', startsWithPc: false });
    writeFileSync(join(serverDir, 'server.env'), 'KVNSYS_PORT=9107\n');
    app = await launchDashboard({ serverDir, serviceFile, appDataDir });
    const window = await app.firstWindow();
    await expect.poll(() => power(window).textContent()).toBe('Off');
    expect(await window.getByText('The server is off, so nobody is connected.').isVisible()).toBe(true);
    expect(await window.getByText('Turn the server on to set, change or turn off its password.').isVisible()).toBe(true);
    // The port it will use, from its settings, even while it's off.
    expect(await window.getByLabel('Address').allTextContents()).toEqual(lanAddresses().map((address) => `${address}:9107`));

    await window.getByRole('button', { name: 'Turn the server on' }).click();
    await expect.poll(() => readPretend(serviceFile).state).toBe('running');
    // Windows says it's running, but no server is answering here: it's still starting, as far as anyone can tell.
    await expect.poll(() => power(window).textContent()).toBe('Starting…');
  });

  it('says plainly when the server is not installed, and offers nothing to press', async () => {
    writeFileSync(serviceFile, JSON.stringify({ state: 'not-installed', startsWithPc: false }));
    app = await launchDashboard({ serverDir, serviceFile, appDataDir });
    const window = await app.firstWindow();
    await expect.poll(() => power(window).textContent()).toBe('Not installed');
    await window.getByText("KVNsys Server isn't installed as a Windows service on this PC. Run KVNsys Server Setup.").waitFor();
    expect(await window.getByRole('button', { name: /Turn the server/ }).count()).toBe(0);
  });

  it("says when Windows can't be asked, instead of guessing", async () => {
    app = await launchDashboard({ serverDir, serviceFile: join(appDataDir, 'missing.json'), appDataDir });
    const window = await app.firstWindow();
    await expect.poll(() => power(window).textContent()).toBe('Unknown');
    await window.getByRole('alert').first().waitFor();
  });
});
