import { UserDirectory, type UserForSignIn } from '@kvnsys/core';
import { ScryptPasswordHasher, SignIn, SwitchedOff, WrongCredentials } from '@kvnsys/server';
import { beforeAll, describe, expect, it } from 'vitest';

const hasher = new ScryptPasswordHasher();
let ana: UserForSignIn;

/** A pretend user list, enough to check the sign-in rules without a database. */
function signInWith(users: UserForSignIn[]) {
  const directory = new (class extends UserDirectory {
    async findForSignIn(username: string) {
      return users.find((u) => u.username === username) ?? null;
    }
  })();
  return new SignIn(directory, hasher);
}

beforeAll(async () => {
  ana = {
    id: '0192f3c1-0000-7000-8000-000000000001',
    username: 'ana',
    firstName: 'Ana',
    middleName: null,
    lastName: 'Cruz',
    passwordHash: await hasher.hash('right-password'),
    status: 'Active',
    role: { code: 'MANAGER', status: 'Active' },
  };
});

describe('SignIn', () => {
  it('says yes to the right password, with the name and role', async () => {
    expect(await signInWith([ana]).run('ana', 'right-password')).toEqual({
      ok: true,
      user: { id: ana.id, username: 'ana', displayName: 'Ana Cruz', roleCode: 'MANAGER' },
    });
  });

  it('gives the same answer for a wrong password and a username that does not exist', async () => {
    const wrong = await signInWith([ana]).run('ana', 'wrong-password');
    const unknown = await signInWith([ana]).run('nobody', 'whatever');
    expect(wrong).toEqual({ ok: false, problem: 'wrong-credentials', message: WrongCredentials });
    expect(unknown).toEqual(wrong);
  });

  it('turns away a switched-off user, and a user whose role is switched off', async () => {
    expect(await signInWith([{ ...ana, status: 'Inactive' }]).run('ana', 'right-password')).toEqual({
      ok: false,
      problem: 'switched-off',
      message: SwitchedOff,
    });
    const roleOff = { ...ana, role: { code: 'MANAGER', status: 'Inactive' } };
    expect(await signInWith([roleOff]).run('ana', 'right-password')).toMatchObject({ ok: false, problem: 'switched-off' });
  });

  it('says "wrong password", not "switched off", when a switched-off user gets the password wrong', async () => {
    expect(await signInWith([{ ...ana, status: 'Inactive' }]).run('ana', 'wrong')).toMatchObject({
      problem: 'wrong-credentials',
    });
  });
});
