import {
  AdminRoleCode,
  checkRoleChange,
  checkRoleDetails,
  isFixedRole,
  newId,
  Refusal,
  RoleCatalog,
  roleCodeFor,
  rightsText,
  roleRights,
  type Lineage,
  type Role,
  type RoleDetails,
  type RoleStatus,
} from '@kvnsys/core';
import { auditValues, recordChanged, recordCreated } from '../audits/audit-log.js';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { requireSomeoneWhoCanManageUsers } from './user-managers.js';

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NotFound = "That role isn't there any more.";

const withRights = { accesses: { select: { access: true } }, _count: { select: { users: true } } } as const;
type Row = Prisma.RoleGetPayload<{ include: typeof withRights }>;

function toRole(row: Row): Role {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status as RoleStatus,
    rights: roleRights(row.code, row.accesses.map((a) => a.access)),
    userCount: row._count.users,
    fixed: isFixedRole(row.code),
  };
}

/**
 * Roles and the rights each holds, kept in PostgreSQL. KVNsysCore's rules (checkRoleDetails,
 * checkRoleChange) are checked before every save; the ones here are those only the database can check.
 */
export class PrismaRoleCatalog extends RoleCatalog {
  constructor(private readonly db: PrismaClient) {
    super();
  }

  async list(): Promise<Role[]> {
    const rows = await this.db.role.findMany({ include: withRights, orderBy: [{ level: 'desc' }, { name: 'asc' }] });
    return rows.map(toRole);
  }

  async get(id: string): Promise<Role | null> {
    if (!Uuid.test(id)) return null;
    const row = await this.db.role.findUnique({ where: { id }, include: withRights });
    return row ? toRole(row) : null;
  }

  async create(typed: RoleDetails, lineage: Lineage): Promise<Role> {
    const details = checkRoleDetails(typed);
    return this.db.$transaction(async (tx) => {
      await refuseNameTaken(tx, details.name, null);
      const row = await tx.role.create({
        data: {
          id: newId(),
          code: await freeCode(tx, roleCodeFor(details.name)),
          name: details.name,
          status: details.status,
          createdByUser: lineage.userId,
          createdAtMachine: lineage.machineId,
          createdAtLocation: lineage.locationId,
          accesses: { create: details.rights.map((access) => ({ id: newId(), access })) },
        },
        include: withRights,
      });
      await recordCreated(tx, audited(row.id, lineage), roleValues(row));
      return toRole(row);
    });
  }

  async update(id: string, typed: RoleDetails, lineage: Lineage): Promise<Role> {
    const details = checkRoleDetails(typed);
    return this.db.$transaction(async (tx) => {
      const existing = Uuid.test(id) ? await tx.role.findUnique({ where: { id }, include: withRights }) : null;
      if (!existing) throw new Refusal('not-found', NotFound);
      checkRoleChange(existing.code, details);
      await refuseNameTaken(tx, details.name, id);
      await tx.role.update({
        where: { id },
        data: {
          name: details.name,
          status: details.status,
          updatedByUser: lineage.userId,
          updatedAtMachine: lineage.machineId,
          updatedAtLocation: lineage.locationId,
          updatedAtDate: new Date(),
        },
      });
      // The Administrator's rights come from roleRights, not its rows, so they're left as they are.
      if (!isFixedRole(existing.code)) {
        await tx.access.deleteMany({ where: { roleId: id, access: { notIn: details.rights } } });
        await tx.access.createMany({
          data: details.rights.map((access) => ({ id: newId(), roleId: id, access })),
          skipDuplicates: true,
        });
      }
      await requireSomeoneWhoCanManageUsers(tx);
      const row = await tx.role.findUniqueOrThrow({ where: { id }, include: withRights });
      await recordChanged(tx, audited(id, lineage), roleValues(existing), roleValues(row));
      return toRole(row);
    });
  }

  async memberIds(id: string): Promise<string[]> {
    if (!Uuid.test(id)) return [];
    const rows = await this.db.user.findMany({ where: { roleId: id }, select: { id: true } });
    return rows.map((row) => row.id);
  }
}

/** Every save here is a person's, through the Roles screen. */
const audited = (recordId: string, lineage: Lineage) => ({ table: 'roles', recordId, lineage, source: 'Manual' as const });

/** A role's columns, and the rights its access rows give it, as the log keeps them. */
const roleValues = (row: Row) => ({ ...auditValues(row), accesses: rightsText(row.accesses.map((a) => a.access)) });

/** A role's name is its own, ignoring capitals: the refusal names the one that has it. */
async function refuseNameTaken(tx: Prisma.TransactionClient, name: string, ownId: string | null) {
  const others = await tx.$queryRaw<{ name: string }[]>`
    SELECT name FROM roles
     WHERE lower(name) = lower(${name}) AND (${ownId}::uuid IS NULL OR id <> ${ownId}::uuid)
     LIMIT 1`;
  const other = others[0];
  if (other) throw new Refusal('conflict', `There's already a role called ${other.name}.`);
}

/** The code wanted, or with _2, _3… after it when that's taken. The Administrator's code is never handed out. */
async function freeCode(tx: Prisma.TransactionClient, wanted: string): Promise<string> {
  const taken = new Set((await tx.role.findMany({ where: { code: { startsWith: wanted } }, select: { code: true } })).map((r) => r.code));
  taken.add(AdminRoleCode);
  if (!taken.has(wanted)) return wanted;
  for (let n = 2; ; n++) if (!taken.has(`${wanted}_${n}`)) return `${wanted}_${n}`;
}
