import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  checkSession,
  listRoles,
  loadRoleForm,
  loadUserForm,
  saveRoleForm,
  saveUserForm,
  signIn,
  type RoleForm,
  type ServerPin,
  type SessionPass,
} from '@kvnsys/client';
import { AllAccesses } from '@kvnsys/core';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher, SwitchedOff } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';
const AnaPassword = 'ana-good-password';

describeWithDatabase('roles over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let pin: ServerPin;
  let admin: SessionPass;
  let cashierId: string;

  const options = () => ({ pin });
  const signInAs = async (username: string, password: string) => {
    const result = await signIn(address, { username, password }, { pin });
    if (!result.ok) throw new Error(`${username} couldn't sign in: ${result.message}`);
    return result.session;
  };
  const cashierForm = (overrides: Partial<RoleForm> = {}): RoleForm => ({ name: 'Cashier', status: 'Active', rights: ['products.view'], ...overrides });

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: AdminPassword,
      server: { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' },
    });
    const certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    admin = await signInAs('admin', AdminPassword);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it('a new install lists only the Administrator, with every right', async () => {
    expect(await listRoles(address, admin, options())).toEqual({
      ok: true,
      roles: [
        {
          id: expect.any(String),
          code: 'ADMIN',
          name: 'Administrator',
          status: 'Active',
          rights: [...AllAccesses],
          rightsInWords: 'Every right',
          userCount: 1,
          fixed: true,
        },
      ],
    });
  });

  it('makes a cashier role from a blank form, and the account form then offers it', async () => {
    const blank = await loadRoleForm(address, admin, null, options());
    if (!blank.ok) throw new Error(blank.message);
    expect(blank.form).toEqual({ name: '', status: 'Active', rights: [] });
    expect(blank.groups.flatMap((g) => g.rights.map((r) => r.access)).sort()).toEqual([...AllAccesses].sort());

    const saved = await saveRoleForm(address, admin, null, cashierForm(), options());
    if (!saved.ok) throw new Error(saved.message);
    expect(saved.role).toMatchObject({ code: 'CASHIER', name: 'Cashier', rights: ['products.view'], userCount: 0, fixed: false });
    cashierId = saved.role.id;

    const userForm = await loadUserForm(address, admin, null, options());
    expect(userForm).toMatchObject({ ok: true, roles: [{ name: 'Administrator' }, { name: 'Cashier', id: cashierId }] });
  });

  it('gives the people with it just its rights: Roles says no to them', async () => {
    const added = await saveUserForm(
      address,
      admin,
      null,
      { username: 'ana', firstName: 'Ana', middleName: '', lastName: 'Cruz', roleId: cashierId, status: 'Active', password: AnaPassword, passwordAgain: AnaPassword },
      options(),
    );
    expect(added).toMatchObject({ ok: true });
    expect(await signIn(address, { username: 'ana', password: AnaPassword }, { pin })).toMatchObject({ ok: true, user: { rights: ['products.view'] } });
    const ana = await signInAs('ana', AnaPassword);
    expect(await listRoles(address, ana, options())).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('roles.view') });
    expect(await saveRoleForm(address, ana, null, cashierForm({ name: 'Mine' }), options())).toEqual({
      ok: false,
      reason: 'not-allowed',
      message: lacksRight('roles.manage'),
    });
  });

  it("a right given to a role works on its people's very next request", async () => {
    const ana = await signInAs('ana', AnaPassword);
    const changed = await saveRoleForm(address, admin, cashierId, cashierForm({ rights: ['products.view', 'roles.view'] }), options());
    expect(changed).toMatchObject({ ok: true, role: { rights: ['products.view', 'roles.view'], userCount: 1 } });
    expect(await listRoles(address, ana, options())).toMatchObject({ ok: true });
  });

  it('catches a missing name before sending, and the server refuses a taken one', async () => {
    expect(await saveRoleForm(address, admin, null, cashierForm({ name: '  ' }), options())).toEqual({ ok: false, reason: 'refused', message: 'A role needs a name.' });
    expect(await saveRoleForm(address, admin, null, cashierForm({ name: 'CASHIER' }), options())).toEqual({
      ok: false,
      reason: 'refused',
      message: "There's already a role called Cashier.",
    });
  });

  it('lets the Administrator be renamed, but never lose a right', async () => {
    const id = (await db.role.findUniqueOrThrow({ where: { code: 'ADMIN' } })).id;
    const form = await loadRoleForm(address, admin, id, options());
    if (!form.ok) throw new Error(form.message);
    expect(form).toMatchObject({ fixed: true, form: { name: 'Administrator', rights: [...AllAccesses] } });
    expect(await saveRoleForm(address, admin, id, { ...form.form, rights: ['products.view'] }, options())).toMatchObject({
      ok: false,
      reason: 'refused',
      message: expect.stringMatching(/always has every right/),
    });
    expect(await saveRoleForm(address, admin, id, { ...form.form, name: 'Owner' }, options())).toMatchObject({ ok: true, role: { name: 'Owner', fixed: true } });
    expect(await loadRoleForm(address, admin, randomUUID(), options())).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('switching a role off signs out everyone who has it, at once', async () => {
    const ana = await signInAs('ana', AnaPassword);
    expect(await saveRoleForm(address, admin, cashierId, cashierForm({ status: 'Inactive' }), options())).toMatchObject({ ok: true, role: { status: 'Inactive' } });
    expect(await checkSession(address, ana, { pin })).toMatchObject({ ok: false, reason: 'ended' });
    expect(await signIn(address, { username: 'ana', password: AnaPassword }, { pin })).toMatchObject({ ok: false, message: SwitchedOff });
    // The administrator, with another role, is still signed in.
    expect(await checkSession(address, admin, { pin })).toMatchObject({ ok: true });
  });
});
