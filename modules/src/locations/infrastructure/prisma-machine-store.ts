import { Inject, Injectable } from '@nestjs/common';
import { Refusal } from '../../shared/domain/refusal.js';
import { isUniqueViolation, PrismaService } from '../../shared/infrastructure/prisma.service.js';
import { MachineStore, type NewRegister } from '../application/ports.js';
import type { MachineRecord } from '../domain/machine.js';

const withLocation = { location: { select: { id: true, code: true, name: true, status: true } } } as const;

@Injectable()
export class PrismaMachineStore extends MachineStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async findByDeviceTokenHash(hash: string): Promise<MachineRecord | null> {
    const machine = await this.prisma.db.machine.findUnique({ where: { deviceTokenHash: hash }, include: withLocation });
    return machine ? toRecord(machine) : null;
  }

  async codeTaken(code: string): Promise<boolean> {
    return (await this.prisma.db.machine.count({ where: { code } })) > 0;
  }

  async createRegister(register: NewRegister): Promise<MachineRecord> {
    try {
      const machine = await this.prisma.db.machine.create({
        data: {
          id: register.id,
          code: register.code,
          name: register.name,
          locationId: register.locationId,
          deviceTokenHash: register.deviceTokenHash,
          createdByUser: register.lineage.userId,
          createdAtMachine: register.lineage.machineId,
          createdAtLocation: register.lineage.locationId,
        },
        include: withLocation,
      });
      return toRecord(machine);
    } catch (error) {
      // Two managers registering the same code at the same moment: the second loses here.
      if (isUniqueViolation(error)) {
        throw new Refusal('conflict', `The code ${register.code} is already used by another machine. Pick another.`);
      }
      throw error;
    }
  }
}

function toRecord(machine: {
  id: string;
  code: string;
  name: string;
  status: string;
  location: MachineRecord['location'];
}): MachineRecord {
  return { id: machine.id, code: machine.code, name: machine.name, status: machine.status, location: machine.location };
}
