import { RegisterStatuses } from '@kvnsys/core';
import { z } from 'zod';
import { listed } from './history.js';

/**
 * The register calls. Every one needs a signed-in pass, and a role with the right: machines.view to
 * look, machines.manage to rename a register or switch it off. A register records itself the first
 * time someone signs in at it (see sign-in.ts); these only look and change.
 *
 *   GET  /api/registers          the shop's registers, the server PC first, each with its shop and history
 *   PUT  /api/registers/<id>     rename one, or switch it off or on; switched off, its sign-ins end
 *
 * A refusal is a ProblemReply (see products.ts).
 */
export const RegistersPath = '/api/registers';
export const registerPath = (id: string) => `${RegistersPath}/${encodeURIComponent(id)}`;

export const RegisterFields = z.object({ name: z.string().max(500), status: z.enum(RegisterStatuses) });
export type RegisterFields = z.infer<typeof RegisterFields>;

export const RegisterOnWire = RegisterFields.extend({
  id: z.string(),
  code: z.string(),
  computerName: z.string().nullable(),
  hardwareId: z.string().nullable(),
  description: z.string().nullable(),
  isServer: z.boolean(),
});
export type RegisterOnWire = z.infer<typeof RegisterOnWire>;

/** A register in the list, with the name of the shop it belongs to. */
export const ListedRegisterOnWire = listed(RegisterOnWire).extend({ shopName: z.string() });
export type ListedRegisterOnWire = z.infer<typeof ListedRegisterOnWire>;

export const RegisterListReply = z.object({ registers: z.array(ListedRegisterOnWire) });
export type RegisterListReply = z.infer<typeof RegisterListReply>;

export const RegisterReply = z.object({ register: RegisterOnWire });
export type RegisterReply = z.infer<typeof RegisterReply>;
