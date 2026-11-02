import type { Lineage } from '../shared/lineage.js';
import type { Listed } from '../shared/record-history.js';
import { Refusal } from '../shared/refusal.js';

/** The code of a location's server PC: HQ-SRV, BR3-SRV. */
export function serverMachineCode(locationCode: string): string {
  return `${locationCode}-SRV`;
}

/** What a PC reports about itself: the KVNsys program on it can always read these. */
export interface PcIdentity {
  /** Windows MachineGuid. Null only if it couldn't be read. */
  hardwareId: string | null;
  computerName: string;
}

/** An Active machine can be signed in at. An Inactive one is switched off, and kept, because sales name it. */
export const MachineStatuses = ['Active', 'Inactive'] as const;
export type MachineStatus = (typeof MachineStatuses)[number];

export const MachineLimits = { name: 60 } as const;

/** A PC the location's people sign in at (the `machines` table), the server PC among them. */
export interface Machine {
  id: string;
  /** Given when it's first recorded, and never changed: HQ-M01, or HQ-SRV for the server PC. */
  code: string;
  /** What the location calls it: "Counter 1". */
  name: string;
  /** Windows' name for the PC, as it last said. */
  computerName: string | null;
  /** The PC's hardware id (Windows' MachineGuid): how it's recognised after a rename. Null if it couldn't be read. */
  hardwareId: string | null;
  locationId: string;
  status: MachineStatus;
  description: string | null;
  /** The server PC: always switched on, since switching it off would lock its own screen out. */
  isServer: boolean;
}

/** What a manager decides for a machine. */
export interface MachineDetails {
  name: string;
  status: MachineStatus;
}

/** The code of a location's nth machine: HQ-M01, HQ-M02, … HQ-M100. */
export function machineCode(locationCode: string, number: number): string {
  return `${locationCode}-M${String(number).padStart(2, '0')}`;
}

/** What a machine is called until a manager names it: "New machine (COUNTER-PC)". */
export function newMachineName(computerName: string): string {
  return `New machine (${computerName.trim() || 'unnamed PC'})`.slice(0, MachineLimits.name);
}

/** The rules a machine's details meet before they're saved: tidied, or refused with what to fix. */
export function checkMachineDetails(details: { name: string; status: string }): MachineDetails {
  const name = details.name.trim();
  if (!name) throw new Refusal('invalid', 'A machine needs a name, such as "Counter 1".');
  if (name.length > MachineLimits.name) throw new Refusal('invalid', `A machine's name can be at most ${MachineLimits.name} characters.`);
  if (!MachineStatuses.includes(details.status as MachineStatus)) {
    throw new Refusal('invalid', `A machine is ${MachineStatuses.join(' or ')}, not "${details.status}".`);
  }
  return { name, status: details.status as MachineStatus };
}

/**
 * The machines a server knows. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * A PC is recognised by its hardware id, which survives renaming it. The first time an unknown
 * one signs in, it's recorded at the location by itself, with the next code and a name to change.
 */
export abstract class MachineBook {
  /** This PC as one of the location's machines, recorded now if it's new. Its computer name is kept up to date. */
  abstract recognise(pc: PcIdentity & { hardwareId: string }, locationId: string, lineage: Lineage): Promise<Machine>;
  /** The location's machines, the server PC first, then by code. */
  abstract list(locationId: string): Promise<Listed<Machine>[]>;
  abstract get(id: string): Promise<Machine | null>;
  /** Refuses switching the server PC off. */
  abstract update(id: string, details: MachineDetails, lineage: Lineage): Promise<Machine>;
}
