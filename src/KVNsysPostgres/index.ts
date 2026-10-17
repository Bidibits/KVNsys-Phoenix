// KVNsysPostgres: the only project that talks to the database (the guard enforces it).
export { createPrismaClient, type PrismaClient } from './connection.js';
export { PrismaSetupStore } from './setup/prisma-setup-store.js';
