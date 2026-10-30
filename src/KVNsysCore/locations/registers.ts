import type { Lineage } from '../shared/lineage.js';
import type { Listed } from '../shared/record-history.js';
import { Refusal } from '../shared/refusal.js';
import type { PcIdentity } from './machines.js';

/** An Active register can be signed in at. An Inactive one is switched off, and kept, because sales name it. */
export const RegisterStatuses = ['Active', 'Inactive'] as const;
export type RegisterStatus = (typeof RegisterStatuses)[number];

export const RegisterLimits = { name: 60 } as const;

/** A PC the shop's people sign in at (the `machines` table): a register, or the server PC itself. */
export interface Register {
  id: string;
  /** Given when it's first recorded, and never changed: HQ-R01, or HQ-SRV for the server PC. */
  code: string;
  /** What the shop calls it: "Counter 1". */
  name: string;
  /** Windows' name for the PC, as it last said. */
  computerName: string | null;
  /** The PC's hardware id (Windows' MachineGuid): how it's recognised after a rename. Null if it couldn't be read. */
  hardwareId: string | null;
  locationId: string;
  status: RegisterStatus;
  description: string | null;
  /** The server PC: always switched on, since switching it off would lock its own screen out. */
  isServer: boolean;
}

/** What a manager decides for a register. */
export interface RegisterDetails {
  name: string;
  status: RegisterStatus;
}

/** The code of a shop's nth register: HQ-R01, HQ-R02, … HQ-R100. */
export function registerCode(shopCode: string, number: number): string {
  return `${shopCode}-R${String(number).padStart(2, '0')}`;
}

/** What a register is called until a manager names it: "New register (COUNTER-PC)". */
export function newRegisterName(computerName: string): string {
  return `New register (${computerName.trim() || 'unnamed PC'})`.slice(0, RegisterLimits.name);
}

/** The rules a register's details meet before they're saved: tidied, or refused with what to fix. */
export function checkRegisterDetails(details: { name: string; status: string }): RegisterDetails {
  const name = details.name.trim();
  if (!name) throw new Refusal('invalid', 'A register needs a name, such as "Counter 1".');
  if (name.length > RegisterLimits.name) throw new Refusal('invalid', `A register's name can be at most ${RegisterLimits.name} characters.`);
  if (!RegisterStatuses.includes(details.status as RegisterStatus)) {
    throw new Refusal('invalid', `A register is ${RegisterStatuses.join(' or ')}, not "${details.status}".`);
  }
  return { name, status: details.status as RegisterStatus };
}

/**
 * The registers a server knows. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * A PC is recognised by its hardware id, which survives renaming it. The first time an unknown
 * one signs in, it's recorded at the shop by itself, with the next code and a name to change.
 */
export abstract class RegisterBook {
  /** The register this PC is at the shop, recorded now if it's new. Its computer name is kept up to date. */
  abstract recognise(pc: PcIdentity & { hardwareId: string }, locationId: string, lineage: Lineage): Promise<Register>;
  /** The shop's registers, the server PC first, then by code. */
  abstract list(locationId: string): Promise<Listed<Register>[]>;
  abstract get(id: string): Promise<Register | null>;
  /** Refuses switching the server PC off. */
  abstract update(id: string, details: RegisterDetails, lineage: Lineage): Promise<Register>;
}
