// KVNsysPostgres: the only project that talks to the database (the guard enforces it).
export { checkDatabase, knownMigrations, type DatabaseCheck, type DatabaseProblem } from './check-database.js';
export { applyDatabaseUpdates, createDatabaseIfMissing, isEmptyDatabase } from './database-updates.js';
export { createPrismaClient, type PrismaClient } from './connection.js';
export { PrismaProductCatalog } from './catalog/prisma-product-catalog.js';
export { PrismaStockLedger } from './inventory/prisma-stock-ledger.js';
export { PrismaShopDirectory } from './locations/prisma-shop-directory.js';
export { PrismaRegisterBook } from './locations/prisma-register-book.js';
export { PrismaSalesJournal } from './selling/prisma-sales-journal.js';
export { PrismaShiftBook } from './selling/prisma-shift-book.js';
export { PrismaRoleCatalog } from './identity/prisma-role-catalog.js';
export { PrismaUserAccounts } from './identity/prisma-user-accounts.js';
export { PrismaUserDirectory } from './identity/prisma-user-directory.js';
export { PrismaSetupStore } from './setup/prisma-setup-store.js';
