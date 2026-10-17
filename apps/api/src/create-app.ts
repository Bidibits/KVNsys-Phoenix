import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

/** Builds the server exactly as main.ts runs it, so tests exercise the real thing. */
export async function createPhoenixApp(options: { logger?: false } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: options.logger });
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  return app;
}
