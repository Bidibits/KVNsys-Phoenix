// KVNsysPostgres: the only project that talks to the database (the guard enforces it).
export { checkDatabase, knownMigrations, type DatabaseCheck, type DatabaseProblem } from './check-database.js';
export { applyDatabaseUpdates, createDatabaseIfMissing, isEmptyDatabase } from './database-updates.js';
export { createPrismaClient, type PrismaClient } from './connection.js';
export { PrismaUserDirectory } from './identity/prisma-user-directory.js';
export { PrismaSetupStore } from './setup/prisma-setup-store.js';
