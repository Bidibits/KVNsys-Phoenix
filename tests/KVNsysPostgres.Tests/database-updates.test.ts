import { applyDatabaseUpdates, checkDatabase, createPrismaClient, isEmptyDatabase, knownMigrations } from '@kvnsys/postgres';
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
