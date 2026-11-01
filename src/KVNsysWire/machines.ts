import { MachineStatuses } from '@kvnsys/core';
import { z } from 'zod';
import { listed } from './history.js';

/**
 * The machine calls. Every one needs a signed-in pass, and a role with the right: machines.view to
 * look, machines.manage to rename a machine or switch it off. A machine records itself the first
 * time someone signs in at it (see sign-in.ts); these only look and change.
 *
 *   GET  /api/machines          the shop's machines, the server PC first, each with its shop and history
 *   PUT  /api/machines/<id>     rename one, or switch it off or on; switched off, its sign-ins end
 *
 * A refusal is a ProblemReply (see products.ts).
 */
export const MachinesPath = '/api/machines';
export const machinePath = (id: string) => `${MachinesPath}/${encodeURIComponent(id)}`;

export const MachineFields = z.object({ name: z.string().max(500), status: z.enum(MachineStatuses) });
export type MachineFields = z.infer<typeof MachineFields>;

export const MachineOnWire = MachineFields.extend({
  id: z.string(),
  code: z.string(),
  computerName: z.string().nullable(),
  hardwareId: z.string().nullable(),
  description: z.string().nullable(),
  isServer: z.boolean(),
});
export type MachineOnWire = z.infer<typeof MachineOnWire>;

/** A machine in the list, with the name of the shop it belongs to. */
export const ListedMachineOnWire = listed(MachineOnWire).extend({ shopName: z.string() });
export type ListedMachineOnWire = z.infer<typeof ListedMachineOnWire>;

export const MachineListReply = z.object({ machines: z.array(ListedMachineOnWire) });
export type MachineListReply = z.infer<typeof MachineListReply>;

export const MachineReply = z.object({ machine: MachineOnWire });
export type MachineReply = z.infer<typeof MachineReply>;
