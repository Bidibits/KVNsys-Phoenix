import type { Session } from '../domain/session.js';

/** What sign-in needs to know about a user. Carries the hash only to check it. */
export interface UserForSignIn {
  id: string;
  username: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  passwordHash: string;
  status: string;
  role: { code: string; status: string; accesses: string[] };
}

export abstract class UserDirectory {
  abstract findForSignIn(username: string): Promise<UserForSignIn | null>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, stored: string): Promise<boolean>;
}

/** Turns a session into a cookie value and back, refusing anything tampered with or expired. */
export abstract class SessionTokens {
  abstract issue(session: Session): string;
  abstract read(token: string | undefined, now?: number): Session | null;
}
