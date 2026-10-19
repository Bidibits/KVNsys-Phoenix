import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  checkSession,
  listUsers,
  loadUserForm,
  resetPassword,
  saveUserForm,
  signIn,
  type ServerPin,
  type SessionPass,
  type UserForm,
} from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';

describeWithDatabase('accounts over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let pin: ServerPin;
  let admin: SessionPass;
  let cashierRole: string;

  const options = () => ({ pin });
  const signInAs = async (username: string, password: string) => {
    const result = await signIn(address, { username, password }, { pin });
    if (!result.ok) throw new Error(`${username} couldn't sign in: ${result.message}`);
    return result.session;
  };
  const newForm = (username: string, overrides: Partial<UserForm> = {}): UserForm => ({
    username,
    firstName: username,
    middleName: '',
    lastName: 'Tester',
    roleId: cashierRole,
    status: 'Active',
    password: 'a-good-password',
    passwordAgain: 'a-good-password',
    ...overrides,
  });

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
    // A new install has only the Administrator: the shop makes its own roles.
    cashierRole = randomUUID();
    await db.role.create({ data: { id: cashierRole, code: 'CASHIER', name: 'Cashier', level: 10 } });
    await db.access.create({ data: { id: randomUUID(), roleId: cashierRole, access: 'products.view' } });

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

  it('a new install has only the administrator, as the only account', async () => {
    const result = await listUsers(address, admin, options());
    expect(result).toMatchObject({ ok: true, users: [{ username: 'admin', roleName: 'Administrator', status: 'Active' }] });
    expect(await db.role.count()).toBe(2); // the Administrator, and the cashier role this test made
  });

  it('offers the roles to choose from, and starts a new account on the first one', async () => {
    const form = await loadUserForm(address, admin, null, options());
    if (!form.ok) throw new Error(form.message);
    expect(form.roles.map((r) => r.name)).toEqual(['Administrator', 'Cashier']);
    expect(form.form).toMatchObject({ username: '', status: 'Active', roleId: form.roles[0]!.id });
  });

  it('adds a cashier, who can then sign in as themselves, with their role\'s rights', async () => {
    const saved = await saveUserForm(address, admin, null, newForm('Ana', { firstName: 'Ana', lastName: 'Cruz' }), options());
    expect(saved).toMatchObject({ ok: true, user: { username: 'ana', displayName: 'Ana Cruz', roleName: 'Cashier' } });
    const signedIn = await signIn(address, { username: 'ANA', password: 'a-good-password' }, { pin });
    expect(signedIn).toMatchObject({ ok: true, user: { username: 'ana', roleCode: 'CASHIER', rights: ['products.view'] } });
  });

  it('catches mismatched passwords before sending anything, and the server refuses a taken username', async () => {
    expect(await saveUserForm(address, admin, null, newForm('ben', { passwordAgain: 'something-else' }), options())).toMatchObject({
      ok: false,
      reason: 'refused',
      message: "Those two passwords didn't match. Type them again.",
    });
    expect(await saveUserForm(address, admin, null, newForm('Ana'), options())).toMatchObject({
      ok: false,
      reason: 'refused',
      message: "ana is already Ana Cruz's username.",
    });
  });

  it("doesn't let a cashier see or change accounts", async () => {
    const ana = await signInAs('ana', 'a-good-password');
    expect(await listUsers(address, ana, options())).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('users.view') });
  });

  it('resets a password: the old one stops working, and every pass that person held ends', async () => {
    const ana = await signInAs('ana', 'a-good-password');
    const id = (await db.user.findUniqueOrThrow({ where: { username: 'ana' } })).id;
    expect(await resetPassword(address, admin, id, 'short', 'short', options())).toMatchObject({ ok: false, reason: 'refused' });
    expect(await resetPassword(address, admin, id, 'a-brand-new-password', 'a-brand-new-password', options())).toEqual({ ok: true });
    expect(await checkSession(address, ana, { pin })).toMatchObject({ ok: false, reason: 'ended' });
    expect(await signIn(address, { username: 'ana', password: 'a-good-password' }, { pin })).toMatchObject({ ok: false });
    expect(await signIn(address, { username: 'ana', password: 'a-brand-new-password' }, { pin })).toMatchObject({ ok: true });
  });

  it('switching an account off ends its passes at once', async () => {
    const ana = await signInAs('ana', 'a-brand-new-password');
    const id = (await db.user.findUniqueOrThrow({ where: { username: 'ana' } })).id;
    const form = await loadUserForm(address, admin, id, options());
    if (!form.ok) throw new Error(form.message);
    expect(form.form).toMatchObject({ username: 'ana', password: '' });
    expect(await saveUserForm(address, admin, id, { ...form.form, status: 'Inactive' }, options())).toMatchObject({ ok: true, user: { status: 'Inactive' } });
    expect(await checkSession(address, ana, { pin })).toMatchObject({ ok: false, reason: 'ended' });
  });

  it('refuses to switch off the only account that can manage users', async () => {
    const id = (await db.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;
    const form = await loadUserForm(address, admin, id, options());
    if (!form.ok) throw new Error(form.message);
    expect(await saveUserForm(address, admin, id, { ...form.form, status: 'Inactive' }, options())).toMatchObject({
      ok: false,
      reason: 'refused',
      message: expect.stringMatching(/leave nobody able to manage users/),
    });
    expect(await listUsers(address, admin, options())).toMatchObject({ ok: true });
  });
});
