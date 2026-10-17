// Names for the things the server's parts are handed, so NestJS can pass them around.

/** The database connection, or null when the server was started without one (tests do that). */
export const DatabaseClient = Symbol('DatabaseClient');

/** The sign-in check, or null when there's no database to check against. */
export const SignInOperation = Symbol('SignInOperation');
