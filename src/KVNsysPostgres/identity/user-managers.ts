import { Accesses, AdminRoleCode, Refusal } from '@kvnsys/core';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Checked after every account or role save, inside its transaction: at least one active account
 * whose active role may manage users. Otherwise nobody could add, fix or switch on an account again,
 * so the save is refused and undone. The Administrator counts whatever its rows say (roleRights).
 */
export async function requireSomeoneWhoCanManageUsers(tx: Prisma.TransactionClient): Promise<void> {
  const rows = await tx.$queryRaw<{ managers: number }[]>`
    SELECT count(*)::int AS managers
      FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status = 'Active' AND r.status = 'Active'
       AND (r.code = ${AdminRoleCode}
            OR EXISTS (SELECT 1 FROM accesses a WHERE a.role_id = r.id AND a.access = ${Accesses.UsersManage}))`;
  if ((rows[0]?.managers ?? 0) === 0) {
    throw new Refusal(
      'conflict',
      "That would leave nobody able to manage users. Keep at least one active account whose role can manage users.",
    );
  }
}
