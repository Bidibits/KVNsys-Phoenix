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
export type { SessionPass, SignedInUser } from '@kvnsys/wire';
export type { AccessName, Product, ProductDetails, ProductStatus } from '@kvnsys/core';
