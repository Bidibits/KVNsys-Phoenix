import {
  MachineBook,
  machineCode,
  newId,
  newMachineName,
  Refusal,
  type Lineage,
  type Listed,
  type Machine,
  type MachineDetails,
  type MachineStatus,
  type PcIdentity,
} from '@kvnsys/core';
import { auditValues, recordChanged, recordCreated, type AuditedSave } from '../audits/audit-log.js';
import { listedWithHistory } from '../audits/record-history.js';
import type { Machine as MachineRow, PrismaClient } from '../generated/prisma/client.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NotThere = "That machine isn't there any more.";

/** The seed gives the server PC its shop's code and -SRV; the other machines get -M01 and up. */
const isServerCode = (code: string) => code.endsWith('-SRV');

function toMachine(row: MachineRow): Machine {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    computerName: row.machineName,
    hardwareId: row.machineUuid,
    locationId: row.locationId,
    status: row.status as MachineStatus,
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

/** A PC recording itself, or its new Windows name, is KVNsys's doing; a change on the Machines screen is a person's. */
const audited = (recordId: string, lineage: Lineage, source: AuditedSave['source']): AuditedSave => ({ table: 'machines', recordId, lineage, source });

/** Machines, kept in PostgreSQL's machines table, beside the server PC the seed recorded. */
export class PrismaMachineBook extends MachineBook {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async recognise(pc: PcIdentity & { hardwareId: string }, locationId: string, lineage: Lineage): Promise<Machine> {
    const known = await this.db.machine.findUnique({ where: { machineUuid: pc.hardwareId } });
    if (known) {
      if (known.machineName === pc.computerName) return toMachine(known);
      // Renamed in Windows since: still the same PC, and the list shows its name now.
      return this.db.$transaction(async (tx) => {
        const row = await tx.machine.update({ where: { id: known.id }, data: { machineName: pc.computerName, ...updated(lineage) } });
        await recordChanged(tx, audited(known.id, lineage, 'Automatic'), auditValues(known), auditValues(row));
        return toMachine(row);
      });
    }
    if (!Uuid.test(locationId)) throw new Refusal('not-found', "That shop isn't known here.");

    return this.db.$transaction(async (tx) => {
      // One new machine at a time per shop takes the next code, so two PCs signing in for the first
      // time together never get the same one.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`machines:${locationId}`}))`;
      const again = await tx.machine.findUnique({ where: { machineUuid: pc.hardwareId } });
      if (again) return toMachine(again);
      const shop = await tx.location.findUnique({ where: { id: locationId }, select: { code: true } });
      if (!shop) throw new Refusal('not-found', "That shop isn't known here.");
      const prefix = `${shop.code}-M`;
      const taken = await tx.machine.findMany({ where: { locationId, code: { startsWith: prefix } }, select: { code: true } });
      const numbers = taken.map((row) => Number(row.code.slice(prefix.length))).filter((n) => Number.isSafeInteger(n) && n > 0);
      const row = await tx.machine.create({
        data: {
          id: newId(),
          code: machineCode(shop.code, Math.max(0, ...numbers) + 1),
          name: newMachineName(pc.computerName),
          machineUuid: pc.hardwareId,
          machineName: pc.computerName,
          locationId,
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
        },
      });
      await recordCreated(tx, audited(row.id, lineage, 'Automatic'), auditValues(row));
      return toMachine(row);
    });
  }

  async list(locationId: string): Promise<Listed<Machine>[]> {
    if (!Uuid.test(locationId)) return [];
    // The server PC first, then the machines by code.
    const rows = (await this.db.machine.findMany({ where: { locationId }, orderBy: { code: 'asc' } })).sort(
      (a, b) => Number(isServerCode(b.code)) - Number(isServerCode(a.code)),
    );
    return listedWithHistory(this.db, rows, rows.map(toMachine));
  }

  async get(id: string): Promise<Machine | null> {
    if (!Uuid.test(id)) return null;
    const row = await this.db.machine.findUnique({ where: { id } });
    return row ? toMachine(row) : null;
  }

  async update(id: string, details: MachineDetails, lineage: Lineage): Promise<Machine> {
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
      return toMachine(row);
    });
  }
}
