import '../src/env.js';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient } from '@phoenix/database';
import { InstallSeedService, SetupModule, SharedModule } from '@phoenix/modules';
import { describe } from 'vitest';

export const testDatabaseUrl = process.env.PHOENIX_TEST_DATABASE_URL;

/**
 * Integration tests run only when PHOENIX_TEST_DATABASE_URL is set. Without it they are
 * reported as SKIPPED, by name, never as passed: a test that can't run isn't a test.
 */
export const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

export const AdminPassword = 'test-admin-password';

/**
 * Wipes the test database and rebuilds it from the migrations, then seeds it. Refuses any
 * database whose name doesn't end in _test, so a wrong setting can't wipe real data.
 */
export async function freshTestDatabase(): Promise<string> {
  const url = testDatabaseUrl!;
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(`Refusing to wipe "${name}": the test database's name must end in _test.`);
  }

  const db = createPrismaClient(url);
  await db.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await db.$executeRawUnsafe('CREATE SCHEMA public');
  await db.$disconnect();

  const databaseDir = fileURLToPath(new URL('../../../database/', import.meta.url));
  const prismaCli = createRequire(`${databaseDir}package.json`).resolve('prisma/build/index.js');
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: databaseDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  process.env.DATABASE_URL = url;
  process.env.PHOENIX_SESSION_SECRET ??= 'integration-test-secret-at-least-32-chars';

  // Applied as a function rather than `@Module(...)`: test files sit outside src/, where
  // the test runner doesn't enable decorator syntax.
  class SeedModule {}
  Module({ imports: [SharedModule, SetupModule] })(SeedModule);
  const context = await NestFactory.createApplicationContext(SeedModule, { logger: false });
  await context.get(InstallSeedService).seed({
    locationCode: 'HQ',
    locationName: 'Head Office',
    adminUsername: 'admin',
    adminPassword: AdminPassword,
    server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
  });
  await context.close();
  return url;
}
