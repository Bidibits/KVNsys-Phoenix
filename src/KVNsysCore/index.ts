// KVNsysCore: the rules and records both sides share. Uses no framework, no database
// and no screens (the guard enforces it).
export { newId } from './shared/ids.js';
export type { Lineage } from './shared/lineage.js';
export { displayPesos, isCentavos, MaxCentavos, parsePesos, pesosText } from './shared/money.js';
export { Refusal, type RefusalKind } from './shared/refusal.js';
export {
  ChangeSources,
  changesOnCreate,
  changesOnUpdate,
  ChangeTypes,
  HiddenColumns,
  HiddenValue,
  rightsText,
  type AuditChange,
  type AuditValues,
  type ChangeSource,
  type ChangeType,
} from './shared/audit-trail.js';
export {
  AuditedTableNames,
  AuditedTables,
  AuditLimit,
  AuditLogBook,
  AuditReferences,
  ByKVNsys,
  checkAuditFilter,
  columnLabel,
  shownValue,
  tableLabel,
  type AuditedTable,
  type AuditEntry,
  type AuditFilter,
  type AuditPage,
  type AuditPerson,
} from './audits/audit-log-book.js';

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
  usernameProblem,
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
  checkRegisterDetails,
  newRegisterName,
  RegisterBook,
  registerCode,
  RegisterLimits,
  RegisterStatuses,
  type Register,
  type RegisterDetails,
  type RegisterStatus,
} from './locations/registers.js';

export {
  checkProduct,
  checkProductPicture,
  chosenEntryGone,
  ProductCatalog,
  ProductDefaults,
  ProductLimits,
  ProductPictureLimit,
  ProductSortingFields,
  ProductStatuses,
  type FullProductDetails,
  type Product,
  type ProductDetails,
  type ProductSortingField,
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
  blankCatalogEntryForm,
  CatalogBook,
  catalogEntryFormFor,
  CatalogEntryLimits,
  CatalogEntryStatuses,
  categoryPaths,
  CatalogLists,
  CatalogListShapes,
  checkCatalogEntry,
  readCatalogEntryForm,
  type CatalogEntry,
  type CatalogEntryDetails,
  type CatalogEntryForm,
  type CatalogEntryStatus,
  type CatalogList,
  type CatalogListShape,
} from './catalog/catalog-lists.js';

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
export {
  readCount,
  readDelivery,
  readPieces,
  type CountForm,
  type DeliveryLineForm,
  type HandMovement,
} from './inventory/stock-forms.js';

export {
  checkDiscount,
  DiscountKinds,
  DiscountNames,
  PaymentTypes,
  bestPrice,
  PriceBases,
  priceSale,
  readCash,
  SaleLimits,
  SalesJournal,
  StatutoryDiscountPercent,
  takeCash,
  type CartLine,
  type CashPayment,
  type DiscountKind,
  type PaymentType,
  type PriceBasis,
  type PricedLine,
  type PricedSale,
  type Receipt,
  type SaleProduct,
  type StatutoryDiscount,
} from './selling/sales.js';

export { dayTotals, shopDate, shopDay, ShopTimeZone, type DayTotals, type ReceiptSummary } from './selling/days.js';
export {
  checkShiftNote,
  NoShiftYet,
  ShiftBook,
  ShiftLimits,
  ShiftStatuses,
  variance,
  varianceInWords,
  type Shift,
  type ShiftStatus,
} from './selling/shifts.js';

export { SetupStore, type SetupTransaction } from './setup/setup-store.js';
