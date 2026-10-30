// KVNsysClient: the client engine. Connection, sign-in, the cart. No screens.
// It speaks to the server over pinned HTTPS, so it runs in Node (the app's desktop side), not in a page.
export {
  connectToServer,
  joinServer,
  mismatchMessage,
  type ConnectedServer,
  type ConnectProblem,
  type ConnectResult,
  type JoinProblem,
  type JoinResult,
  type ServerTrust,
} from './connection/connect.js';
export { describeTransportFailure, type TransportProblem } from './connection/failures.js';
export {
  requestJson,
  SecureRequestError,
  type SecureFailure,
  type SecureResponse,
  type ServerPin,
} from './connection/secure-request.js';
export { normalizeServerAddress } from './connection/server-address.js';
export { readThisPc } from './connection/this-pc.js';
export { signIn, type SignInProblem, type SignInResult } from './identity/sign-in.js';
export { checkSession, signOut, type SessionCheck, type SessionProblem, type SignOutResult } from './identity/session.js';
export {
  addProduct,
  changeProduct,
  findProduct,
  getProduct,
  getProductPicture,
  listProducts,
  type ProductCallOptions,
  type ProductListResult,
  type ProductPictureResult,
  type ProductResult,
  type ProductsProblem,
} from './catalog/products.js';
export { listProductRows, type ProductRow, type ProductRowsResult } from './catalog/product-list.js';
export {
  loadProductForm,
  saveProductForm,
  type ProductChoice,
  type ProductChoices,
  type ProductFormResult,
} from './catalog/product-form.js';
export {
  listCatalog,
  loadCatalogEntryForm,
  saveCatalogEntryForm,
  type CatalogEntryFormResult,
  type CatalogEntryResult,
  type CatalogListResult,
} from './catalog/catalog-lists.js';
/** The four list names, for the desktop side to check what the screens ask for. */
export { CatalogLists } from '@kvnsys/core';
/** How big a product's picture may be, for the desktop side to shrink one to. */
export { ProductPictureLimit } from '@kvnsys/core';
export {
  findStockItem,
  getProductStock,
  listStock,
  recordStock,
  saveCount,
  saveDelivery,
  type ProductStockResult,
  type RecordedMovement,
  type RecordStockResult,
  type Shop,
  type StockItem,
  type StockItemResult,
  type StockListResult,
} from './inventory/stock.js';
export {
  listUsers,
  loadUserForm,
  resetPassword,
  saveUserForm,
  type PasswordResult,
  type UserFormResult,
  type UserListResult,
  type UserResult,
} from './identity/users.js';
export { changeRegister, listRegisters, type ListedRegister, type RegisterListResult, type RegisterResult, type SentRegister } from './identity/registers.js';
export { listAudits, type AuditFilterForm, type AuditLine, type AuditListResult } from './audits/audit-log.js';
export {
  listRoles,
  loadRoleForm,
  saveRoleForm,
  type ListedRole,
  type RightBox,
  type RightBoxGroup,
  type RoleFormResult,
  type RoleListResult,
  type RoleResult,
} from './identity/roles.js';
export {
  findSaleProduct,
  getReceipt,
  listDaySales,
  priceCart,
  recordSale,
  type DaySalesResult,
  type PaidReceipt,
  type ReceiptLine,
  type PriceResult,
  type SaleForm,
  type SaleProductResult,
  type SaleResult,
} from './selling/sales.js';
export { Till, type TillResult, type TillView } from './selling/till.js';
export { closeShift, currentShift, openShift, type CurrentShiftResult, type ShiftResult, type ShiftView } from './selling/shifts.js';
export type { CallOptions, CallProblem } from './connection/server-call.js';
export type { SessionPass, SignedInUser } from '@kvnsys/wire';
export type {
  AccessName,
  Account,
  AccountStatus,
  CatalogEntry,
  CatalogEntryForm,
  CatalogEntryStatus,
  CatalogList,
  CatalogListShape,
  CartLine,
  CountForm,
  DiscountKind,
  PriceBasis,
  PricedLine,
  PricedSale,
  RecordHistory,
  RegisterStatus,
  SaleProduct,
  StatutoryDiscount,
  DeliveryLineForm,
  HandMovement,
  Listed,
  MovementType,
  Product,
  ProductDetails,
  ProductForm,
  ProductSortingField,
  ProductStatus,
  Role,
  RoleChoice,
  RoleForm,
  RoleStatus,
  UserForm,
} from '@kvnsys/core';
