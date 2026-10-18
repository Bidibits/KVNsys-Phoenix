import {
  applyDatabaseUpdates,
  checkDatabase,
  createDatabaseIfMissing,
  createPrismaClient,
  isEmptyDatabase,
  knownMigrations,
} from '@kvnsys/postgres';
import { expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

/** Runs some SQL against a database and hands back the rows. */
async function query<T>(url: string, sql: string): Promise<T[]> {
  const db = createPrismaClient(url);
  try {
    return await db.$queryRawUnsafe<T[]>(sql);
  } finally {
    await db.$disconnect();
  }
}

/** Runs a statement that returns nothing, such as making or dropping a database or an account. */
async function execute(url: string, sql: string): Promise<void> {
  const db = createPrismaClient(url);
  try {
    await db.$executeRawUnsafe(sql);
  } finally {
    await db.$disconnect();
  }
}

/** Everything about a database's shape: every column, index, constraint and enum. */
async function shapeOf(url: string) {
  return {
    columns: await query(
      url,
      `SELECT table_name, column_name, data_type, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, column_name`,
    ),
    indexes: await query(url, "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname"),
    constraints: await query(
      url,
      "SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname",
    ),
    enums: await query(
      url,
      'SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid ORDER BY t.typname, e.enumsortorder',
    ),
  };
}

/** What the record of applied updates says, minus the ids and times that differ every run. */
const updateRecord = (url: string) =>
  query(url, 'SELECT migration_name, checksum, applied_steps_count, logs, rolled_back_at FROM _prisma_migrations ORDER BY migration_name');

describeWithDatabase("setting up an empty database without Prisma's tool", () => {
  it("builds exactly the database Prisma's own tool builds, and records it the same way", async () => {
    const theirs = await createThrowawayDatabase();
    const ours = await createThrowawayDatabase({ migrate: false });
    try {
      expect(await applyDatabaseUpdates(ours.url)).toEqual(knownMigrations());
      expect(await shapeOf(ours.url)).toEqual(await shapeOf(theirs.url));
      expect(await updateRecord(ours.url)).toEqual(await updateRecord(theirs.url));
      const db = createPrismaClient(ours.url);
      try {
        expect(await checkDatabase(db)).toEqual({ ok: true });
      } finally {
        await db.$disconnect();
      }
    } finally {
      await theirs.drop();
      await ours.drop();
    }
  }, 120_000);

  it('applies nothing a second time', async () => {
    const database = await createThrowawayDatabase({ migrate: false });
    try {
      await applyDatabaseUpdates(database.url);
      expect(await applyDatabaseUpdates(database.url)).toEqual([]);
    } finally {
      await database.drop();
    }
  }, 120_000);

  it('tells an empty database from one with anything in it', async () => {
    const database = await createThrowawayDatabase({ migrate: false });
    try {
      expect(await isEmptyDatabase(database.url)).toBe(true);
      await query(database.url, 'CREATE TABLE notes (id serial PRIMARY KEY)');
      expect(await isEmptyDatabase(database.url)).toBe(false);
    } finally {
      await database.drop();
    }
  }, 120_000);

  it('changes nothing at all when an update fails', async () => {
    const database = await createThrowawayDatabase({ migrate: false });
    try {
      // Another program's table with a name KVNsys uses, so the first update can't create its own.
      await query(database.url, 'CREATE TABLE locations (note text)');
      await expect(applyDatabaseUpdates(database.url)).rejects.toThrow(/nothing was changed/);
      expect(await query(database.url, "SELECT to_regclass('_prisma_migrations')::text AS record")).toEqual([{ record: null }]);
      expect(await query(database.url, "SELECT column_name FROM information_schema.columns WHERE table_name = 'locations'")).toEqual([
        { column_name: 'note' },
      ]);
    } finally {
      await database.drop();
    }
  }, 120_000);
});

describeWithDatabase('creating a database that is not there yet', () => {
  const serverUrl = process.env.KVNSYS_TEST_POSTGRES_URL!;
  /** The test server's address, naming another database, and optionally signing in as another account. */
  function addressOf(database: string, account?: { name: string; password: string }): string {
    const url = new URL(serverUrl);
    url.pathname = `/${database}`;
    if (account) {
      url.username = account.name;
      url.password = account.password;
    }
    return url.toString();
  }

  it('creates it, empty, and does nothing the second time', async () => {
    const name = `kvnsys_test_created_${Date.now()}`;
    try {
      expect(await createDatabaseIfMissing(addressOf(name))).toBe(name);
      expect(await isEmptyDatabase(addressOf(name))).toBe(true);
      expect(await createDatabaseIfMissing(addressOf(name))).toBeNull();
    } finally {
      await execute(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    }
  }, 60_000);

  it('leaves a database that already exists alone', async () => {
    const database = await createThrowawayDatabase({ migrate: false });
    try {
      await query(database.url, 'CREATE TABLE notes (id serial PRIMARY KEY)');
      expect(await createDatabaseIfMissing(database.url)).toBeNull();
      expect(await isEmptyDatabase(database.url)).toBe(false);
    } finally {
      await database.drop();
    }
  }, 60_000);

  it("says so plainly when the account isn't allowed to create databases", async () => {
    const account = { name: `kvnsys_test_cannot_create_${Date.now()}`, password: 'not-allowed-to-create' };
    const name = `kvnsys_test_never_made_${Date.now()}`;
    await execute(serverUrl, `CREATE ROLE "${account.name}" LOGIN PASSWORD '${account.password}' NOCREATEDB`);
    try {
      await expect(createDatabaseIfMissing(addressOf(name, account))).rejects.toThrow(/isn't allowed to create one/);
    } finally {
      await execute(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await execute(serverUrl, `DROP ROLE IF EXISTS "${account.name}"`);
    }
  }, 60_000);
});

it('leaves a database server it cannot reach for the usual check to explain', async () => {
  expect(await createDatabaseIfMissing('postgresql://nobody:nothing@127.0.0.1:1/kvnsys')).toBeNull();
});
