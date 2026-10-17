import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { knownMigrations, migrationsFolder } from './check-database.js';

/**
 * Prisma's record of applied updates, created exactly the way Prisma creates it. A database that
 * KVNsys Server set up by itself then looks the same to Prisma's own tool, and the two can take
 * turns on it.
 */
const CreateUpdateRecord = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                    VARCHAR(36) PRIMARY KEY NOT NULL,
    "checksum"              VARCHAR(64) NOT NULL,
    "finished_at"           TIMESTAMPTZ,
    "migration_name"        VARCHAR(255) NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        TIMESTAMPTZ,
    "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
)`;

/** Is this database empty: no tables at all, KVNsys's or anyone else's? */
export async function isEmptyDatabase(databaseUrl: string): Promise<boolean> {
  return withConnection(databaseUrl, async (client) => {
    const { rows } = await client.query<{ tables: number }>(
      "SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
    );
    return rows[0]!.tables === 0;
  });
}

// PostgreSQL's own codes for the three answers that matter when making a database.
const NoSuchDatabase = '3D000';
const NotAllowed = '42501';
const AlreadyThere = '42P04';

/**
 * Creates the database named in this address if it doesn't exist yet, empty, by connecting to the
 * PostgreSQL server's own "postgres" database to do it. Returns the name it created, or null when
 * there was nothing to do. Any other trouble reaching the database, it leaves for checkDatabase to
 * explain.
 */
export async function createDatabaseIfMissing(databaseUrl: string): Promise<string | null> {
  try {
    await withConnection(databaseUrl, async () => {});
    return null;
  } catch (error) {
    if (sqlState(error) !== NoSuchDatabase) return null;
  }
  const address = new URL(databaseUrl);
  const name = decodeURIComponent(address.pathname.slice(1));
  if (!name) return null;
  address.pathname = '/postgres';
  try {
    await withConnection(address.toString(), (client) => client.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`));
  } catch (error) {
    // Someone else made it in the meantime: it's there now, which is all that was needed.
    if (sqlState(error) === AlreadyThere) return null;
    if (sqlState(error) === NotAllowed) {
      throw new Error(
        `There's no database called ${name}, and the PostgreSQL account in DATABASE_URL isn't allowed to create one.\n` +
          'Create it in pgAdmin, or use an account that may create databases.',
      );
    }
    throw new Error(`There's no database called ${name}, and creating it failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return name;
}

function sqlState(error: unknown): unknown {
  return (error as { code?: unknown }).code;
}

/**
 * Applies the schema updates this copy of KVNsys ships with that the database doesn't have yet,
 * oldest first, and records each one the way Prisma's own tool does, checksum and all. Returns the
 * names of the ones it applied.
 *
 * It all happens in one transaction: if any update fails, none of them is applied, and a database
 * that was empty is empty again, not half set up.
 */
export async function applyDatabaseUpdates(databaseUrl: string): Promise<string[]> {
  return withConnection(databaseUrl, async (client) => {
    const applied: string[] = [];
    await client.query('BEGIN');
    let current = '';
    try {
      await client.query(CreateUpdateRecord);
      const { rows } = await client.query<{ migration_name: string }>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
      );
      const done = new Set(rows.map((row) => row.migration_name));
      for (const name of knownMigrations().filter((n) => !done.has(n))) {
        current = name;
        const script = readFileSync(new URL(`${name}/migration.sql`, migrationsFolder()));
        // The whole file at once, as Prisma runs it. With no parameters, PostgreSQL takes it as
        // one simple query, which may hold many statements.
        await client.query(script.toString('utf8'));
        await client.query(
          'INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count) VALUES ($1, $2, now(), $3, 1)',
          [randomUUID(), createHash('sha256').update(script).digest('hex'), name],
        );
        applied.push(name);
      }
      await client.query('COMMIT');
      return applied;
    } catch (error) {
      await client.query('ROLLBACK');
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Setting up the database failed${current ? ` at update ${current}` : ''}, so nothing was changed: ${reason}`);
    }
  });
}

async function withConnection<T>(databaseUrl: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}
