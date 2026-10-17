import './env.js';
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { InstallSeedService, readServerIdentity, Refusal, SetupModule, SharedModule } from '@phoenix/modules';

/**
 * `pnpm seed`: prepares this server's database so someone can sign in. Run it once after
 * `pnpm db:deploy` on a new install. Running it again is safe and reports what it skipped.
 */
@Module({ imports: [SharedModule, SetupModule] })
class SeedModule {}

const context = await NestFactory.createApplicationContext(SeedModule, { logger: ['error'] });
try {
  const report = await context.get(InstallSeedService).seed({
    locationCode: process.env.PHOENIX_LOCATION_CODE?.trim() || 'HQ',
    locationName: process.env.PHOENIX_LOCATION_NAME?.trim() || 'Head Office',
    adminUsername: 'admin',
    adminPassword: process.env.PHOENIX_ADMIN_PASSWORD || undefined,
    server: readServerIdentity(),
  });
  for (const line of report.created) console.log(`  created    ${line}`);
  for (const line of report.unchanged) console.log(`  unchanged  ${line}`);
  console.log(report.created.length > 0 ? 'Seed finished.' : 'Nothing to do: this database was already seeded.');
} catch (error) {
  console.error(error instanceof Refusal ? `Seed refused: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  await context.close();
}
