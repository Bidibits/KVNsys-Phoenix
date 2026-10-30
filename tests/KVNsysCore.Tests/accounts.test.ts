import {
  blankUserForm,
  checkAccountDetails,
  normalizeUsername,
  readNewPassword,
  readUserForm,
  usernameProblem,
  userFormFor,
  type Account,
  type AccountDetails,
} from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const ana: AccountDetails = { username: 'ana', firstName: 'Ana', middleName: null, lastName: 'Cruz', roleId: 'role-1', status: 'Active' };
const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

describe('an account', () => {
  it('keeps usernames in lowercase, so Ana and ana are one person', () => {
    expect(normalizeUsername('  Ana.Cruz ')).toBe('ana.cruz');
    expect(checkAccountDetails({ ...ana, username: ' ANA ', firstName: ' Ana ', middleName: '  ' })).toEqual(ana);
  });

  it('needs a username of letters, numbers, dots, dashes or underscores', () => {
    expect(refusalOf(() => checkAccountDetails({ ...ana, username: ' ' }))).toMatchObject({ kind: 'invalid', message: 'An account needs a username.' });
    expect(refusalOf(() => checkAccountDetails({ ...ana, username: 'ana cruz' }))?.message).toMatch(/no spaces/);
    expect(refusalOf(() => checkAccountDetails({ ...ana, username: 'añá' }))?.message).toMatch(/letters, numbers/);
    expect(refusalOf(() => checkAccountDetails({ ...ana, username: 'a'.repeat(41) }))?.message).toMatch(/at most 40/);
    expect(checkAccountDetails({ ...ana, username: 'ana_cruz-2.0' }).username).toBe('ana_cruz-2.0');
  });

  it('says why a username can be used or not, judged in lowercase as it will be kept', () => {
    expect(usernameProblem(' Kenly ')).toBeNull();
    expect(usernameProblem('')).toBe('An account needs a username.');
    expect(usernameProblem('kenly lucena')).toMatch(/no spaces/);
    expect(usernameProblem('a'.repeat(41))).toMatch(/at most 40/);
  });

  it('needs a first and a last name, a role, and one of the two statuses', () => {
    expect(refusalOf(() => checkAccountDetails({ ...ana, firstName: '' }))?.message).toBe('An account needs a first name.');
    expect(refusalOf(() => checkAccountDetails({ ...ana, lastName: ' ' }))?.message).toBe('An account needs a last name.');
    expect(refusalOf(() => checkAccountDetails({ ...ana, roleId: '' }))?.message).toBe('Choose a role for this account.');
    expect(refusalOf(() => checkAccountDetails({ ...ana, status: 'Gone' as never }))?.message).toBe('An account is Active or Inactive, not "Gone".');
    expect(refusalOf(() => checkAccountDetails({ ...ana, lastName: 'C'.repeat(101) }))?.message).toMatch(/at most 100/);
  });
});

describe('the account form', () => {
  const typed = { username: 'Ana', firstName: 'Ana', middleName: '', lastName: 'Cruz', roleId: 'role-1', status: 'Active', password: 'a-good-password', passwordAgain: 'a-good-password' };

  it('starts a new account empty and Active, on the role given', () => {
    expect(blankUserForm('role-1')).toEqual({ ...typed, username: '', firstName: '', lastName: '', password: '', passwordAgain: '' });
  });

  it('reads a new account with its password, typed twice', () => {
    expect(readUserForm(typed, true)).toEqual({ details: ana, password: 'a-good-password' });
  });

  it("refuses a new account's password that's too short, or doesn't match", () => {
    expect(refusalOf(() => readUserForm({ ...typed, password: 'short', passwordAgain: 'short' }, true))?.message).toMatch(/at least 8/);
    expect(refusalOf(() => readUserForm({ ...typed, passwordAgain: 'a-different-one' }, true))?.message).toBe("Those two passwords didn't match. Type them again.");
  });

  it('ignores the password boxes when changing an account: a password is replaced on its own', () => {
    expect(readUserForm({ ...typed, password: '', passwordAgain: '' }, false)).toEqual({ details: ana, password: null });
  });

  it('shows an account for changing without its password, and reads back the same', () => {
    const account: Account = { ...ana, id: 'user-1', middleName: 'Santos', displayName: 'Ana Santos Cruz', roleName: 'Cashier' };
    const form = userFormFor(account);
    expect(form).toMatchObject({ username: 'ana', middleName: 'Santos', password: '', passwordAgain: '' });
    expect(readUserForm(form, false).details).toEqual({ ...ana, middleName: 'Santos' });
  });

  it('checks a new password the same way on its own', () => {
    expect(readNewPassword('a-good-password', 'a-good-password')).toBe('a-good-password');
    expect(refusalOf(() => readNewPassword('a-good-password', 'nope'))?.message).toMatch(/didn't match/);
  });
});
