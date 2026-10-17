import { Module } from '@nestjs/common';
import { PasswordHasher } from '../identity/application/ports.js';
import { ScryptPasswordHasher } from '../identity/infrastructure/scrypt-password-hasher.js';
import { InstallSeedService, SetupStore } from './application/install-seed.service.js';
import { PrismaSetupStore } from './infrastructure/prisma-setup-store.js';

/**
 * Used by `pnpm seed`, not by the running server. It provides its own password hasher
 * instead of importing IdentityModule, so seeding doesn't need the session secret.
 */
@Module({
  providers: [
    InstallSeedService,
    { provide: SetupStore, useClass: PrismaSetupStore },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
  ],
  exports: [InstallSeedService],
})
export class SetupModule {}
