import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export type { PrismaClient } from './generated/prisma/client.js';

/** The one way the rest of KVNsys gets a database connection. */
export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
