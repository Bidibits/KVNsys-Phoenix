import { Refusal } from '../../shared/domain/refusal.js';

export interface LocationRef {
  id: string;
  code: string;
  name: string;
  status: string;
}

/** A register or the server PC, with the location it belongs to. */
export interface MachineRecord {
  id: string;
  code: string;
  name: string;
  status: string;
  location: LocationRef;
}

/** A device can only be registered at a shop that is open. */
export function assertCanRegisterAt(location: LocationRef | null): asserts location is LocationRef {
  if (!location || location.status !== 'Active') {
    throw new Refusal('not-found', "That location doesn't exist or is closed. Pick another.");
  }
}

/** A machine counts as this device only while it is in service. */
export function isInService(machine: MachineRecord | null): machine is MachineRecord {
  return machine !== null && machine.status === 'Active';
}

/** What the code of the server PC itself is, at a given location: HQ-SRV, BR3-SRV. */
export function serverMachineCode(locationCode: string): string {
  return `${locationCode}-SRV`;
}
