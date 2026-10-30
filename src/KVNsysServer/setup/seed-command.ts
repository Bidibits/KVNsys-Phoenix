// `pnpm seed`: prepares this server's database so someone can sign in. Run it once on a
// new install, after `pnpm db:deploy`. Running it again is safe; it reports what it skipped.
import { Refusal } from '@kvnsys/core';
import { createPrismaClient, PrismaSetupStore } from '@kvnsys/postgres';
import { ScryptPasswordHasher } from '../identity/scrypt-password-hasher.js';
import { DefaultAdminUsername } from './first-shop.js';
import { InstallSeed } from './install-seed.js';
import { readPcIdentity } from './server-identity.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const db = createPrismaClient(databaseUrl);
try {
  const report = await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
    locationCode: process.env.KVNSYS_LOCATION_CODE?.trim() || 'HQ',
    locationName: process.env.KVNSYS_LOCATION_NAME?.trim() || 'Head Office',
    adminUsername: process.env.KVNSYS_ADMIN_USERNAME?.trim() || DefaultAdminUsername,
    adminPassword: process.env.KVNSYS_ADMIN_PASSWORD || undefined,
    server: readPcIdentity(),
  });
  for (const line of report.created) console.log(`  created    ${line}`);
  for (const line of report.unchanged) console.log(`  unchanged  ${line}`);
  console.log(report.created.length > 0 ? 'Seed finished.' : 'Nothing to do: this database was already seeded.');
} catch (error) {
  console.error(error instanceof Refusal ? `Seed refused: ${error.message}` : error);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
