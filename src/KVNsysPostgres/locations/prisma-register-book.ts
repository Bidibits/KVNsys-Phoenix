import {
  newId,
  newRegisterName,
  Refusal,
  RegisterBook,
  registerCode,
  type Lineage,
  type Listed,
  type PcIdentity,
  type Register,
  type RegisterDetails,
  type RegisterStatus,
} from '@kvnsys/core';
import { auditValues, recordChanged, recordCreated, type AuditedSave } from '../audits/audit-log.js';
import { listedWithHistory } from '../audits/record-history.js';
import type { Machine, PrismaClient } from '../generated/prisma/client.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NotThere = "That register isn't there any more.";

/** The seed gives the server PC its shop's code and -SRV; registers get -R01 and up. */
const isServerCode = (code: string) => code.endsWith('-SRV');

function toRegister(row: Machine): Register {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    computerName: row.machineName,
    hardwareId: row.machineUuid,
    locationId: row.locationId,
    status: row.status as RegisterStatus,
    description: row.description,
    isServer: isServerCode(row.code),
  };
}

const updated = (lineage: Lineage) => ({
  updatedByUser: lineage.userId,
  updatedAtMachine: lineage.machineId,
  updatedAtLocation: lineage.locationId,
  updatedAtDate: new Date(),
});

/** A PC recording itself, or its new Windows name, is KVNsys's doing; a change on the Registers screen is a person's. */
const audited = (recordId: string, lineage: Lineage, source: AuditedSave['source']): AuditedSave => ({ table: 'machines', recordId, lineage, source });

/** Registers, kept in PostgreSQL's machines table, beside the server PC the seed recorded. */
export class PrismaRegisterBook extends RegisterBook {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async recognise(pc: PcIdentity & { hardwareId: string }, locationId: string, lineage: Lineage): Promise<Register> {
    const known = await this.db.machine.findUnique({ where: { machineUuid: pc.hardwareId } });
    if (known) {
      if (known.machineName === pc.computerName) return toRegister(known);
      // Renamed in Windows since: still the same PC, and the list shows its name now.
      return this.db.$transaction(async (tx) => {
        const row = await tx.machine.update({ where: { id: known.id }, data: { machineName: pc.computerName, ...updated(lineage) } });
        await recordChanged(tx, audited(known.id, lineage, 'Automatic'), auditValues(known), auditValues(row));
        return toRegister(row);
      });
    }
    if (!Uuid.test(locationId)) throw new Refusal('not-found', "That shop isn't known here.");

    return this.db.$transaction(async (tx) => {
      // One new register at a time per shop takes the next code, so two PCs signing in for the first
      // time together never get the same one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`registers:${locationId}`}))`;
      const again = await tx.machine.findUnique({ where: { machineUuid: pc.hardwareId } });
      if (again) return toRegister(again);
      const shop = await tx.location.findUnique({ where: { id: locationId }, select: { code: true } });
      if (!shop) throw new Refusal('not-found', "That shop isn't known here.");
      const prefix = `${shop.code}-R`;
      const taken = await tx.machine.findMany({ where: { locationId, code: { startsWith: prefix } }, select: { code: true } });
      const numbers = taken.map((row) => Number(row.code.slice(prefix.length))).filter((n) => Number.isSafeInteger(n) && n > 0);
      const row = await tx.machine.create({
        data: {
          id: newId(),
          code: registerCode(shop.code, Math.max(0, ...numbers) + 1),
          name: newRegisterName(pc.computerName),
          machineUuid: pc.hardwareId,
          machineName: pc.computerName,
          locationId,
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
        },
      });
      await recordCreated(tx, audited(row.id, lineage, 'Automatic'), auditValues(row));
      return toRegister(row);
    });
  }

  async list(locationId: string): Promise<Listed<Register>[]> {
    if (!Uuid.test(locationId)) return [];
    // The server PC first, then the registers by code.
    const rows = (await this.db.machine.findMany({ where: { locationId }, orderBy: { code: 'asc' } })).sort(
      (a, b) => Number(isServerCode(b.code)) - Number(isServerCode(a.code)),
    );
    return listedWithHistory(this.db, rows, rows.map(toRegister));
  }

  async get(id: string): Promise<Register | null> {
    if (!Uuid.test(id)) return null;
    const row = await this.db.machine.findUnique({ where: { id } });
    return row ? toRegister(row) : null;
  }

  async update(id: string, details: RegisterDetails, lineage: Lineage): Promise<Register> {
    const current = await this.get(id);
    if (!current) throw new Refusal('not-found', NotThere);
    if (current.isServer && details.status !== 'Active') {
      throw new Refusal('invalid', 'The server PC stays switched on: switching it off would lock its own screen out. Only its name can change.');
    }
    return this.db.$transaction(async (tx) => {
      const before = await tx.machine.findUnique({ where: { id } });
      if (!before) throw new Refusal('not-found', NotThere);
      const row = await tx.machine.update({ where: { id }, data: { name: details.name, status: details.status, ...updated(lineage) } });
      await recordChanged(tx, audited(id, lineage, 'Manual'), auditValues(before), auditValues(row));
      return toRegister(row);
    });
  }
}
