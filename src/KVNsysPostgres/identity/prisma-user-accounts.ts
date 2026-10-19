import {
  accountDisplayName,
  checkAccountDetails,
  newId,
  Refusal,
  UserAccounts,
  type Account,
  type AccountDetails,
  type AccountStatus,
  type Lineage,
  type RoleChoice,
} from '@kvnsys/core';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { requireSomeoneWhoCanManageUsers } from './user-managers.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NotFound = "That account isn't there any more.";

type Row = Prisma.UserGetPayload<{ include: { role: { select: { name: true } } } }>;

function toAccount(row: Row): Account {
  return {
    id: row.id,
    username: row.username,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    displayName: accountDisplayName(row),
    roleId: row.roleId,
    roleName: row.role.name,
    status: row.status as AccountStatus,
  };
}

const withRole = { role: { select: { name: true } } } as const;

/**
 * Accounts, kept in PostgreSQL. KVNsysCore's rules (checkAccountDetails) are checked before every save;
 * the ones here are those only the database can check.
 */
export class PrismaUserAccounts extends UserAccounts {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async list(): Promise<Account[]> {
    const rows = await this.db.user.findMany({ include: withRole, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { username: 'asc' }] });
    return rows.map(toAccount);
  }

  async get(id: string): Promise<Account | null> {
    if (!Uuid.test(id)) return null;
    const row = await this.db.user.findUnique({ where: { id }, include: withRole });
    return row ? toAccount(row) : null;
  }

  roles(): Promise<RoleChoice[]> {
    return this.db.role.findMany({ select: { id: true, name: true, status: true }, orderBy: [{ level: 'desc' }, { name: 'asc' }] });
  }

  create(typed: AccountDetails, passwordHash: string, lineage: Lineage): Promise<Account> {
    const details = checkAccountDetails(typed);
    return this.saving(async (tx) => {
      await refuseTaken(tx, details.username, null);
      await requireRole(tx, details.roleId);
      const row = await tx.user.create({
        data: {
          id: newId(),
          ...details,
          passwordHash,
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
        },
        include: withRole,
      });
      await requireSomeoneWhoCanManageUsers(tx);
      return toAccount(row);
    });
  }

  update(id: string, typed: AccountDetails, lineage: Lineage): Promise<Account> {
    const details = checkAccountDetails(typed);
    return this.saving(async (tx) => {
      if (!Uuid.test(id) || !(await tx.user.findUnique({ where: { id }, select: { id: true } }))) throw new Refusal('not-found', NotFound);
      await refuseTaken(tx, details.username, id);
      await requireRole(tx, details.roleId);
      const row = await tx.user.update({ where: { id }, data: { ...details, ...updated(lineage) }, include: withRole });
      await requireSomeoneWhoCanManageUsers(tx);
      return toAccount(row);
    });
  }

  async setPassword(id: string, passwordHash: string, lineage: Lineage): Promise<void> {
    if (!Uuid.test(id)) throw new Refusal('not-found', NotFound);
    const { count } = await this.db.user.updateMany({ where: { id }, data: { passwordHash, ...updated(lineage) } });
    if (count === 0) throw new Refusal('not-found', NotFound);
  }

  /** One transaction per save; the unique index on usernames has the last word if two saves race. */
  private async saving(work: (tx: Prisma.TransactionClient) => Promise<Account>): Promise<Account> {
    try {
      return await this.db.$transaction(work);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Refusal('conflict', 'Another account already has that username.');
      }
      throw error;
    }
  }
}

function updated(lineage: Lineage) {
  return {
    updatedByUser: lineage.userId,
    updatedAtMachine: lineage.machineId,
    updatedAtLocation: lineage.locationId,
    updatedAtDate: new Date(),
  };
}

/** A username is one person's, ignoring capitals: the refusal names whose it is. */
async function refuseTaken(tx: Prisma.TransactionClient, username: string, ownId: string | null) {
  const others = await tx.$queryRaw<{ first_name: string; middle_name: string | null; last_name: string }[]>`
    SELECT first_name, middle_name, last_name FROM users
     WHERE lower(username) = lower(${username}) AND (${ownId}::uuid IS NULL OR id <> ${ownId}::uuid)
     LIMIT 1`;
  const other = others[0];
  if (other) {
    const name = accountDisplayName({ firstName: other.first_name, middleName: other.middle_name, lastName: other.last_name });
    throw new Refusal('conflict', `${username} is already ${name}'s username.`);
  }
}

async function requireRole(tx: Prisma.TransactionClient, roleId: string) {
  if (!Uuid.test(roleId) || !(await tx.role.findUnique({ where: { id: roleId }, select: { id: true } }))) {
    throw new Refusal('invalid', "That role isn't there any more. Choose another.");
  }
}
