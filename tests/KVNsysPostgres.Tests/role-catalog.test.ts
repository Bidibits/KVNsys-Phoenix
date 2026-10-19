import { randomUUID } from 'node:crypto';
import { AllAccesses } from '@kvnsys/core';
import { createPrismaClient, PrismaRoleCatalog, PrismaUserAccounts, PrismaUserDirectory, type PrismaClient } from '@kvnsys/postgres';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const someone = { userId: null, machineId: null, locationId: null };

describeWithDatabase('roles in PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let roles: PrismaRoleCatalog;
  let accounts: PrismaUserAccounts;
  let adminRole: string;
  let adminId: string;

  const person = (username: string, roleId: string) => ({
    username,
    firstName: username,
    middleName: null,
    lastName: 'Tester',
    roleId,
    status: 'Active' as const,
  });

  beforeEach(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    roles = new PrismaRoleCatalog(db);
    accounts = new PrismaUserAccounts(db);
    // As an install made before roles.view existed: the Administrator's rows lack the newer rights.
    adminRole = randomUUID();
    await db.role.create({ data: { id: adminRole, code: 'ADMIN', name: 'Administrator', level: 100 } });
    await db.access.create({ data: { id: randomUUID(), roleId: adminRole, access: 'products.view' } });
    adminId = (await accounts.create(person('admin', adminRole), 'hash', someone)).id;
  });

  afterEach(async () => {
    await db.$disconnect();
    await database.drop();
  });

  it('counts every right for the Administrator, rows or not, at sign-in and on every request', async () => {
    const directory = new PrismaUserDirectory(db);
    expect((await directory.findForSignIn('admin'))?.role.accesses).toEqual([...AllAccesses]);
    expect((await directory.findStanding(adminId))?.role.accesses).toEqual([...AllAccesses]);
    expect(await roles.get(adminRole)).toMatchObject({ code: 'ADMIN', rights: [...AllAccesses], userCount: 1, fixed: true });
  });

  it('makes a role with the rights ticked, plus the ones they need, and lists it after the Administrator', async () => {
    const cashier = await roles.create({ name: ' Cashier ', status: 'Active', rights: ['products.manage'] }, { ...someone, userId: adminId });
    expect(cashier).toEqual({
      id: cashier.id,
      code: 'CASHIER',
      name: 'Cashier',
      status: 'Active',
      rights: ['products.view', 'products.manage'],
      userCount: 0,
      fixed: false,
    });
    expect((await db.role.findUniqueOrThrow({ where: { id: cashier.id } })).createdByUser).toBe(adminId);
    await roles.create({ name: 'Bodega', status: 'Active', rights: [] }, someone);
    expect((await roles.list()).map((r) => r.name)).toEqual(['Administrator', 'Bodega', 'Cashier']);
  });

  it("refuses a name another role has, ignoring capitals, and names it", async () => {
    await roles.create({ name: 'Cashier', status: 'Active', rights: [] }, someone);
    await expect(roles.create({ name: 'CASHIER', status: 'Active', rights: [] }, someone)).rejects.toMatchObject({
      kind: 'conflict',
      message: "There's already a role called Cashier.",
    });
    await expect(roles.create({ name: 'administrator', status: 'Active', rights: [] }, someone)).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('gives each new role its own code, never the Administrator\'s', async () => {
    const first = await roles.create({ name: 'Kahera!', status: 'Active', rights: [] }, someone);
    const second = await roles.create({ name: 'Kahera?', status: 'Active', rights: [] }, someone);
    const admin = await roles.create({ name: 'Admin', status: 'Active', rights: [] }, someone);
    expect([first.code, second.code, admin.code]).toEqual(['KAHERA', 'KAHERA_2', 'ADMIN_2']);
    expect(admin.fixed).toBe(false);
  });

  it('changes a role: renamed, rights added and taken away, code kept, and records who did', async () => {
    const role = await roles.create({ name: 'Cashier', status: 'Active', rights: ['products.view', 'users.view'] }, someone);
    const changed = await roles.update(role.id, { name: 'Kahera', status: 'Active', rights: ['products.view', 'roles.view'] }, { ...someone, userId: adminId });
    expect(changed).toMatchObject({ code: 'CASHIER', name: 'Kahera', rights: ['products.view', 'roles.view'] });
    expect((await db.access.findMany({ where: { roleId: role.id } })).map((a) => a.access).sort()).toEqual(['products.view', 'roles.view']);
    expect((await db.role.findUniqueOrThrow({ where: { id: role.id } })).updatedByUser).toBe(adminId);
    // Keeping its own name, in other capitals, is not a clash with itself.
    expect(await roles.update(role.id, { name: 'KAHERA', status: 'Active', rights: [] }, someone)).toMatchObject({ name: 'KAHERA', rights: [] });
  });

  it('lets the Administrator be renamed, never lose a right or be switched off', async () => {
    expect(await roles.update(adminRole, { name: 'Owner', status: 'Active', rights: [...AllAccesses] }, someone)).toMatchObject({ name: 'Owner', fixed: true });
    await expect(roles.update(adminRole, { name: 'Owner', status: 'Active', rights: ['products.view'] }, someone)).rejects.toMatchObject({
      kind: 'invalid',
      message: /always has every right/,
    });
    await expect(roles.update(adminRole, { name: 'Owner', status: 'Inactive', rights: [...AllAccesses] }, someone)).rejects.toMatchObject({
      message: /stays switched on/,
    });
    expect(await roles.get(adminRole)).toMatchObject({ name: 'Owner', status: 'Active', rights: [...AllAccesses] });
  });

  it('never lets a role change leave nobody able to manage users', async () => {
    const managers = await roles.create({ name: 'Managers', status: 'Active', rights: ['users.manage'] }, someone);
    const ana = await accounts.create(person('ana', managers.id), 'hash', someone);
    // The admin steps down, so Ana is the only one left who can manage users.
    await accounts.update(adminId, { ...person('admin', adminRole), status: 'Inactive' }, someone);
    const lockedOut = /leave nobody able to manage users/;
    await expect(roles.update(managers.id, { name: 'Managers', status: 'Active', rights: ['users.view'] }, someone)).rejects.toMatchObject({
      kind: 'conflict',
      message: lockedOut,
    });
    await expect(roles.update(managers.id, { name: 'Managers', status: 'Inactive', rights: ['users.manage'] }, someone)).rejects.toMatchObject({
      message: lockedOut,
    });
    // Both refusals were undone whole: the rights are as they were.
    expect(await roles.get(managers.id)).toMatchObject({ status: 'Active', rights: ['users.view', 'users.manage'], userCount: 1 });
    expect(await roles.memberIds(managers.id)).toEqual([ana.id]);
  });

  it("says so when the role isn't there", async () => {
    await expect(roles.update(randomUUID(), { name: 'X', status: 'Active', rights: [] }, someone)).rejects.toMatchObject({ kind: 'not-found' });
    expect(await roles.get('not-an-id')).toBeNull();
    expect(await roles.memberIds('not-an-id')).toEqual([]);
  });
});
