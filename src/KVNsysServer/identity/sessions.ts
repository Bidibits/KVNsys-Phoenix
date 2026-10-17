import { createHash, randomBytes } from 'node:crypto';
import type { SignedInPerson } from './sign-in.js';

/** How long a pass stays good: a long shift, with room to spare. After that, the person signs in again. */
export const SessionHours = 12;

export interface Session {
  user: SignedInPerson;
  startedAt: Date;
  expiresAt: Date;
}

/**
 * Who's signed in, kept in the server's memory. A sign-in starts a session and hands back its
 * pass; later requests show the pass; signing out cancels it.
 *
 * Only a hash of each pass is kept, so nothing read out of the server's memory can be used as a
 * pass. A restart ends every session, and the registers sign in again.
 */
export class Sessions {
  private readonly byHash = new Map<string, Session>();

  /** `now` is only replaced by tests, to move time forward without waiting 12 hours. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Starts a session for someone who has just signed in, and returns its pass. */
  start(user: SignedInPerson): { token: string; expiresAt: Date } {
    this.forgetExpired();
    const token = randomBytes(32).toString('base64url');
    const startedAt = this.now();
    const expiresAt = new Date(startedAt.getTime() + SessionHours * 60 * 60 * 1000);
    this.byHash.set(hashOf(token), { user, startedAt, expiresAt });
    return { token, expiresAt };
  }

  /** The session this pass belongs to, or null when the pass is unknown, cancelled or expired. */
  find(token: string): Session | null {
    const key = hashOf(token);
    const session = this.byHash.get(key);
    if (!session) return null;
    if (session.expiresAt <= this.now()) {
      this.byHash.delete(key);
      return null;
    }
    return session;
  }

  /** Cancels a pass. Cancelling one that's already gone is fine: it's just as signed out. */
  cancel(token: string): void {
    this.byHash.delete(hashOf(token));
  }

  /** How many passes are still good. */
  activeCount(): number {
    this.forgetExpired();
    return this.byHash.size;
  }

  /** Expired passes are forgotten, so a server that runs for months doesn't keep every pass it ever made. */
  private forgetExpired(): void {
    const now = this.now();
    for (const [key, session] of this.byHash) {
      if (session.expiresAt <= now) this.byHash.delete(key);
    }
  }
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
