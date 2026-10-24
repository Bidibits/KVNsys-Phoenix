// KVNsysCore: the rules and records both sides share. Uses no framework, no database
// and no screens (the guard enforces it).
export { newId } from './shared/ids.js';
export type { Lineage } from './shared/lineage.js';
export { displayPesos, isCentavos, MaxCentavos, parsePesos, pesosText } from './shared/money.js';
export { Refusal, type RefusalKind } from './shared/refusal.js';

export {
  Accesses,
  AccessDescriptions,
  AllAccesses,
  RightGroups,
  type AccessName,
  type RightChoice,
  type RightGroup,
} from './identity/accesses.js';
export { AdminRoleCode, DefaultRoles, isFixedRole, roleRights, type RoleDefinition } from './identity/roles.js';
export {
  blankRoleForm,
  checkRoleChange,
  checkRoleDetails,
  readRoleForm,
  rightsInWords,
  roleCodeFor,
  roleFormFor,
  RoleCatalog,
  RoleLimits,
  RoleStatuses,
  withNeededRights,
  type Role,
  type RoleDetails,
  type RoleForm,
  type RoleStatus,
} from './identity/role-catalog.js';
export { PasswordHasher, passwordProblem } from './identity/passwords.js';
export { displayName, maySignIn, UserDirectory, type UserForSignIn, type UserStanding } from './identity/users.js';
export {
  AccountLimits,
  AccountStatuses,
  accountDisplayName,
  blankUserForm,
  checkAccountDetails,
  normalizeUsername,
  readNewPassword,
  readUserForm,
  userFormFor,
  UserAccounts,
  type Account,
  type AccountDetails,
  type AccountStatus,
  type RoleChoice,
  type UserForm,
} from './identity/accounts.js';

export { serverMachineCode, type PcIdentity } from './locations/machines.js';
export { ShopDirectory, type Shop } from './locations/shops.js';

export {
  checkProduct,
  ProductCatalog,
  ProductLimits,
  ProductStatuses,
  type Product,
  type ProductDetails,
  type ProductStatus,
} from './catalog/products.js';
export {
  blankProductForm,
  productFormFor,
  readProductForm,
  readRetailPrice,
  type ProductForm,
} from './catalog/product-form.js';

export {
  checkStockChange,
  MovementTypes,
  rightToRecordByHand,
  StockLedger,
  StockLimits,
  type MovementType,
  type StockChange,
  type StockLevel,
  type StockMovement,
} from './inventory/stock-ledger.js';

export { SetupStore, type SetupTransaction } from './setup/setup-store.js';
