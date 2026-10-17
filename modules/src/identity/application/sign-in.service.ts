import { Inject, Injectable } from '@nestjs/common';
import { Refusal } from '../../shared/domain/refusal.js';
import { displayName, SessionLengthMs, type Session } from '../domain/session.js';
import { PasswordHasher, SessionTokens, UserDirectory } from './ports.js';

/** One message for "no such user" and "wrong password", so sign-in can't be used to find usernames. */
export const WrongCredentials = 'Wrong username or password.';

@Injectable()
export class SignInService {
  /** Verified against when the username doesn't exist, so both failures take the same time. */
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(UserDirectory) private readonly users: UserDirectory,
    @Inject(PasswordHasher) private readonly hasher: PasswordHasher,
    @Inject(SessionTokens) private readonly tokens: SessionTokens,
  ) {}

  async signIn(username: string, password: string, now = Date.now()): Promise<{ token: string; session: Session }> {
    const user = await this.users.findForSignIn(username);
    if (!user) {
      this.dummyHash ??= this.hasher.hash('phoenix-timing-equaliser');
      await this.hasher.verify(password, await this.dummyHash);
      throw new Refusal('unauthenticated', WrongCredentials);
    }
    if (!(await this.hasher.verify(password, user.passwordHash))) {
      throw new Refusal('unauthenticated', WrongCredentials);
    }
    if (user.status !== 'Active' || user.role.status !== 'Active') {
      throw new Refusal('forbidden', 'This account is switched off. Ask a manager.');
    }

    const session: Session = {
      userId: user.id,
      username: user.username,
      displayName: displayName(user.firstName, user.middleName, user.lastName),
      roleCode: user.role.code,
      accesses: user.role.accesses,
      expiresAt: now + SessionLengthMs,
    };
    return { token: this.tokens.issue(session), session };
  }

  read(token: string | undefined): Session | null {
    return this.tokens.read(token);
  }
}
