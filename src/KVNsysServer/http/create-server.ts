import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { PcIdentity } from '@kvnsys/core';
import { createPrismaClient } from '@kvnsys/postgres';
import { ScryptPasswordHasher } from '../identity/scrypt-password-hasher.js';
import type { ServerCertificate } from '../security/server-certificate.js';
import { ServerPassword } from '../security/server-password.js';
import { readPcIdentity } from '../setup/server-identity.js';
import { ServerModule } from './server.module.js';

export interface ServerOptions {
  /** The server's identity. It speaks only HTTPS: nothing, not even hello, goes in plain text. */
  certificate: Pick<ServerCertificate, 'key' | 'cert'>;
  /** The database the server owns. Without one, it still says hello but can't sign anyone in. */
  databaseUrl?: string;
  /** The PC it runs on, which says which shop it serves. Read from this PC unless given. */
  server?: PcIdentity;
  /**
   * The server's own folder, where the server password is kept between runs. Without one (tests),
   * the server password lives in memory and starts off.
   */
  dataDir?: string;
  logger?: false;
}

/** Builds the server exactly as `pnpm start:server` runs it, so tests exercise the real thing. */
export async function createServer(options: ServerOptions): Promise<INestApplication> {
  const client = options.databaseUrl ? createPrismaClient(options.databaseUrl) : null;
  const serverPassword = new ServerPassword(options.dataDir ?? null, new ScryptPasswordHasher());
  const app = await NestFactory.create<NestExpressApplication>(
    ServerModule.withDatabase(client, options.server ?? readPcIdentity(), serverPassword),
    {
      httpsOptions: { key: options.certificate.key, cert: options.certificate.cert },
      ...(options.logger === false ? { logger: false } : {}),
    },
  );
  // A product's picture comes inside its details: up to 256 KB, about 350 KB as text. Express's
  // own limit is 100 KB.
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
