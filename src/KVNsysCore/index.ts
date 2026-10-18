// KVNsysCore: the rules and records both sides share. Uses no framework, no database
// and no screens (the guard enforces it).
export { newId } from './shared/ids.js';
export type { Lineage } from './shared/lineage.js';
export { isCentavos, MaxCentavos, parsePesos, pesosText } from './shared/money.js';
export { Refusal, type RefusalKind } from './shared/refusal.js';

export { Accesses, AccessDescriptions, AllAccesses, type AccessName } from './identity/accesses.js';
export { AdminRoleCode, DefaultRoles, type RoleDefinition } from './identity/roles.js';
export { PasswordHasher, passwordProblem } from './identity/passwords.js';
export { displayName, maySignIn, UserDirectory, type UserForSignIn } from './identity/users.js';

export { serverMachineCode, type PcIdentity } from './locations/machines.js';

export {
  checkProduct,
  ProductCatalog,
  ProductLimits,
  ProductStatuses,
  type Product,
  type ProductDetails,
  type ProductStatus,
} from './catalog/products.js';

export { SetupStore, type SetupTransaction } from './setup/setup-store.js';
