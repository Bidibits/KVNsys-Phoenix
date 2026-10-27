import { createHash, randomBytes } from 'node:crypto';
import type { SignedInPerson } from './sign-in.js';

/** How long a pass stays good: a long shift, with room to spare. After that, the person signs in again. */
export const SessionHours = 12;

/** What a register is told when its pass is unknown, cancelled or expired. */
export const SignInEnded = 'Your sign-in has ended. Sign in again.';

/** What a register is told when someone disconnected it from the server's dashboard. */
export const DisconnectedAtServer = 'You were disconnected at the server. Sign in again.';

/** The register a sign-in is at: the PC, its shop, and what the shop calls it. */
export interface SessionRegister {
  machineId: string;
  locationId: string;
  code: string;
  name: string;
}

export interface Session {
  /** Names the session on the server's dashboard. Not the pass, and no use as one. */
  id: string;
  user: SignedInPerson;
  /** Null when the sign-in is at no register: a PC that couldn't read its own id. */
  register: SessionRegister | null;
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
  /**
   * Passes ended from the server's dashboard, kept until they'd have expired anyway, so the
   * register is told why instead of just "ended".
   */
  private readonly disconnected = new Map<string, Date>();

  /** `now` is only replaced by tests, to move time forward without waiting 12 hours. */
  constructor(private readonly now: () => Date = () => new Date()) {}

  /** Starts a session for someone who has just signed in, and returns its pass. */
  start(user: SignedInPerson, register: SessionRegister | null = null): { token: string; expiresAt: Date } {
    this.forgetExpired();
    const token = randomBytes(32).toString('base64url');
    const startedAt = this.now();
    const expiresAt = new Date(startedAt.getTime() + SessionHours * 60 * 60 * 1000);
    this.byHash.set(hashOf(token), { id: randomBytes(12).toString('base64url'), user, register, startedAt, expiresAt });
    return { token, expiresAt };
  }

  /** Every sign-in that's still good, oldest first: what the server's dashboard lists. */
  list(): Session[] {
    this.forgetExpired();
    return [...this.byHash.values()].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }

  /**
   * Ends one sign-in from the server's dashboard. The register finds out at its next request, and
   * is told it was disconnected. False when there was no such session, or it had already ended.
   */
  disconnect(id: string): boolean {
    for (const [key, session] of this.byHash) {
      if (session.id === id) {
        this.byHash.delete(key);
        this.disconnected.set(key, session.expiresAt);
        return true;
      }
    }
    return false;
  }

  /** Why a pass no longer works, in words for the register. */
  whyEnded(token: string): string {
    const until = this.disconnected.get(hashOf(token));
    return until && until > this.now() ? DisconnectedAtServer : SignInEnded;
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

  /**
   * Ends every pass one person holds, on every register: when their password is reset, or their
   * account is switched off. Returns how many ended.
   */
  cancelFor(userId: string): number {
    let ended = 0;
    for (const [key, session] of this.byHash) {
      if (session.user.id === userId) {
        this.byHash.delete(key);
        ended++;
      }
    }
    return ended;
  }

  /** Ends every pass signed in at one register: when it's switched off. Returns how many ended. */
  cancelForRegister(machineId: string): number {
    let ended = 0;
    for (const [key, session] of this.byHash) {
      if (session.register?.machineId === machineId) {
        this.byHash.delete(key);
        ended++;
      }
    }
    return ended;
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
    for (const [key, until] of this.disconnected) {
      if (until <= now) this.disconnected.delete(key);
    }
  }
}

function hashOf(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}
