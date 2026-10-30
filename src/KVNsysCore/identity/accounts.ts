import type { Lineage } from '../shared/lineage.js';
import type { Listed } from '../shared/record-history.js';
import { Refusal } from '../shared/refusal.js';
import { passwordProblem } from './passwords.js';
import { displayName } from './users.js';

/** An Active account can sign in. An Inactive one is switched off, and kept, because past work names it. */
export const AccountStatuses = ['Active', 'Inactive'] as const;
export type AccountStatus = (typeof AccountStatuses)[number];

/** A person's account as the Users screen shows it. Never carries a password or its hash. */
export interface Account {
  id: string;
  username: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  /** "Ana Santos Cruz": the name as it's shown. */
  displayName: string;
  roleId: string;
  roleName: string;
  status: AccountStatus;
  description: string | null;
}

/** What a manager fills in for an account. The password is set apart, never with these. */
export interface AccountDetails {
  username: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  roleId: string;
  status: AccountStatus;
}

/** A role, as the account form offers it. */
export interface RoleChoice {
  id: string;
  name: string;
  status: string;
}

export const AccountLimits = { username: 40, name: 100 } as const;

/**
 * Usernames are kept in lowercase and matched that way, so "Ana" and "ana" are the same person, at
 * sign-in and when a new account is checked against the existing ones.
 */
export function normalizeUsername(typed: string): string {
  return typed.trim().toLowerCase();
}

/**
 * Why a username can't be used, in words a person can act on, or null if it can. It's judged as it
 * will be kept, in lowercase, so "Ana" is fine. Whether someone already has it, only the store can say.
 */
export function usernameProblem(typed: string): string | null {
  const username = normalizeUsername(typed);
  if (!username) return 'An account needs a username.';
  if (!/^[a-z0-9._-]+$/.test(username)) return 'A username is letters, numbers, dots, dashes or underscores, with no spaces.';
  if (username.length > AccountLimits.username) return `A username can be at most ${AccountLimits.username} characters.`;
  return null;
}

/** The account as a form holds it: every field text, as typed. The two password boxes are for a new account. */
export interface UserForm {
  username: string;
  firstName: string;
  middleName: string;
  lastName: string;
  roleId: string;
  status: string;
  password: string;
  passwordAgain: string;
}

/** A new account starts empty and Active, with the role given (the first one offered). */
export function blankUserForm(roleId = ''): UserForm {
  return { username: '', firstName: '', middleName: '', lastName: '', roleId, status: 'Active', password: '', passwordAgain: '' };
}

/** An account as the form shows it for changing. Its password is never shown, only replaced. */
export function userFormFor(account: Account): UserForm {
  return {
    username: account.username,
    firstName: account.firstName,
    middleName: account.middleName ?? '',
    lastName: account.lastName,
    roleId: account.roleId,
    status: account.status,
    password: '',
    passwordAgain: '',
  };
}

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/**
 * What was typed, as an account that meets the rules. A new account also needs its password, typed
 * twice; when changing one, the password boxes are ignored (a password is replaced on its own).
 * Whether the username is taken, and whether the role exists, only the store can say.
 */
export function readUserForm(form: UserForm, isNew: boolean): { details: AccountDetails; password: string | null } {
  const details = checkAccountDetails({
    username: form.username,
    firstName: form.firstName,
    middleName: form.middleName,
    lastName: form.lastName,
    roleId: form.roleId,
    status: form.status as AccountStatus,
  });
  return { details, password: isNew ? readNewPassword(form.password, form.passwordAgain) : null };
}

/**
 * The rules an account's details meet before they're saved, whether they came from a form or over
 * the network. Hands them back tidied (username in lowercase, spaces trimmed, an empty middle name as
 * none) or refuses with a message a person can act on.
 */
export function checkAccountDetails(details: AccountDetails): AccountDetails {
  const username = normalizeUsername(details.username);
  const problem = usernameProblem(username);
  if (problem) refuse(problem);
  const firstName = details.firstName.trim();
  const middleName = details.middleName?.trim() || null;
  const lastName = details.lastName.trim();
  if (!firstName) refuse('An account needs a first name.');
  if (!lastName) refuse('An account needs a last name.');
  for (const part of [firstName, middleName ?? '', lastName]) {
    if (part.length > AccountLimits.name) refuse(`A name can be at most ${AccountLimits.name} characters.`);
  }
  const roleId = details.roleId.trim();
  if (!roleId) refuse('Choose a role for this account.');
  if (!AccountStatuses.includes(details.status)) {
    refuse(`An account is ${AccountStatuses.join(' or ')}, not "${details.status}".`);
  }
  return { username, firstName, middleName, lastName, roleId, status: details.status };
}

/** A password being set, typed twice: it has to meet the rule and match. */
export function readNewPassword(password: string, again: string): string {
  const problem = passwordProblem(password);
  if (problem) refuse(problem);
  if (password !== again) refuse("Those two passwords didn't match. Type them again.");
  return password;
}

/** An account's name as it's shown, from its parts. */
export function accountDisplayName(details: Pick<AccountDetails, 'firstName' | 'middleName' | 'lastName'>): string {
  return displayName(details.firstName, details.middleName, details.lastName);
}

/**
 * Where accounts are kept. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * Saving refuses a username another account has, and a role that doesn't exist. It also refuses any
 * change that would leave nobody able to manage users (an active account whose active role holds
 * users.manage), so nobody can lock the shop out, themselves included.
 */
export abstract class UserAccounts {
  abstract list(): Promise<Listed<Account>[]>;
  abstract get(id: string): Promise<Account | null>;
  abstract roles(): Promise<RoleChoice[]>;
  abstract create(details: AccountDetails, passwordHash: string, lineage: Lineage): Promise<Account>;
  abstract update(id: string, details: AccountDetails, lineage: Lineage): Promise<Account>;
  abstract setPassword(id: string, passwordHash: string, lineage: Lineage): Promise<void>;
}
