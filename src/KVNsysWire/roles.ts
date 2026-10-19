import { RoleStatuses } from '@kvnsys/core';
import { z } from 'zod';

/**
 * The role calls. Every one needs a signed-in pass, and a role with the right: roles.view to look,
 * roles.manage to make or change one.
 *
 *   GET  /api/roles        every role, the Administrator first, with its rights
 *   GET  /api/roles/<id>   one role
 *   POST /api/roles        make one                                  (201)
 *   PUT  /api/roles/<id>   change one; switched off, its people's passes end
 *
 * The roles an account can be given come from /api/role-choices (users.ts), so a manager who may
 * change accounts doesn't also need to see roles. A refusal is a ProblemReply (see products.ts).
 */
export const RolesPath = '/api/roles';
export const rolePath = (id: string) => `${RolesPath}/${encodeURIComponent(id)}`;

/** What a client sends for a role. Rights travel by name; KVNsysCore's rules are checked at the server. */
export const RoleFields = z.object({
  name: z.string().max(500),
  status: z.enum(RoleStatuses),
  rights: z.array(z.string().max(100)).max(100),
});
export type RoleFields = z.infer<typeof RoleFields>;

/** A role as the server sends it. */
export const RoleOnWire = RoleFields.extend({
  id: z.string(),
  code: z.string(),
  userCount: z.number().int().nonnegative(),
  fixed: z.boolean(),
});
export type RoleOnWire = z.infer<typeof RoleOnWire>;

export const RoleReply = z.object({ role: RoleOnWire });
export type RoleReply = z.infer<typeof RoleReply>;

export const RoleListReply = z.object({ roles: z.array(RoleOnWire) });
export type RoleListReply = z.infer<typeof RoleListReply>;
