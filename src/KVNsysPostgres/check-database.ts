import { readdirSync } from 'node:fs';
import type { PrismaClient } from './generated/prisma/client.js';

export type DatabaseProblem = 'unreachable' | 'not-set-up' | 'out-of-date' | 'unrecognised';

export type DatabaseCheck = { ok: true } | { ok: false; problem: DatabaseProblem; detail: string };

/** Where this copy of KVNsys keeps the schema updates it ships with. */
export function migrationsFolder(): URL {
  return new URL('../prisma/migrations/', import.meta.url);
}

/** The schema updates this copy of KVNsys ships with: one folder each in prisma/migrations. */
export function knownMigrations(): string[] {
  return readdirSync(migrationsFolder(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Is this KVNsys's database, with exactly the schema updates this server expects? It's not
 * enough to find a "users" table: another program's database can have one of those too, and the
 * first version of this check was fooled by exactly that. Prisma records every update it applies,
 * so the check compares that record with the updates this server ships with.
 */
export async function checkDatabase(db: PrismaClient, expected: string[] = knownMigrations()): Promise<DatabaseCheck> {
  let applied: string[];
  try {
    const rows = await db.$queryRaw<{ migration_name: string }[]>`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    applied = rows.map((row) => row.migration_name);
  } catch (error) {
    const reason = describeFailure(error);
    const noRecord = /_prisma_migrations/.test(reason) && /does not exist/i.test(reason);
    return { ok: false, problem: noRecord ? 'not-set-up' : 'unreachable', detail: reason };
  }

  const unknown = applied.filter((name) => !expected.includes(name));
  if (unknown.length > 0) return { ok: false, problem: 'unrecognised', detail: unknown.join(', ') };
  const missing = expected.filter((name) => !applied.includes(name));
  if (missing.length > 0) return { ok: false, problem: 'out-of-date', detail: missing.join(', ') };
  return { ok: true };
}

/** Network failures arrive as a bare code; these say what they mean. */
const networkReasons: Record<string, string> = {
  ECONNREFUSED: 'nothing is answering at that address and port',
  ENOTFOUND: "the computer named in the address wasn't found",
  ETIMEDOUT: 'the computer at that address never answered',
};

/**
 * The real reason a query failed. Prisma's own message is mostly a header; PostgreSQL's words
 * ("password authentication failed…") sit deeper inside the error, and a network failure is
 * only a code.
 */
function describeFailure(error: unknown): string {
  const e = error as {
    code?: unknown;
    message?: unknown;
    meta?: { driverAdapterError?: { cause?: { originalMessage?: unknown } } };
  };
  const fromPostgres = e.meta?.driverAdapterError?.cause?.originalMessage;
  if (typeof fromPostgres === 'string') return fromPostgres;
  if (typeof e.code === 'string' && networkReasons[e.code]) return networkReasons[e.code]!;
  const text = typeof e.message === 'string' ? e.message.trim() : String(error);
  // Prisma sometimes wraps the reason as: Raw query failed. Code: `N/A`. Message: `<reason>`
  const wrapped = /Message: `([^`]+)`/.exec(text)?.[1];
  if (wrapped) return wrapped;
  return text.split('\n').pop()?.trim() || (typeof e.code === 'string' ? e.code : 'unknown error');
}
