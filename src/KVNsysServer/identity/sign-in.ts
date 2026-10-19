import { displayName, maySignIn, normalizeUsername, PasswordHasher, UserDirectory } from '@kvnsys/core';

/** One answer for "no such user" and "wrong password", so sign-in can't be used to find usernames. */
export const WrongCredentials = 'Wrong username or password.';
export const SwitchedOff = 'This account is switched off. Ask a manager.';

export interface SignedInPerson {
  id: string;
  username: string;
  displayName: string;
  roleCode: string;
  /**
   * The role's rights as they were at sign-in, for the register to grey out what this person
   * can't open. The server never trusts this copy: every request re-reads the real ones.
   */
  rights: string[];
}

export type SignInOutcome =
  | { ok: true; user: SignedInPerson }
  | { ok: false; problem: 'wrong-credentials' | 'switched-off'; message: string };

/** Checks a username and password against the users in the database. */
export class SignIn {
  /** Checked against when the username doesn't exist, so both kinds of "no" take as long. */
  private standIn: Promise<string> | undefined;

  constructor(
    private readonly users: UserDirectory,
    private readonly hasher: PasswordHasher,
  ) {}

  async run(username: string, password: string): Promise<SignInOutcome> {
    // Usernames are kept in lowercase, so "Ana" signs in as ana.
    const user = await this.users.findForSignIn(normalizeUsername(username));
    if (!user) {
      this.standIn ??= this.hasher.hash('kvnsys-equal-time');
      await this.hasher.verify(password, await this.standIn);
      return { ok: false, problem: 'wrong-credentials', message: WrongCredentials };
    }
    if (!(await this.hasher.verify(password, user.passwordHash))) {
      return { ok: false, problem: 'wrong-credentials', message: WrongCredentials };
    }
    // Only checked once the password is right, so this never tells a stranger an account exists.
    if (!maySignIn(user)) {
      return { ok: false, problem: 'switched-off', message: SwitchedOff };
    }
    return {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: displayName(user.firstName, user.middleName, user.lastName),
        roleCode: user.role.code,
        rights: [...user.role.accesses].sort(),
      },
    };
  }
}
