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
import { cellsUnder, expectCompact, expectTableOrder, headingsOf, HistoryColumnsShown } from '../table-cells.js';
import { createThrowawayDatabase, describeWithDatabase } from '../throwaway-database.js';

// What `pnpm package` made: the server, as its setup file installs it, and the app, as a machine's
// setup file installs it. Not the code in src: a change since the last `pnpm package` isn't in them.
const out = fileURLToPath(new URL('../../../out/', import.meta.url));
const serverExe = join(out, 'KVNsys Server', 'KVNsys Server.exe');
const appExe = join(out, 'KVNsys POS & Inventory', 'KVNsys POS & Inventory.exe');
const uninstallAllExe = join(out, 'Uninstall all KVNsys.exe');
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

/** A port nothing on this PC is using, so the location's own server on 9000 is never in the way. */
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

describeWithDatabase('the built programs in out\\, run together on a throwaway location (after pnpm package)', () => {
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
    // Empty: the built server sets its own database up, as it does at a location.
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

  it('sets a new location up as the server setup file does, the username typed "Kenly" kept as kenly', () => {
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

  it("shows Machines compact and in its table's order, the id first and the history last, and the Audit log names a change and who made it", async () => {
    await window.getByRole('button', { name: /^Machines/ }).click();
    const machines = window.getByRole('table', { name: 'Machines' });
    await machines.waitFor();
    await expectCompact(machines);
    await expectTableOrder(db, 'machines', await headingsOf(machines), {
      Id: 'id',
      Code: 'code',
      Name: 'name',
      'Hardware id': 'machine_uuid',
      'Computer name': 'machine_name',
      Location: 'location_id',
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

  it('keeps a column width dragged in the built app on the built server, and gives it back at the next sign-in', async () => {
    expect((await get(port, '/api/my-settings')).status).toBe(401);
    const openMachines = async () => {
      await window.getByRole('button', { name: 'Home', exact: true }).click();
      await window.getByRole('button', { name: /^Machines/ }).click();
      await window.getByRole('table', { name: 'Machines' }).waitFor();
    };
    const idWidth = () =>
      window.getByRole('table', { name: 'Machines' }).evaluate((table) => table.querySelector('thead th')!.getBoundingClientRect().width);
    await openMachines();
    const before = await idWidth();
    // The line at the right-hand edge of the first heading, Id's.
    const edge = (await window.getByRole('table', { name: 'Machines' }).locator('thead th').first().locator('[data-column-edge]').boundingBox())!;
    const [x, y] = [edge.x + edge.width / 2, edge.y + edge.height / 2];
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x - 120, y, { steps: 6 });
    await window.mouse.up();
    const after = await idWidth();
    expect(Math.abs(after - (before - 120))).toBeLessThan(2);
    const keptId = async () => (await db.userSetting.findMany()).map((row) => JSON.parse(row.settings).columnWidths?.Machines?.Id as string);
    await expect.poll(keptId).toEqual([expect.stringMatching(/em$/)]);

    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').fill('kenly');
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
    await openMachines();
    expect(Math.abs((await idWidth()) - after)).toBeLessThan(1);
    await picture(window, 'built-column-widths');
  });

  it('has Uninstall all KVNsys beside them, which finds what Windows says is installed on this PC, in a check that removes nothing', () => {
    expect(existsSync(uninstallAllExe), `${uninstallAllExe} isn't there`).toBe(true);
    const found = join(appData, 'uninstall-all-found.txt');
    spawnSync(uninstallAllExe, ['/CURRENTUSER', '/VERYSILENT', `/CHECK=${found}`], { timeout: 60_000 });
    const said = Object.fromEntries(
      readFileSync(found, 'utf8')
        .trim()
        .split(/\r?\n/)
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
    );
    // What Windows says, read apart from it.
    const registered = (key: string) => spawnSync('reg', ['query', key], { stdio: 'ignore' }).status === 0;
    expect(said.server !== '', 'KVNsys Server').toBe(registered('HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{FE1FED73-BEAD-48D2-AC69-831D052DCC53}_is1'));
    expect(said.app !== '', 'KVNsys POS & Inventory').toBe(registered('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\2b496fba-f10a-5cc0-9abd-0156bf729cf7'));
    expect(said.here !== '', 'the install:here copy').toBe(existsSync(join(process.env.LOCALAPPDATA ?? '', 'Programs', 'KVNsys')));
  });
});
