// What apps/ composes. Each area is a NestJS module; the rest is exported for the
// composition root (main.ts, seed.ts) and for tests.
export { SharedModule } from './shared/shared.module.js';
export { RefusalFilter } from './shared/http/refusal.filter.js';
export { PhoenixConfig } from './shared/infrastructure/config.js';
export { PrismaService } from './shared/infrastructure/prisma.service.js';
export { Refusal } from './shared/domain/refusal.js';
export { newId } from './shared/domain/ids.js';

export { IdentityModule } from './identity/identity.module.js';
export { Accesses, AllAccesses } from './identity/domain/accesses.js';
export { ScryptPasswordHasher } from './identity/infrastructure/scrypt-password-hasher.js';
export { HmacSessionTokens } from './identity/infrastructure/hmac-session-tokens.js';
export { WrongCredentials } from './identity/application/sign-in.service.js';

export { LocationsModule } from './locations/locations.module.js';
export { Sha256DeviceTokens } from './locations/infrastructure/sha256-device-tokens.js';

export { SetupModule } from './setup/setup.module.js';
export { InstallSeedService, type SeedInput, type SeedReport } from './setup/application/install-seed.service.js';
export { readServerIdentity } from './setup/infrastructure/server-identity.js';
