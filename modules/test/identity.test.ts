import { describe, expect, it } from 'vitest';
import { PasswordHasher, SessionTokens, UserDirectory, type UserForSignIn } from '../src/identity/application/ports.js';
import { SignInService, WrongCredentials } from '../src/identity/application/sign-in.service.js';
import { holds } from '../src/identity/domain/accesses.js';
import { displayName, type Session } from '../src/identity/domain/session.js';
import { HmacSessionTokens } from '../src/identity/infrastructure/hmac-session-tokens.js';
import { ScryptPasswordHasher } from '../src/identity/infrastructure/scrypt-password-hasher.js';

const secret = 'a-test-secret-that-is-at-least-32-characters';

function session(overrides: Partial<Session> = {}): Session {
  return {
    userId: '0192f3c1-0000-7000-8000-000000000001',
    username: 'ana',
    displayName: 'Ana Cruz',
    roleCode: 'MANAGER',
    accesses: ['machines.register'],
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the password it hashed, and nothing else', async () => {
    const stored = await hasher.hash('correct horse');
    expect(await hasher.verify('correct horse', stored)).toBe(true);
    expect(await hasher.verify('correct hors', stored)).toBe(false);
  });

  it('salts every hash, so the same password never stores the same way twice', async () => {
    expect(await hasher.hash('same')).not.toBe(await hasher.hash('same'));
  });

  it('refuses a malformed stored value instead of throwing', async () => {
    expect(await hasher.verify('x', 'not-a-hash')).toBe(false);
  });
});

describe('HmacSessionTokens', () => {
  const tokens = new HmacSessionTokens(secret);

  it('reads back the session it issued', () => {
    expect(tokens.read(tokens.issue(session()))?.username).toBe('ana');
  });

  it('refuses a token whose contents were edited', () => {
    const [, signature] = tokens.issue(session()).split('.');
    const forged = Buffer.from(JSON.stringify(session({ roleCode: 'ADMIN' }))).toString('base64url');
    expect(tokens.read(`${forged}.${signature}`)).toBeNull();
  });

  it('refuses a token signed with another secret', () => {
    const other = new HmacSessionTokens('another-secret-that-is-at-least-32-chars!');
    expect(tokens.read(other.issue(session()))).toBeNull();
  });

  it('refuses an expired session', () => {
    expect(tokens.read(tokens.issue(session({ expiresAt: 1000 })), 2000)).toBeNull();
  });

  it('refuses nothing, garbage and a missing signature', () => {
    expect(tokens.read(undefined)).toBeNull();
    expect(tokens.read('garbage')).toBeNull();
    expect(tokens.read('abc.')).toBeNull();
  });
});

describe('SignInService', () => {
  const hasher = new ScryptPasswordHasher();
  const tokens = new HmacSessionTokens(secret);

  async function serviceWith(user: Partial<UserForSignIn> | null) {
    const stored: UserForSignIn | null = user && {
      id: '0192f3c1-0000-7000-8000-000000000002',
      username: 'ana',
      firstName: 'Ana',
      middleName: null,
      lastName: 'Cruz',
      passwordHash: await hasher.hash('right-password'),
      status: 'Active',
      role: { code: 'MANAGER', status: 'Active', accesses: ['machines.register'] },
      ...user,
    };
    const directory = new (class extends UserDirectory {
      findForSignIn = async () => stored;
    })();
    return new SignInService(directory, hasher as PasswordHasher, tokens as SessionTokens);
  }

  it('signs in with the right password and carries the role\'s accesses', async () => {
    const { session: s } = await (await serviceWith({})).signIn('ana', 'right-password');
    expect(s.displayName).toBe('Ana Cruz');
    expect(s.accesses).toEqual(['machines.register']);
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    await expect((await serviceWith({})).signIn('ana', 'wrong')).rejects.toThrow(WrongCredentials);
    await expect((await serviceWith(null)).signIn('nobody', 'x')).rejects.toThrow(WrongCredentials);
  });

  it('refuses a switched-off user, and a user whose role is switched off', async () => {
    await expect((await serviceWith({ status: 'Inactive' })).signIn('ana', 'right-password')).rejects.toThrow(/switched off/);
    const roleOff = { role: { code: 'MANAGER', status: 'Inactive', accesses: [] } };
    await expect((await serviceWith(roleOff)).signIn('ana', 'right-password')).rejects.toThrow(/switched off/);
  });
});

describe('identity rules', () => {
  it('joins a name without leaving gaps for a missing middle name', () => {
    expect(displayName('Ana', null, 'Cruz')).toBe('Ana Cruz');
    expect(displayName('Ana', 'Santos', 'Cruz')).toBe('Ana Santos Cruz');
  });

  it('holds a right only if the role lists it', () => {
    expect(holds(['machines.view'], 'machines.register')).toBe(false);
    expect(holds(['machines.register'], 'machines.register')).toBe(true);
  });
});
