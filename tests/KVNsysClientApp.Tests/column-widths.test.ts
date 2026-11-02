import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import type { ElectronApplication, Page } from 'playwright-core';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { freshDataDir, launchApp, removeDataDir } from './launch.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
/** The grids' text size: a width in em is this many pixels to the em. */
const Em = 13;

/** Set KVNSYS_SCREENSHOTS to a folder to keep a picture of each step, for a person to look at. */
async function picture(window: Page, name: string) {
  const folder = process.env.KVNSYS_SCREENSHOTS;
  if (folder) await window.screenshot({ path: join(folder, `${name}.png`), animations: 'disabled' });
}

describeWithDatabase('column widths from the real app', () => {
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
    // Ben may look at the machines but not change them, so his list has no Edit buttons.
    const role = await db.role.create({ data: { id: randomUUID(), code: 'LOOKER', name: 'Looker', level: 10 } });
    await db.access.create({ data: { id: randomUUID(), roleId: role.id, access: 'machines.view' } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username: 'ben', firstName: 'Ben', lastName: 'Cruz', passwordHash, roleId: role.id } });

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

  async function signInAs(username: string) {
    await window.getByLabel('Username').fill(username);
    await window.getByLabel('Password').fill(Password);
    await window.getByRole('button', { name: 'Sign in' }).click();
    await window.getByRole('navigation', { name: 'Areas' }).waitFor();
  }

  async function signOut() {
    await window.getByRole('button', { name: 'Sign out' }).click();
    await window.getByLabel('Username').waitFor();
  }

  const table = () => window.getByRole('table', { name: 'Machines' });

  async function openMachines() {
    await window.getByRole('button', { name: /^Machines/ }).click();
    await table().waitFor();
  }

  /** How wide a column is on screen, in pixels, found by its heading. */
  const widthOf = (heading: string) =>
    table().evaluate((element, wanted) => {
      const cell = [...element.querySelectorAll('thead th')].find((th) => (th.textContent ?? '').replace(/[▲▼]/g, '') === wanted);
      return cell ? cell.getBoundingClientRect().width : -1;
    }, heading);

  /** The line at a heading's right-hand edge, which drags: a pointer's alone, so it has no name of its own. */
  const edgeOf = (heading: string) =>
    table()
      .locator('thead th')
      .filter({ hasText: new RegExp(`^${heading}$`) })
      .locator('[data-column-edge]');

  /** Drags the line at a heading's right-hand edge sideways by this many pixels, as a person would. */
  async function dragEdge(heading: string, by: number) {
    const box = (await edgeOf(heading).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await window.mouse.move(x, y);
    await window.mouse.down();
    await window.mouse.move(x + by / 2, y, { steps: 4 });
    await window.mouse.move(x + by, y, { steps: 4 });
    await window.mouse.up();
  }

  /** What the server keeps for someone, as the database holds it, or null when nothing yet. */
  async function keptFor(username: string): Promise<{ columnWidths: Record<string, Record<string, string>> } | null> {
    const user = await db.user.findUniqueOrThrow({ where: { username } });
    const row = await db.userSetting.findUnique({ where: { userId: user.id } });
    return row ? JSON.parse(row.settings) : null;
  }

  /**
   * Where the lines between columns are: for each heading, and each cell of the first row, whether
   * it draws one on its right-hand edge and on its left (a pinned column draws its own, on its left).
   */
  const linesOf = () =>
    table().evaluate((element) => {
      const edges = (cell: Element) => {
        const shadow = getComputedStyle(cell).boxShadow;
        return { right: /-1px 0px 0px 0px inset/.test(shadow), left: /\s1px 0px 0px 0px inset/.test(shadow) };
      };
      return {
        headings: [...element.querySelectorAll('thead th')].map(edges),
        cells: [...element.querySelectorAll('tbody tr:first-child td')].map(edges),
      };
    });

  /** One line between each two columns, drawn by one of them, and none after the last. */
  function expectOneLineBetween(row: { right: boolean; left: boolean }[]) {
    expect(row.length).toBeGreaterThan(3);
    row.slice(0, -1).forEach((cell, at) => expect(cell.right !== row[at + 1]!.left, `between columns ${at + 1} and ${at + 2}`).toBe(true));
    expect(row.at(-1)!.right).toBe(false);
  }

  /** The cells of a column that are cut short (ending in …), found by its heading. */
  const cutUnder = (heading: string) =>
    table().evaluate((element, wanted) => {
      const at = [...element.querySelectorAll('thead th')].findIndex((th) => (th.textContent ?? '').replace(/[▲▼]/g, '') === wanted);
      const cells = [...element.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[at]!);
      return cells.filter((cell) => cell.scrollWidth > cell.clientWidth).map((cell) => cell.textContent);
    }, heading);

  it('draws one line between each two columns, the Edit column pinned at the right included, and none after the last', async () => {
    await signInAs('admin');
    await openMachines();
    const lines = await linesOf();
    expectOneLineBetween(lines.headings);
    expectOneLineBetween(lines.cells);
    // The pinned column can't be dragged; every other one can.
    expect(await table().locator('[data-column-edge]').count()).toBe(lines.headings.length - 1);
    // A heading reads as itself: the line it holds is hidden from screen readers.
    expect(await table().getByRole('columnheader', { name: 'Id', exact: true }).count()).toBe(1);
  });

  it('makes a column narrower when the line at its edge is dragged, without sorting it, and keeps the width on the server', async () => {
    const before = await widthOf('Id');
    expect(before).toBeCloseTo(21 * Em, 0);
    await dragEdge('Id', -100);
    const after = await widthOf('Id');
    expect(Math.abs(after - (before - 100))).toBeLessThan(2);
    expect(await table().locator('thead th').first().getAttribute('aria-sort')).toBe('none');
    await expect.poll(() => keptFor('admin')).toMatchObject({ columnWidths: { Machines: { Id: expect.stringMatching(/em$/) } } });
    const kept = parseFloat((await keptFor('admin'))!.columnWidths.Machines!.Id!);
    expect(Math.abs(kept * Em - after)).toBeLessThan(1);
  });

  it('stops a column at 3em, however far it is dragged', async () => {
    await dragEdge('Code', -1000);
    expect(await widthOf('Code')).toBeCloseTo(3 * Em, 0);
    await expect.poll(async () => (await keptFor('admin'))?.columnWidths.Machines?.Code).toBe('3em');
  });

  it('fits a column to its heading and the longest of what it shows when its line is double-clicked', async () => {
    // A machine's name is longer than the word "Name", so it's the names that decide.
    await edgeOf('Name').dblclick();
    await expect.poll(async () => (await keptFor('admin'))?.columnWidths.Machines?.Name).toBeTruthy();
    expect(await cutUnder('Name')).toEqual([]);
    // Fitted, not merely wide: a few pixels narrower, and the longest is cut short.
    await dragEdge('Name', -4);
    expect((await cutUnder('Name')).length).toBeGreaterThan(0);
    await picture(window, 'column-widths');
  });

  it('gives a person their widths back the next time they sign in, and nobody else', async () => {
    const id = await widthOf('Id');
    const name = await widthOf('Name');
    await signOut();
    await signInAs('admin');
    await openMachines();
    expect(Math.abs((await widthOf('Id')) - id)).toBeLessThan(1);
    expect(Math.abs((await widthOf('Name')) - name)).toBeLessThan(1);

    await signOut();
    await signInAs('ben');
    await openMachines();
    expect(await widthOf('Id')).toBeCloseTo(21 * Em, 0);
    expect(await keptFor('ben')).toBeNull();
    // Without Edit buttons, the last column is a record's own, and has no line after it either.
    const lines = await linesOf();
    expectOneLineBetween(lines.headings);
    expectOneLineBetween(lines.cells);
  });
});
