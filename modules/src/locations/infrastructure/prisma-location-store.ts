import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service.js';
import { LocationStore } from '../application/ports.js';
import type { LocationRef } from '../domain/machine.js';

const ref = { id: true, code: true, name: true, status: true } as const;

@Injectable()
export class PrismaLocationStore extends LocationStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  find(id: string): Promise<LocationRef | null> {
    return this.prisma.db.location.findUnique({ where: { id }, select: ref });
  }

  listActive(): Promise<LocationRef[]> {
    return this.prisma.db.location.findMany({ where: { status: 'Active' }, select: ref, orderBy: { code: 'asc' } });
  }
}
