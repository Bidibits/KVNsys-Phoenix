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

/** The stock ledger, the catalog, the server's location and the rights check, or null when there's no database. */
export const InventoryOperation = Symbol('InventoryOperation');

/** The record of sales, the catalog, the server's location and the rights check, or null when there's no database. */
export const SalesOperation = Symbol('SalesOperation');

/** The machines, the server's location, the rights check and the sessions, or null when there's no database. */
export const MachinesOperation = Symbol('MachinesOperation');

/** The shifts, the server's location, the accounts and the rights check, or null when there's no database. */
export const ShiftsOperation = Symbol('ShiftsOperation');

/** The catalogue's four lists and the rights check, or null when there's no database. */
export const CatalogOperation = Symbol('CatalogOperation');

/** The audit log and the rights check, or null when there's no database. */
export const AuditsOperation = Symbol('AuditsOperation');

/** Each person's own settings and the pass check, or null when there's no database. */
export const MySettingsOperation = Symbol('MySettingsOperation');
