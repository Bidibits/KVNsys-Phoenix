import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaUserAccounts, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const someone = { userId: null, machineId: null, locationId: null };

describeWithDatabase('accounts in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let accounts: PrismaUserAccounts;
  let adminRole: string;
  let cashierRole: string;
  let adminId: string;

  async function role(code: string, name: string, rights: string[]): Promise<string> {
    const id = randomUUID();
    await db.role.create({ data: { id, code, name, level: rights.length } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: id, access } });
    return id;
  }

  const details = (username: string, roleId: string, status: 'Active' | 'Inactive' = 'Active') => ({
    username,
    firstName: username,
    middleName: null,
    lastName: 'Tester',
    roleId,
    status,
  });

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    accounts = new PrismaUserAccounts(db);
    adminRole = await role('ADMIN', 'Administrator', ['users.view', 'users.manage']);
    cashierRole = await role('CASHIER', 'Cashier', ['products.view']);
    adminId = (await accounts.create(details('admin', adminRole), 'hash-of-admin', someone)).id;
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('adds an account and lists it with its role, never with its password', async () => {
    const ana = await accounts.create({ ...details(' Ana ', cashierRole), firstName: 'Ana', middleName: 'Santos', lastName: 'Cruz' }, 'hash-of-ana', someone);
    expect(ana).toEqual({
      id: ana.id,
      username: 'ana',
      firstName: 'Ana',
      middleName: 'Santos',
      lastName: 'Cruz',
      displayName: 'Ana Santos Cruz',
      roleId: cashierRole,
      roleName: 'Cashier',
      status: 'Active',
    });
    // By last name: Cruz before Tester.
    expect((await accounts.list()).map((a) => a.username)).toEqual(['ana', 'admin']);
    expect(JSON.stringify(await accounts.list())).not.toContain('hash-of');
    expect((await db.user.findUniqueOrThrow({ where: { id: ana.id } })).passwordHash).toBe('hash-of-ana');
  });

  it("refuses a username another account has, ignoring capitals, and says whose it is", async () => {
    await expect(accounts.create(details('ADMIN', cashierRole), 'x', someone)).rejects.toMatchObject({
      kind: 'conflict',
      message: "admin is already admin Tester's username.",
    });
  });

  it('refuses a role that is not there', async () => {
    await expect(accounts.create(details('ben', randomUUID()), 'x', someone)).rejects.toMatchObject({ kind: 'invalid', message: /role isn't there/ });
    await expect(accounts.create(details('ben', 'not-an-id'), 'x', someone)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('changes an account, keeping its password, and records who did', async () => {
    const ben = await accounts.create(details('ben', cashierRole), 'hash-of-ben', someone);
    const by = { userId: adminId, machineId: null, locationId: null };
    const changed = await accounts.update(ben.id, { ...details('benjamin', cashierRole), status: 'Inactive' }, by);
    expect(changed).toMatchObject({ username: 'benjamin', status: 'Inactive' });
    expect(await db.user.findUniqueOrThrow({ where: { id: ben.id } })).toMatchObject({ passwordHash: 'hash-of-ben', updatedByUser: adminId });
  });

  it('never lets the last account that can manage users be switched off or lose that right', async () => {
    const lockedOut = /leave nobody able to manage users/;
    await expect(accounts.update(adminId, details('admin', adminRole, 'Inactive'), someone)).rejects.toMatchObject({ kind: 'conflict', message: lockedOut });
    await expect(accounts.update(adminId, details('admin', cashierRole), someone)).rejects.toMatchObject({ message: lockedOut });
    // Nothing was changed by either refusal.
    expect(await accounts.get(adminId)).toMatchObject({ status: 'Active', roleId: adminRole });
    // With a second account that can manage users, the first may step down.
    await accounts.create(details('owner', adminRole), 'x', someone);
    expect(await accounts.update(adminId, details('admin', cashierRole), someone)).toMatchObject({ roleName: 'Cashier' });
  });

  it('replaces a password on its own, and says so when the account has gone', async () => {
    await accounts.setPassword(adminId, 'a-new-hash', someone);
    expect((await db.user.findUniqueOrThrow({ where: { id: adminId } })).passwordHash).toBe('a-new-hash');
    await expect(accounts.setPassword(randomUUID(), 'x', someone)).rejects.toMatchObject({ kind: 'not-found' });
    await expect(accounts.update(randomUUID(), details('x', cashierRole), someone)).rejects.toMatchObject({ kind: 'not-found' });
    expect(await accounts.get('not-an-id')).toBeNull();
  });

  it('offers every role, highest first', async () => {
    expect((await accounts.roles()).map((r) => r.name)).toEqual(['Administrator', 'Cashier']);
  });
});
