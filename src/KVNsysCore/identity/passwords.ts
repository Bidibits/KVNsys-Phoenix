/** What's wrong with a password a new account is being given, or null if nothing is. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'A password needs at least 8 characters.';
  return null;
}

/**
 * Turns a password into something safe to store, and checks one against it. The server
 * provides the real one; the rules only need to know it exists.
 */
export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, stored: string): Promise<boolean>;
}
