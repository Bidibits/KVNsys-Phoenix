import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServerModule } from './server.module.js';

/** Builds the server exactly as `pnpm start:server` runs it, so tests exercise the real thing. */
export async function createServer(options: { logger?: false } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(ServerModule, options.logger === false ? { logger: false } : {});
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
