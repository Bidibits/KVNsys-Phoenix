import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyDatabaseUpdates, createPrismaClient, knownMigrations, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const startScript = fileURLToPath(new URL('../../src/KVNsysServer/dist/start.js', import.meta.url));

/**
 * Runs the real server's start-up as the server's setup file does (`--set-up`), against the given
 * database, with a throwaway settings folder so it never touches this PC's real one.
 */
function runSetUp(databaseUrl: string, dataDir: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [startScript, '--set-up'],
      { env: { ...process.env, DATABASE_URL: databaseUrl, KVNSYS_SERVER_DATA: dataDir }, timeout: 60_000 },
      (error, stdout, stderr) => resolve({ code: error ? Number(error.code ?? 1) : 0, output: `${stdout}${stderr}` }),
    );
  });
}

describeWithDatabase('a server starting on a database from an older KVNsys', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let dataDir: string;
  const [first, ...later] = knownMigrations();

  const rightsOf = async (roleCode: string) =>
    (await db.access.findMany({ where: { role: { code: roleCode } }, select: { access: true } })).map((a) => a.access).sort();

  beforeAll(async () => {
    // As the first version of KVNsys left a shop: only its first update, and roles with only the
    // rights it knew.
    database = await createThrowawayDatabase({ migrate: false });
    await applyDatabaseUpdates(database.url, { migrations: [first!] });
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: 'test-admin-password',
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    await db.access.deleteMany({ where: { access: { startsWith: 'products.' } } });
    dataDir = mkdtempSync(join(tmpdir(), 'kvnsys-upgrade-test-'));
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    await database?.drop();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  it('brings it up to date by itself, and gives the default roles the rights the updates brought in', async () => {
    const { code, output } = await runSetUp(database.url, dataDir);
    expect(code, output).toBe(0);
    expect(output).toContain('so KVNsys Server is bringing it up to date');
    expect(output).toContain(`Applied ${later.length} database update`);
    expect(output).toContain('Role CASHIER now has the right products.view');
    expect(output).toContain('KVNsys Server is set up.');
    expect((await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM _prisma_migrations ORDER BY migration_name`).map((r) => r.migration_name)).toEqual(
      knownMigrations(),
    );
    expect(await rightsOf('CASHIER')).toEqual(['products.view']);
    expect(await rightsOf('MANAGER')).toEqual(expect.arrayContaining(['products.manage', 'products.view']));
    expect(await rightsOf('ADMIN')).toEqual(expect.arrayContaining(['products.manage', 'products.view']));
  }, 90_000);

  it('never hands back a right a manager took away later, because an update is applied only once', async () => {
    await db.access.deleteMany({ where: { role: { code: 'CASHIER' }, access: 'products.view' } });
    const { code, output } = await runSetUp(database.url, dataDir);
    expect(code, output).toBe(0);
    expect(output).not.toContain('bringing it up to date');
    expect(await rightsOf('CASHIER')).toEqual([]);
  }, 90_000);
});
