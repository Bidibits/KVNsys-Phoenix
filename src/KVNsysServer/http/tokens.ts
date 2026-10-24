// Names for the things the server's parts are handed, so NestJS can pass them around.

/** The database connection, or null when the server was started without one (tests do that). */
export const DatabaseClient = Symbol('DatabaseClient');

/** The sign-in check, or null when there's no database to check against. */
export const SignInOperation = Symbol('SignInOperation');

/** The product catalog and the rights check in front of it, or null when there's no database. */
export const ProductsOperation = Symbol('ProductsOperation');

/** The accounts, the rights check, the password hasher and the sessions, or null when there's no database. */
export const UsersOperation = Symbol('UsersOperation');

/** The roles, the rights check and the sessions, or null when there's no database. */
export const RolesOperation = Symbol('RolesOperation');

/** The stock ledger, the catalog, the server's shop and the rights check, or null when there's no database. */
export const StockOperation = Symbol('StockOperation');

/** The record of sales, the catalog, the server's shop and the rights check, or null when there's no database. */
export const SalesOperation = Symbol('SalesOperation');

/** The registers, the server's shop, the rights check and the sessions, or null when there's no database. */
export const RegistersOperation = Symbol('RegistersOperation');
