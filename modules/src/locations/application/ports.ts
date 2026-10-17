import type { Lineage } from '../../shared/domain/lineage.js';
import type { LocationRef, MachineRecord } from '../domain/machine.js';

/** Makes the random token a registered browser keeps, and the hash the server stores instead. */
export abstract class DeviceTokens {
  abstract mint(): { token: string; hash: string };
  abstract hash(token: string): string;
}

export interface NewRegister {
  id: string;
  code: string;
  name: string;
  locationId: string;
  deviceTokenHash: string;
  lineage: Lineage;
}

export abstract class MachineStore {
  abstract findByDeviceTokenHash(hash: string): Promise<MachineRecord | null>;
  abstract codeTaken(code: string): Promise<boolean>;
  /** Refuses with a conflict if the code was taken in the meantime. */
  abstract createRegister(register: NewRegister): Promise<MachineRecord>;
}

export abstract class LocationStore {
  abstract find(id: string): Promise<LocationRef | null>;
  abstract listActive(): Promise<LocationRef[]>;
}
