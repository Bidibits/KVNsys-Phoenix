import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createPrismaClient } from '@kvnsys/postgres';
import type { ServerCertificate } from '../security/server-certificate.js';
import { ServerModule } from './server.module.js';

export interface ServerOptions {
  /** The server's identity. It speaks only HTTPS: nothing, not even hello, goes in plain text. */
  certificate: Pick<ServerCertificate, 'key' | 'cert'>;
  /** The database the server owns. Without one, it still says hello but can't sign anyone in. */
  databaseUrl?: string;
  logger?: false;
}

/** Builds the server exactly as `pnpm start:server` runs it, so tests exercise the real thing. */
export async function createServer(options: ServerOptions): Promise<INestApplication> {
  const client = options.databaseUrl ? createPrismaClient(options.databaseUrl) : null;
  const app = await NestFactory.create(ServerModule.withDatabase(client), {
    httpsOptions: { key: options.certificate.key, cert: options.certificate.cert },
    ...(options.logger === false ? { logger: false } : {}),
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
