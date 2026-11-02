import type { PcIdentity } from './machines.js';

/** A location: HQ or a branch (the `locations` table). */
export interface Location {
  id: string;
  code: string;
  name: string;
}

/**
 * The locations a server knows. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 */
export abstract class LocationDirectory {
  /**
   * The location this server serves: the one its own machine row belongs to, found the way the seed
   * finds that row (by hardware id first, so a renamed PC is still recognised, then by its code).
   * Null when this PC was never set up as the server.
   */
  abstract serverLocation(server: PcIdentity, machineCode: string): Promise<Location | null>;
}
