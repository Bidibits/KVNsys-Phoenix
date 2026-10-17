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

/** Finds users. KVNsysCore only describes it; KVNsysPostgres provides the real one. */
export abstract class UserDirectory {
  abstract findForSignIn(username: string): Promise<UserForSignIn | null>;
}

/** A person's name as it's shown: "Ana Cruz", or "Ana Santos Cruz" with a middle name. */
export function displayName(first: string, middle: string | null, last: string): string {
  return [first, middle, last].filter((part) => part !== null && part.trim().length > 0).join(' ');
}

/** Only an active user with an active role may sign in. */
export function maySignIn(user: Pick<UserForSignIn, 'status' | 'role'>): boolean {
  return user.status === 'Active' && user.role.status === 'Active';
}
