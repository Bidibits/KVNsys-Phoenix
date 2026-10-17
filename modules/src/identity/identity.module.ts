import { Module } from '@nestjs/common';
import { PhoenixConfig } from '../shared/infrastructure/config.js';
import { PasswordHasher, SessionTokens, UserDirectory } from './application/ports.js';
import { SignInService } from './application/sign-in.service.js';
import { AuthController } from './http/auth.controller.js';
import { SessionGuard } from './http/session.guard.js';
import { HmacSessionTokens } from './infrastructure/hmac-session-tokens.js';
import { PrismaUserDirectory } from './infrastructure/prisma-user-directory.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.js';

@Module({
  controllers: [AuthController],
  providers: [
    SignInService,
    SessionGuard,
    { provide: UserDirectory, useClass: PrismaUserDirectory },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    {
      provide: SessionTokens,
      inject: [PhoenixConfig],
      useFactory: (config: PhoenixConfig) => new HmacSessionTokens(config.sessionSecret),
    },
  ],
  exports: [SessionGuard, SessionTokens, PasswordHasher],
})
export class IdentityModule {}
