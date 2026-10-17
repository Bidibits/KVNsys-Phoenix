import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient } from '@kvnsys/postgres';
import { ServerModule } from './server.module.js';

export interface ServerOptions {
  logger?: false;
  /** The database the server owns. Without one, it still says hello but can't sign anyone in. */
  databaseUrl?: string;
}

/** Builds the server exactly as `pnpm start:server` runs it, so tests exercise the real thing. */
export async function createServer(options: ServerOptions = {}): Promise<INestApplication> {
  const client = options.databaseUrl ? createPrismaClient(options.databaseUrl) : null;
  const app = await NestFactory.create(
    ServerModule.withDatabase(client),
    options.logger === false ? { logger: false } : {},
  );
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
