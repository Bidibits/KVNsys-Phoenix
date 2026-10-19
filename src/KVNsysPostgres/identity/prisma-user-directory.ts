import { roleRights, UserDirectory, type UserForSignIn, type UserStanding } from '@kvnsys/core';
import type { PrismaClient } from '../generated/prisma/client.js';

export class PrismaUserDirectory extends UserDirectory {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async findForSignIn(username: string): Promise<UserForSignIn | null> {
    const user = await this.db.user.findUnique({
      where: { username },
      include: { role: { select: { code: true, status: true, accesses: { select: { access: true } } } } },
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
      role: standingOf(user.role),
    };
  }

  async findStanding(userId: string): Promise<UserStanding | null> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { status: true, role: { select: { code: true, status: true, accesses: { select: { access: true } } } } },
    });
    if (!user) return null;
    return {
      status: user.status,
      role: standingOf(user.role),
    };
  }
}

type RoleRow = { code: string; status: string; accesses: { access: string }[] };

/** A role's rights as KVNsysCore counts them: the Administrator holds every right, whatever its rows say. */
function standingOf(role: RoleRow): UserStanding['role'] {
  return { code: role.code, status: role.status, accesses: roleRights(role.code, role.accesses.map((a) => a.access)) };
}
