import { ShopDirectory, type PcIdentity, type Shop } from '@kvnsys/core';
import type { PrismaClient } from '../generated/prisma/client.js';

export class PrismaShopDirectory extends ShopDirectory {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async serverShop(server: PcIdentity, machineCode: string): Promise<Shop | null> {
    const select = { location: { select: { id: true, code: true, name: true } } } as const;
    const byHardware = server.hardwareId ? await this.db.machine.findUnique({ where: { machineUuid: server.hardwareId }, select }) : null;
    const machine = byHardware ?? (await this.db.machine.findUnique({ where: { code: machineCode }, select }));
    return machine?.location ?? null;
  }
}
