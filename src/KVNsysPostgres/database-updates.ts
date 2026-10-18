import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { newId } from '@kvnsys/core';
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

/** A right for a role, given only if the role exists and hasn't got it already. */
export interface RightToGrant {
  roleCode: string;
  access: string;
  description: string;
}

export interface DatabaseUpdateOptions {
  /** The updates this copy of KVNsys ships with. Tests pass fewer, to stand in for an older version. */
  migrations?: string[];
  /** The rights the updates just applied bring in, for roles that already exist. */
  rightsFor?: (applied: string[]) => RightToGrant[];
}

export interface DatabaseUpdateResult {
  /** The updates applied this time, oldest first. */
  applied: string[];
  /** The rights handed to existing roles this time. */
  granted: { roleCode: string; access: string }[];
}

/** The number Prisma's own tool locks with while it applies updates, so the two never run at once. */
const UpdateLock = 72707369;

/**
 * Applies the schema updates this copy of KVNsys ships with that the database doesn't have yet,
 * oldest first, and records each one the way Prisma's own tool does, checksum and all. Then it hands
 * existing roles the rights those updates brought in (see `rightsFor`).
 *
 * It all happens in one transaction: if anything fails, nothing is applied, and the database is as
 * it was, never half updated. Two servers starting at once take turns: the second waits, then finds
 * nothing left to do.
 */
export async function applyDatabaseUpdates(databaseUrl: string, options: DatabaseUpdateOptions = {}): Promise<DatabaseUpdateResult> {
  const expected = options.migrations ?? knownMigrations();
  return withConnection(databaseUrl, async (client) => {
    const applied: string[] = [];
    const granted: DatabaseUpdateResult['granted'] = [];
    await client.query('BEGIN');
    let current = '';
    try {
      await client.query('SELECT pg_advisory_xact_lock($1)', [UpdateLock]);
      await client.query(CreateUpdateRecord);
      const { rows } = await client.query<{ migration_name: string; finished: boolean; rolled_back: boolean }>(
        'SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS rolled_back FROM "_prisma_migrations"',
      );
      // Prisma's own tool can leave one of these behind. It needs a person to look at it first.
      const halfDone = rows.filter((row) => !row.finished && !row.rolled_back).map((row) => row.migration_name);
      if (halfDone.length > 0) {
        throw new Error(`an earlier update (${halfDone.join(', ')}) stopped halfway, and someone needs to look at it before more go on top`);
      }
      const done = new Set(rows.filter((row) => row.finished && !row.rolled_back).map((row) => row.migration_name));
      const unknown = [...done].filter((name) => !expected.includes(name));
      if (unknown.length > 0) {
        throw new Error(`the database has updates this KVNsys doesn't recognise (${unknown.join(', ')}); it may belong to a newer KVNsys Server`);
      }
      for (const name of expected.filter((n) => !done.has(n))) {
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
      current = '';
      for (const right of options.rightsFor?.(applied) ?? []) {
        const { rowCount } = await client.query(
          `INSERT INTO accesses (id, role_id, access, description)
           SELECT $1, id, $2, $3 FROM roles WHERE code = $4
           ON CONFLICT (role_id, access) DO NOTHING`,
          [newId(), right.access, right.description, right.roleCode],
        );
        if (rowCount) granted.push({ roleCode: right.roleCode, access: right.access });
      }
      await client.query('COMMIT');
      return { applied, granted };
    } catch (error) {
      await client.query('ROLLBACK');
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Updating the database failed${current ? ` at update ${current}` : ''}, so nothing was changed: ${reason}`);
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
