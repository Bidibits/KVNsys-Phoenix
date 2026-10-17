import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma.service.js';
import { UserDirectory, type UserForSignIn } from '../application/ports.js';

@Injectable()
export class PrismaUserDirectory extends UserDirectory {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async findForSignIn(username: string): Promise<UserForSignIn | null> {
    const user = await this.prisma.db.user.findUnique({
      where: { username },
      include: { role: { include: { accesses: { select: { access: true } } } } },
    });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      passwordHash: user.passwordHash,
      status: user.status,
      role: {
        code: user.role.code,
        status: user.role.status,
        accesses: user.role.accesses.map((a) => a.access),
      },
    };
  }
}
