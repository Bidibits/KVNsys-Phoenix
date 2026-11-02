import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient, type PrismaClient } from '@kvnsys/postgres';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { cellsUnder, expectTableOrder, headingsOf, HistoryColumnsShown } from '../table-cells.js';
import { createThrowawayDatabase, describeWithDatabase } from '../throwaway-database.js';

// What `pnpm package` made: the server, as its setup file installs it, and the app, as a machine's
// setup file installs it. Not the code in src: a change since the last `pnpm package` isn't in them.
const out = fileURLToPath(new URL('../../../out/', import.meta.url));
const serverExe = join(out, 'KVNsys Server', 'KVNsys Server.exe');
const appExe = join(out, 'KVNsys POS & Inventory', 'KVNsys POS & Inventory.exe');
const Password = 'package-check-password';

/** The protocol the code says, so a server left over from an older `pnpm package` is noticed. */
const ProtocolInCode = Number(
  /ProtocolVersion = (\d+)/.exec(readFileSync(fileURLToPath(new URL('../../../src/KVNsysWire/hello.ts', import.meta.url)), 'utf8'))![1],
);

/** Set KVNSYS_SCREENSHOTS to a folder to keep a picture of each step, for a person to look at. */
async function picture(window: Page, name: string) {
  const folder = process.env.KVNSYS_SCREENSHOTS;
  if (folder) await window.screenshot({ path: join(folder, `${name}.png`), animations: 'disabled' });
}

/** A port nothing on this PC is using, so the shop's own server on 9000 is never in the way. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => done(port));
    });
  });
}

/** A GET to the built server: its status, and its answer read as JSON when it is. */
function get(port: number, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((done, fail) => {
    // Its own new certificate, which this check has no reason to pin: only the answers matter here.
    const asking = request({ host: '127.0.0.1', port, path, rejectUnauthorized: false }, (answer) => {
      let text = '';
      answer.on('data', (chunk) => (text += chunk));
      answer.on('end', () => {
        let body: unknown = text;
        try {
          body = JSON.parse(text);
        } catch {
          // Not JSON: kept as text.
        }
        done({ status: answer.statusCode ?? 0, body });
      });
    });
    asking.on('error', fail);
    asking.end();
  });
}

describeWithDatabase('the built programs in out\\, run together on a throwaway shop (after pnpm package)', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let serverData: string;
  let appData: string;
  let port: number;
  let server: ChildProcess | undefined;
  let app: ElectronApplication | undefined;
  let window: Page;

  /** The built server's settings for this check: its own folder and port, the throwaway database. */
  const serverEnv = () => ({ ...process.env, DATABASE_URL: database.url, KVNSYS_SERVER_DATA: serverData, KVNSYS_PORT: String(port) });

  beforeAll(async () => {
    if (!existsSync(serverExe) || !existsSync(appExe)) throw new Error(`There are no built programs in ${out}: run pnpm package first.`);
    // Empty: the built server sets its own database up, as it does at a shop.
    database = await createThrowawayDatabase({ migrate: false });
    db = createPrismaClient(database.url);
    serverData = mkdtempSync(join(tmpdir(), 'kvnsys-built-server-'));
    appData = mkdtempSync(join(tmpdir(), 'kvnsys-built-app-'));
    port = await freePort();
  });

  afterAll(async () => {
    await app?.close();
    server?.kill();
    await db?.$disconnect();
    await database?.drop();
    for (const folder of [serverData, appData]) if (folder) rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  it('sets a new shop up as the server setup file does, the username typed "Kenly" kept as kenly', () => {
    const setUp = spawnSync(serverExe, ['--set-up'], {
      env: { ...serverEnv(), KVNSYS_LOCATION_NAME: 'Package Check', KVNSYS_ADMIN_USERNAME: 'Kenly', KVNSYS_ADMIN_PASSWORD: Password },
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(setUp.status, `${setUp.stdout}${setUp.stderr}`).toBe(0);
    expect(setUp.stdout).toContain('On any machine, sign in as "kenly" with that password.');
  });

  it("serves, as this code's protocol, with the machines calls and without the old registers ones", async () => {
    expect((await db.user.findMany()).map((user) => user.username)).toEqual(['kenly']);
    const started = spawn(serverExe, [], { env: serverEnv() });
    server = started;
    let said = '';
    await new Promise<void>((ready, fail) => {
      const timer = setTimeout(() => fail(new Error(`The built server never said it was running:\n${said}`)), 60_000);
      const hear = (chunk: Buffer) => {
        said += chunk.toString();
        if (said.includes(`running on port ${port}`)) {
          clearTimeout(timer);
          ready();
        }
      };
      started.stdout?.on('data', hear);
      started.stderr?.on('data', hear);
      started.once('exit', (code) => {
        clearTimeout(timer);
        fail(new Error(`The built server stopped (${code}):\n${said}`));
      });
    });
    expect((await get(port, '/api/hello')).body).toMatchObject({ product: 'KVNsys Server', protocol: ProtocolInCode, serverPassword: false });
    expect((await get(port, '/api/machines')).status).toBe(401);
    expect((await get(port, '/api/registers')).status).toBe(404);
  });

  it('connects the built app to it, and signs in with that username, capitals and all', async () => {
    app = await electron.launch({ executablePath: appExe, args: [], env: { ...(process.env as Record<string, string>), KVNSYS_APP_DATA: appData } });
    window = await app.firstWindow();
    await window.getByLabel('Server address').fill(`127.0.0.1:${port}`);
    await window.getByRole('button', { name: 'Connect' }).click();
    await window.getByText('This machine now trusts this server').waitFor();
    await window.getByLabel('Username').fill('Kenly');
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
    expect(await window.getByLabel('Signed in').innerText()).toMatch(/^System Administrator\nkenly · /);
    await picture(window, 'built-home');
  });

  it('shows Machines in its table\'s order, the id first and the history last, and the Audit log names a change and who made it', async () => {
    await window.getByRole('button', { name: /^Machines/ }).click();
    const machines = window.getByRole('table', { name: 'Machines' });
    await machines.waitFor();
    await expectTableOrder(db, 'machines', await headingsOf(machines), {
      Id: 'id',
      Code: 'code',
      Name: 'name',
      'Hardware id': 'machine_uuid',
      'Computer name': 'machine_name',
      Shop: 'location_id',
      Status: 'status',
      Description: 'description',
      ...HistoryColumnsShown,
    });
    // The server PC, set up by KVNsys itself: the only machine, since the app runs on that PC too.
    await machines.getByRole('button', { name: 'Edit Server' }).click();
    const form = window.getByRole('dialog', { name: 'Edit machine' });
    await form.getByLabel('Name', { exact: true }).fill('Front counter');
    await form.getByRole('button', { name: 'Save' }).click();
    await window.getByText('Saved Front counter.').waitFor();
    await picture(window, 'built-machines');

    await window.getByRole('button', { name: 'Home', exact: true }).click();
    await window.getByRole('button', { name: /^Audit log/ }).click();
    const log = window.getByRole('table', { name: 'Audit log' });
    await log.waitFor();
    expect((await cellsUnder(log, ['Table', 'Column', 'Before', 'After', 'By']))[0]).toEqual(['Machines', 'Name', 'Server', 'Front counter', 'System Administrator (kenly)']);
    await picture(window, 'built-audit-log');
  });
});
