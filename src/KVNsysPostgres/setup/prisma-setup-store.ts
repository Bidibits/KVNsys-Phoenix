import { SetupStore, type Lineage, type SetupTransaction } from '@kvnsys/core';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

function created(lineage: Lineage) {
  return {
    createdByUser: lineage.userId,
    createdAtMachine: lineage.machineId,
    createdAtLocation: lineage.locationId,
  };
}

/** The seed's reads and writes, all in one database transaction. */
export class PrismaSetupStore extends SetupStore {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  transaction<T>(work: (tx: SetupTransaction) => Promise<T>): Promise<T> {
    return this.db.$transaction((tx) => work(new PrismaSetupTransaction(tx)));
  }
}

class PrismaSetupTransaction implements SetupTransaction {
  constructor(private readonly db: Prisma.TransactionClient) {}

  findLocationByCode(code: string) {
    return this.db.location.findUnique({ where: { code }, select: { id: true } });
  }

  async findServerMachine(hardwareId: string | null, code: string) {
    const select = { id: true, code: true } as const;
    if (hardwareId) {
      const byHardware = await this.db.machine.findUnique({ where: { machineUuid: hardwareId }, select });
      if (byHardware) return byHardware;
    }
    return this.db.machine.findUnique({ where: { code }, select });
  }

  async createLocation(row: { id: string; code: string; name: string; lineage: Lineage }) {
    await this.db.location.create({ data: { id: row.id, code: row.code, name: row.name, ...created(row.lineage) } });
  }

  async createMachine(row: {
    id: string;
    code: string;
    name: string;
    machineUuid: string | null;
    machineName: string;
    locationId: string;
    lineage: Lineage;
  }) {
    const { lineage, ...machine } = row;
    await this.db.machine.create({ data: { ...machine, ...created(lineage) } });
  }

  async findRoleByCode(code: string) {
    const role = await this.db.role.findUnique({ where: { code }, include: { accesses: { select: { access: true } } } });
    return role ? { id: role.id, accesses: role.accesses.map((a) => a.access) } : null;
  }

  async createRole(row: { id: string; code: string; name: string; level: number; lineage: Lineage }) {
    const { lineage, ...role } = row;
    await this.db.role.create({ data: { ...role, ...created(lineage) } });
  }

  async addAccess(row: { id: string; roleId: string; access: string; description: string }) {
    await this.db.access.create({ data: row });
  }

  countUsers() {
    return this.db.user.count();
  }

  async createUser(row: {
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    passwordHash: string;
    roleId: string;
    lineage: Lineage;
  }) {
    const { lineage, ...user } = row;
    await this.db.user.create({ data: { ...user, ...created(lineage) } });
  }
}
