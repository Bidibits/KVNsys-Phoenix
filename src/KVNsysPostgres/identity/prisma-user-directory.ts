import { UserDirectory, type UserForSignIn } from '@kvnsys/core';
import type { PrismaClient } from '../generated/prisma/client.js';

export class PrismaUserDirectory extends UserDirectory {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async findForSignIn(username: string): Promise<UserForSignIn | null> {
    const user = await this.db.user.findUnique({
      where: { username },
      include: { role: { select: { code: true, status: true } } },
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
      role: user.role,
    };
  }
}
