import { ScryptPasswordHasher } from '@kvnsys/server';
import { describe, expect, it } from 'vitest';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('accepts the password it hashed, and nothing else', async () => {
    const stored = await hasher.hash('correct horse');
    expect(await hasher.verify('correct horse', stored)).toBe(true);
    expect(await hasher.verify('correct hors', stored)).toBe(false);
  });

  it('salts every hash, so the same password is never stored the same way twice', async () => {
    expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
  });

  it('turns down a damaged stored value instead of crashing', async () => {
    expect(await hasher.verify('x', 'not-a-hash')).toBe(false);
  });
});
