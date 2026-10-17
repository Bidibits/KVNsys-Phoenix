/** A signed-in person, as the server remembers them between requests. */
export interface Session {
  userId: string;
  username: string;
  displayName: string;
  roleCode: string;
  accesses: string[];
  /** Milliseconds since the epoch. */
  expiresAt: number;
}

/** Long enough for a full day's shift; short enough that a forgotten sign-in doesn't last. */
export const SessionLengthMs = 12 * 60 * 60 * 1000;

export function displayName(first: string, middle: string | null, last: string): string {
  return [first, middle, last].filter((part) => part && part.trim().length > 0).join(' ');
}

/** A password a new account may be given. Kept simple: long enough to resist guessing. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'A password needs at least 8 characters.';
  return null;
}
