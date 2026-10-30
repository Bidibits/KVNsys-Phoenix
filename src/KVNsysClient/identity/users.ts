import {
  blankUserForm,
  readNewPassword,
  readUserForm,
  userFormFor,
  type Account,
  type AccountStatus,
  type Listed,
  type RoleChoice,
  type UserForm,
} from '@kvnsys/core';
import {
  PasswordResetReply,
  RoleChoiceListReply,
  RoleChoicesPath,
  UserListReply,
  UserReply,
  UsersPath,
  userPasswordPath,
  userPath,
  type AccountOnWire,
  type SessionPass,
} from '@kvnsys/wire';
import { callServer, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

export type UserListResult = { ok: true; users: Listed<Account>[] } | Refused;
export type UserResult = { ok: true; user: Account } | Refused;
/** The form to fill in, and the roles it can offer. */
export type UserFormResult = { ok: true; form: UserForm; roles: RoleChoice[] } | Refused;
export type PasswordResult = { ok: true } | Refused;

const fromWire = (user: AccountOnWire): Account => ({ ...user, status: user.status as AccountStatus });

/** Every account, by name. */
export async function listUsers(address: string, pass: SessionPass, options: CallOptions): Promise<UserListResult> {
  const answer = await callServer(address, pass, options, { path: UsersPath }, UserListReply);
  return answer.ok ? { ok: true, users: answer.reply.users.map((user) => ({ ...fromWire(user), history: user.history })) } : answer;
}

/**
 * The form to fill in, with the roles it can offer: blank for a new account (id null), starting on
 * the first active role, or the account as the server has it now. Its password is never shown.
 */
export async function loadUserForm(address: string, pass: SessionPass, id: string | null, options: CallOptions): Promise<UserFormResult> {
  const roles = await callServer(address, pass, options, { path: RoleChoicesPath }, RoleChoiceListReply);
  if (!roles.ok) return roles;
  if (id === null) {
    const first = roles.reply.roles.find((role) => role.status === 'Active') ?? roles.reply.roles[0];
    return { ok: true, form: blankUserForm(first?.id ?? ''), roles: roles.reply.roles };
  }
  const user = await callServer(address, pass, options, { path: userPath(id) }, UserReply);
  return user.ok ? { ok: true, form: userFormFor(fromWire(user.reply.user)), roles: roles.reply.roles } : user;
}

/**
 * Saves what was typed: a new account with its first password (id null), or changes to one, never
 * its password. Read and checked here first (both password boxes have to match), then the server
 * checks again: only it knows whether a username is taken.
 */
export async function saveUserForm(
  address: string,
  pass: SessionPass,
  id: string | null,
  form: UserForm,
  options: CallOptions,
): Promise<UserResult> {
  const read = readOrRefuse(() => readUserForm(form, id === null));
  if (!read.ok) return read;
  const { details, password } = read.value;
  const answer =
    id === null
      ? await callServer(address, pass, options, { path: UsersPath, method: 'POST', body: { ...details, password } }, UserReply)
      : await callServer(address, pass, options, { path: userPath(id), method: 'PUT', body: details }, UserReply);
  return answer.ok ? { ok: true, user: fromWire(answer.reply.user) } : answer;
}

/** Gives an account a new password, typed twice. Wherever that person is signed in, they have to sign in again. */
export async function resetPassword(
  address: string,
  pass: SessionPass,
  id: string,
  password: string,
  again: string,
  options: CallOptions,
): Promise<PasswordResult> {
  const checked = readOrRefuse(() => readNewPassword(password, again));
  if (!checked.ok) return checked;
  const answer = await callServer(address, pass, options, { path: userPasswordPath(id), method: 'POST', body: { password: checked.value } }, PasswordResetReply);
  return answer.ok ? { ok: true } : answer;
}
