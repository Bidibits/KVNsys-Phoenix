// KVNsysPostgres: the only project that talks to the database (the guard enforces it).
export { checkDatabase, knownMigrations, type DatabaseCheck, type DatabaseProblem } from './check-database.js';
export {
  applyDatabaseUpdates,
  createDatabaseIfMissing,
  isEmptyDatabase,
  type DatabaseUpdateOptions,
  type DatabaseUpdateResult,
  type RightToGrant,
} from './database-updates.js';
export { createPrismaClient, type PrismaClient } from './connection.js';
export { PrismaProductCatalog } from './catalog/prisma-product-catalog.js';
export { PrismaUserDirectory } from './identity/prisma-user-directory.js';
export { PrismaSetupStore } from './setup/prisma-setup-store.js';
