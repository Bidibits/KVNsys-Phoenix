import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '@kvnsys/postgres';
import { describe } from 'vitest';

const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const serverUrl = process.env.KVNSYS_TEST_POSTGRES_URL;

/**
 * Database tests run only when KVNSYS_TEST_POSTGRES_URL is set. Without it they show as
 * SKIPPED, by name, never as passed: a test that can't run isn't a test.
 */
export const describeWithDatabase = serverUrl ? describe : describe.skip;

/**
 * A brand-new database with every migration applied (or none, with `migrate: false`), made for
 * one test and dropped after it. Tests never touch an existing database, so they can't damage one.
 */
export async function createThrowawayDatabase(
  options: { migrate?: boolean } = {},
): Promise<{ url: string; drop: () => Promise<void> }> {
  const name = `kvnsys_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = createPrismaClient(serverUrl!);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();

  const url = new URL(serverUrl!);
  url.pathname = `/${name}`;

  if (options.migrate !== false) {
    const postgresDir = fileURLToPath(new URL('../../src/KVNsysPostgres/', import.meta.url));
    const prismaCli = createRequire(`${postgresDir}package.json`).resolve('prisma/build/index.js');
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
      cwd: postgresDir,
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: 'pipe',
    });
  }

  return {
    url: url.toString(),
    drop: async () => {
      const cleanup = createPrismaClient(serverUrl!);
      await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await cleanup.$disconnect();
    },
  };
}
