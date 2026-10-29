import { rightsText, SetupStore, type Lineage, type SetupTransaction } from '@kvnsys/core';
import { auditValues, recordChanged, recordCreated } from '../audits/audit-log.js';
import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

function created(lineage: Lineage) {
  return {
    createdByUser: lineage.userId,
    createdAtMachine: lineage.machineId,
    createdAtLocation: lineage.locationId,
  };
}

/** Setting a shop up is KVNsys's doing, not a person's at a screen. */
const audited = (table: string, recordId: string, lineage: Lineage) => ({ table, recordId, lineage, source: 'Automatic' as const });

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
    const location = await this.db.location.create({ data: { id: row.id, code: row.code, name: row.name, ...created(row.lineage) } });
    await recordCreated(this.db, audited('locations', location.id, row.lineage), auditValues(location));
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
    const { lineage, ...details } = row;
    const machine = await this.db.machine.create({ data: { ...details, ...created(lineage) } });
    await recordCreated(this.db, audited('machines', machine.id, lineage), auditValues(machine));
  }

  async findRoleByCode(code: string) {
    const role = await this.db.role.findUnique({ where: { code }, include: { accesses: { select: { access: true } } } });
    return role ? { id: role.id, accesses: role.accesses.map((a) => a.access) } : null;
  }

  async createRole(row: { id: string; code: string; name: string; level: number; lineage: Lineage }) {
    const { lineage, ...details } = row;
    const role = await this.db.role.create({ data: { ...details, ...created(lineage) } });
    await recordCreated(this.db, audited('roles', role.id, lineage), auditValues(role));
  }

  /** Logged against the role, as the Roles screen's saves are: its rights before and after. */
  async addAccess(row: { id: string; roleId: string; access: string; description: string; lineage: Lineage }) {
    const { lineage, ...access } = row;
    const rights = async () => (await this.db.access.findMany({ where: { roleId: row.roleId }, select: { access: true } })).map((a) => a.access);
    const before = await rights();
    await this.db.access.create({ data: access });
    await recordChanged(this.db, audited('roles', row.roleId, lineage), { accesses: rightsText(before) }, { accesses: rightsText(await rights()) });
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
    const { lineage, ...details } = row;
    const user = await this.db.user.create({ data: { ...details, ...created(lineage) } });
    await recordCreated(this.db, audited('users', user.id, lineage), auditValues(user));
  }
}
