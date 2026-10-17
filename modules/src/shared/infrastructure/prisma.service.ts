import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@phoenix/database';
import { PhoenixConfig } from './config.js';

/** The server's one connection pool. Only infrastructure/ classes use it. */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly db: PrismaClient;

  constructor(@Inject(PhoenixConfig) config: PhoenixConfig) {
    this.db = createPrismaClient(config.databaseUrl);
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.$disconnect();
  }
}

/** True when a write broke a unique constraint (Prisma error P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}
