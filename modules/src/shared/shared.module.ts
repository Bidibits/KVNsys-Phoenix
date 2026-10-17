import { Global, Module } from '@nestjs/common';
import { PhoenixConfig } from './infrastructure/config.js';
import { PrismaService } from './infrastructure/prisma.service.js';

@Global()
@Module({
  providers: [{ provide: PhoenixConfig, useFactory: () => PhoenixConfig.fromEnv() }, PrismaService],
  exports: [PhoenixConfig, PrismaService],
})
export class SharedModule {}
