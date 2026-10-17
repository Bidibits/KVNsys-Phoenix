import { createHash, randomBytes } from 'node:crypto';
import { DeviceTokens } from '../application/ports.js';

/**
 * 32 random bytes per register. Only the SHA-256 is stored: the token is already
 * unguessable, so a slow hash adds nothing, and a copy of the machines table can't be
 * turned back into a working cookie.
 */
export class Sha256DeviceTokens extends DeviceTokens {
  mint(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
