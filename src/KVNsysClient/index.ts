// KVNsysClient: the client engine. Connection, sign-in, the cart. No screens.
// It speaks to the server over pinned HTTPS, so it runs in Node (the app's desktop side), not in a page.
export {
  connectToServer,
  mismatchMessage,
  type ConnectedServer,
  type ConnectProblem,
  type ConnectResult,
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
export { signIn, type SignInProblem, type SignInResult } from './identity/sign-in.js';
export { checkSession, signOut, type SessionCheck, type SessionProblem, type SignOutResult } from './identity/session.js';
export {
  addProduct,
  changeProduct,
  findProduct,
  getProduct,
  listProducts,
  type ProductCallOptions,
  type ProductListResult,
  type ProductResult,
  type ProductsProblem,
} from './catalog/products.js';
export { loadProductForm, saveProductForm, type ProductFormResult } from './catalog/product-form.js';
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
  priceCart,
  recordSale,
  type PaidReceipt,
  type PriceResult,
  type SaleForm,
  type SaleProductResult,
  type SaleResult,
} from './selling/sales.js';
export { Till, type TillResult, type TillView } from './selling/till.js';
export type { CallOptions, CallProblem } from './connection/server-call.js';
export type { SessionPass, SignedInUser } from '@kvnsys/wire';
export type {
  AccessName,
  Account,
  AccountStatus,
  CartLine,
  CountForm,
  DiscountKind,
  PricedLine,
  PricedSale,
  SaleProduct,
  StatutoryDiscount,
  DeliveryLineForm,
  HandMovement,
  MovementType,
  Product,
  ProductDetails,
  ProductForm,
  ProductStatus,
  Role,
  RoleChoice,
  RoleForm,
  RoleStatus,
  UserForm,
} from '@kvnsys/core';
