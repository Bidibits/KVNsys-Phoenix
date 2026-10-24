import type { PcIdentity } from './machines.js';

/** A shop: HQ or a branch (the `locations` table). */
export interface Shop {
  id: string;
  code: string;
  name: string;
}

/**
 * The shops a server knows. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 */
export abstract class ShopDirectory {
  /**
   * The shop this server serves: the one its own machine row belongs to, found the way the seed
   * finds that row (by hardware id first, so a renamed PC is still recognised, then by its code).
   * Null when this PC was never set up as the server.
   */
  abstract serverShop(server: PcIdentity, machineCode: string): Promise<Shop | null>;
}
