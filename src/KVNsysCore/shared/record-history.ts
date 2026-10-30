/**
 * Who made a record and who changed it last: when, who, on which machine, at which shop, by name.
 * It's the eight lineage columns every SCHEMA-PLAN table carries (updated_* and created_*), read
 * back for people. The lists show it at the end of every row, as Beta's and Release's grids did.
 */
export interface RecordHistory {
  /** When it was made, by the server's clock: an ISO date and time. */
  createdAt: string;
  /** Who made it: their name and username. Null when KVNsys made it itself, setting the shop up or recording a PC. */
  createdBy: string | null;
  /** The machine it was made on, by name. */
  createdMachine: string | null;
  /** The shop it was made at, by name. */
  createdShop: string | null;
  /** When it was last changed. Null if it never has been, and then so are the three below. */
  updatedAt: string | null;
  updatedBy: string | null;
  updatedMachine: string | null;
  updatedShop: string | null;
}

/** A record as a list shows it: the record, and its history. */
export type Listed<T> = T & { history: RecordHistory };

/**
 * Named in place of a person, machine or shop this server has no record of. The lineage columns
 * aren't foreign keys (schema.prisma says why): a product made at HQ will reach a branch naming
 * HQ's people and machines.
 */
export const NotOnThisServer = 'Not on this server';
