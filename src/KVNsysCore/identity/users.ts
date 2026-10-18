/** What sign-in needs to know about a user. Carries the password hash only so it can be checked. */
export interface UserForSignIn {
  id: string;
  username: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  passwordHash: string;
  status: string;
  role: { code: string; status: string };
}

/**
 * Where a signed-in person stands right now: whether they and their role are still switched on,
 * and which rights the role holds. Read afresh for every request that needs a right, so switching
 * someone off or taking a right away works at once, not at their next sign-in.
 */
export interface UserStanding {
  status: string;
  role: { code: string; status: string; accesses: string[] };
}

/** Finds users. KVNsysCore only describes it; KVNsysPostgres provides the real one. */
export abstract class UserDirectory {
  abstract findForSignIn(username: string): Promise<UserForSignIn | null>;
  /** Null when the user no longer exists. */
  abstract findStanding(userId: string): Promise<UserStanding | null>;
}

/** A person's name as it's shown: "Ana Cruz", or "Ana Santos Cruz" with a middle name. */
export function displayName(first: string, middle: string | null, last: string): string {
  return [first, middle, last].filter((part) => part !== null && part.trim().length > 0).join(' ');
}

/** Only an active user with an active role may sign in. */
export function maySignIn(user: Pick<UserForSignIn, 'status' | 'role'>): boolean {
  return user.status === 'Active' && user.role.status === 'Active';
}
