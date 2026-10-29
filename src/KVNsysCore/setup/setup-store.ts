import type { Lineage } from '../shared/lineage.js';

/**
 * What the seed needs from the database, as one transaction's worth of reads and writes.
 * KVNsysCore only describes it; KVNsysPostgres provides the real one.
 */
export interface SetupTransaction {
  findLocationByCode(code: string): Promise<{ id: string } | null>;
  /** By hardware id first, so a renamed server is still recognised; then by code. */
  findServerMachine(hardwareId: string | null, code: string): Promise<{ id: string; code: string } | null>;
  createLocation(row: { id: string; code: string; name: string; lineage: Lineage }): Promise<void>;
  createMachine(row: {
    id: string;
    code: string;
    name: string;
    machineUuid: string | null;
    machineName: string;
    locationId: string;
    lineage: Lineage;
  }): Promise<void>;
  findRoleByCode(code: string): Promise<{ id: string; accesses: string[] } | null>;
  createRole(row: { id: string; code: string; name: string; level: number; lineage: Lineage }): Promise<void>;
  addAccess(row: { id: string; roleId: string; access: string; description: string; lineage: Lineage }): Promise<void>;
  countUsers(): Promise<number>;
  createUser(row: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    roleId: string;
    lineage: Lineage;
  }): Promise<void>;
}

export abstract class SetupStore {
  /** Runs all of `work` in one transaction: it all happens, or none of it does. */
  abstract transaction<T>(work: (tx: SetupTransaction) => Promise<T>): Promise<T>;
}
