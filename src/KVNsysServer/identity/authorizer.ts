import { AccessDescriptions, maySignIn, UserDirectory, type AccessName } from '@kvnsys/core';
import { SignInEnded, Sessions } from './sessions.js';
import { SwitchedOff, type SignedInPerson } from './sign-in.js';

export type Authorization =
  | { ok: true; person: SignedInPerson }
  /** 401: sign in again. 403: signed in, but the role may not. */
  | { ok: false; status: 401 | 403; message: string };

/** What someone is told when their role lacks a right. */
export function lacksRight(access: AccessName): string {
  return `This needs a right your role doesn't have: ${AccessDescriptions[access]}. Ask a manager.`;
}

/**
 * Decides whether the person behind a pass may do something. Their standing is read from the
 * database every time, not remembered from sign-in, so switching someone off or taking a right
 * from their role works on their very next request.
 */
export class Authorizer {
  constructor(
    private readonly sessions: Sessions,
    private readonly users: UserDirectory,
  ) {}

  async check(token: string | null, access: AccessName): Promise<Authorization> {
    const session = token ? this.sessions.find(token) : null;
    if (!token || !session) return { ok: false, status: 401, message: SignInEnded };

    const standing = await this.users.findStanding(session.user.id);
    if (!standing || !maySignIn(standing)) {
      // Switched off, or removed, since signing in: the pass ends now, not twelve hours from now.
      this.sessions.cancel(token);
      return { ok: false, status: 401, message: standing ? SwitchedOff : SignInEnded };
    }
    if (!standing.role.accesses.includes(access)) return { ok: false, status: 403, message: lacksRight(access) };
    return { ok: true, person: session.user };
  }
}
