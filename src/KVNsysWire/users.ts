import { AccountStatuses } from '@kvnsys/core';
import { z } from 'zod';

/**
 * The account calls. Every one needs a signed-in pass, and a role with the right: users.view to look,
 * users.manage to add, change or reset a password.
 *
 *   GET  /api/users                 every account, by name
 *   GET  /api/users/<id>            one account
 *   GET  /api/role-choices          the roles an account can be given (users.view)
 *   POST /api/users                 add one, with its first password     (201)
 *   PUT  /api/users/<id>            change one (never its password)
 *   POST /api/users/<id>/password   give it a new password; its passes end
 *
 * A refusal is a ProblemReply (see products.ts), with the same statuses.
 */
export const UsersPath = '/api/users';
export const RoleChoicesPath = '/api/role-choices';
export const userPath = (id: string) => `${UsersPath}/${encodeURIComponent(id)}`;
export const userPasswordPath = (id: string) => `${userPath(id)}/password`;

/** What a client sends to change an account. KVNsysCore's rules are checked at the server. */
export const AccountFields = z.object({
  username: z.string().max(200),
  firstName: z.string().max(500),
  middleName: z.string().max(500).nullable(),
  lastName: z.string().max(500),
  roleId: z.string().max(100),
  status: z.enum(AccountStatuses),
});
export type AccountFields = z.infer<typeof AccountFields>;

/** A new account comes with its first password. It travels only over the pinned, encrypted connection. */
export const NewAccountFields = AccountFields.extend({ password: z.string().max(200) });
export type NewAccountFields = z.infer<typeof NewAccountFields>;

/** An account as the server sends it. Never a password, nor its hash. */
export const AccountOnWire = AccountFields.extend({
  id: z.string(),
  displayName: z.string(),
  roleName: z.string(),
});
export type AccountOnWire = z.infer<typeof AccountOnWire>;

export const UserReply = z.object({ user: AccountOnWire });
export type UserReply = z.infer<typeof UserReply>;

export const UserListReply = z.object({ users: z.array(AccountOnWire) });
export type UserListReply = z.infer<typeof UserListReply>;

export const RoleChoiceListReply = z.object({ roles: z.array(z.object({ id: z.string(), name: z.string(), status: z.string() })) });
export type RoleChoiceListReply = z.infer<typeof RoleChoiceListReply>;

export const PasswordReset = z.object({ password: z.string().max(200) });
export type PasswordReset = z.infer<typeof PasswordReset>;

export const PasswordResetReply = z.object({ passwordChanged: z.literal(true) });
export type PasswordResetReply = z.infer<typeof PasswordResetReply>;
