import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { PasswordHasher } from '@kvnsys/core';

function scrypt(password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

const KeyLength = 64;
const Cost = { N: 2 ** 15, r: 8, p: 1 };
const MaxMemory = 64 * 1024 * 1024;

/**
 * scrypt, from Node's own crypto. It's memory-hard, so guessing is slow even on a graphics
 * card, and there's no native package to compile on a branch PC. Stored as
 * `scrypt$N$r$p$salt$hash`, so the cost can be raised later and old hashes still check out.
 */
export class ScryptPasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await scrypt(password, salt, KeyLength, { ...Cost, maxmem: MaxMemory });
    return ['scrypt', Cost.N, Cost.r, Cost.p, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [scheme, n, r, p, saltText, keyText] = stored.split('$');
    if (scheme !== 'scrypt' || !n || !r || !p || !saltText || !keyText) return false;
    const expected = Buffer.from(keyText, 'base64');
    const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MaxMemory,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
