import { createHmac, timingSafeEqual } from 'node:crypto';
import { SessionTokens } from '../application/ports.js';
import type { Session } from '../domain/session.js';

/**
 * A session is carried in its cookie, signed with HMAC-SHA256, rather than kept in a server
 * table: nothing to clean up, and a restart of the branch server doesn't sign everyone out.
 * The price is that one can't be revoked before it expires, which is why sessions are short.
 */
export class HmacSessionTokens extends SessionTokens {
  constructor(private readonly secret: string) {
    super();
  }

  issue(session: Session): string {
    const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  read(token: string | undefined, now = Date.now()): Session | null {
    if (!token) return null;
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;

    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    try {
      const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
      return typeof session.expiresAt === 'number' && session.expiresAt > now ? session : null;
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
