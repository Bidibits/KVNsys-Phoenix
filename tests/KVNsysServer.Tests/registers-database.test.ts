import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import {
  addProduct,
  changeRegister,
  checkSession,
  getReceipt,
  listRegisters,
  openShift,
  recordSale,
  signIn,
  type ServerPin,
  type SessionPass,
} from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher, SignInEnded, type ServerCertificate } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const ServerPc = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };
const counter = { hardwareId: 'counter-pc-guid', computerName: 'COUNTER-PC' };
const backOffice = { hardwareId: 'back-office-guid', computerName: 'OFFICE-PC' };

describeWithDatabase('registers over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let certificate: ServerCertificate;
  let pin: ServerPin;
  let shopId: string;

  async function addUser(username: string, roleCode: string, rights: string[]): Promise<void> {
    const role = await db.role.create({ data: { id: randomUUID(), code: roleCode, name: roleCode, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName: username, lastName: 'Cruz', passwordHash, roleId: role.id } });
  }

  async function signInAt(username: string, register: typeof counter | null) {
    const result = await signIn(address, { username, password: Password }, { pin, register });
    if (!result.ok) throw new Error(result.message);
    return result;
  }

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Head Office',
      adminUsername: 'admin',
      adminPassword: Password,
      server: ServerPc,
    });
    shopId = (await db.location.findUniqueOrThrow({ where: { code: 'HQ' } })).id;
    await addUser('ana', 'CASHIER', ['sales.sell', 'sales.view']);
    await addUser('ben', 'LOOKER', ['machines.view']);

    certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate, server: ServerPc });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it('records a PC as a register of the shop the first time someone signs in at it, and knows it after', async () => {
    const first = await signInAt('ana', counter);
    expect(first.user.register).toEqual({ code: 'HQ-R01', name: 'New register (COUNTER-PC)' });
    expect((await signInAt('admin', counter)).user.register).toEqual({ code: 'HQ-R01', name: 'New register (COUNTER-PC)' });
    expect((await signInAt('admin', backOffice)).user.register).toMatchObject({ code: 'HQ-R02' });
    expect(await checkSession(address, first.session, { pin })).toMatchObject({ ok: true, user: { register: { code: 'HQ-R01' } } });
    expect(await db.machine.findUniqueOrThrow({ where: { code: 'HQ-R01' } })).toMatchObject({ locationId: shopId, machineUuid: 'counter-pc-guid' });
  });

  it("never records a PC for a wrong password, and a PC that can't read its id signs in at no register", async () => {
    const wrong = await signIn(address, { username: 'ana', password: 'not-it-at-all' }, { pin, register: { hardwareId: 'stranger', computerName: 'X' } });
    expect(wrong).toMatchObject({ ok: false });
    expect(await db.machine.findUnique({ where: { machineUuid: 'stranger' } })).toBeNull();
    expect((await signInAt('ana', null)).user.register).toBeNull();
  });

  it('records which register every save was made at, and names it on the receipt', async () => {
    const admin = await signInAt('admin', counter);
    const register = await db.machine.findUniqueOrThrow({ where: { code: 'HQ-R01' } });
    const added = await addProduct(address, admin.session, { code: 'PRD-0007', barcode: null, name: 'Sardines 155g', retailPrice: 2575, status: 'Active', description: null }, { pin });
    if (!added.ok) throw new Error(added.message);
    expect(await db.product.findUniqueOrThrow({ where: { id: added.product.id } })).toMatchObject({ createdAtMachine: register.id, createdAtLocation: shopId });

    const ana = await signInAt('ana', counter);
    expect(await openShift(address, ana.session, '500', { pin })).toMatchObject({ ok: true });
    const sold = await recordSale(address, ana.session, { cart: [{ product: added.product, quantity: 1 }], discount: null, tendered: '30' }, { pin });
    expect(sold).toMatchObject({ ok: true, register: 'New register (COUNTER-PC)' });
    if (!sold.ok) return;
    expect(await db.receipt.findUniqueOrThrow({ where: { id: sold.receipt.id } })).toMatchObject({ settledAtMachine: register.id });
    expect(await db.inventoryLog.findFirstOrThrow({ where: { sourceId: sold.receipt.id } })).toMatchObject({ createdAtMachine: register.id });

    const noRegister = await signInAt('ana', null);
    const elsewhere = await recordSale(address, noRegister.session, { cart: [{ product: added.product, quantity: 1 }], discount: null, tendered: '30' }, { pin });
    expect(elsewhere).toMatchObject({ ok: true, register: null });
  });

  it("lists the shop's registers, server first, renames one, and the receipts it rang show the new name", async () => {
    const admin = await signInAt('admin', backOffice);
    const listed = await listRegisters(address, admin.session, { pin });
    if (!listed.ok) throw new Error(listed.message);
    expect(listed.registers.map((r) => [r.code, r.isServer, r.computerName])).toEqual([
      ['HQ-SRV', true, 'TEST-SERVER'],
      ['HQ-R01', false, 'COUNTER-PC'],
      ['HQ-R02', false, 'OFFICE-PC'],
    ]);
    const r01 = listed.registers[1]!;
    expect(await changeRegister(address, admin.session, r01.id, { name: ' Counter 1 ', status: 'Active' }, { pin })).toMatchObject({ ok: true, register: { name: 'Counter 1' } });
    const receipt = await db.receipt.findFirstOrThrow({ where: { settledAtMachine: r01.id } });
    expect(await getReceipt(address, (await signInAt('ana', counter)).session, receipt.id, { pin })).toMatchObject({ ok: true, register: 'Counter 1' });
    expect((await signInAt('ana', counter)).user.register).toEqual({ code: 'HQ-R01', name: 'Counter 1' });
  });

  it("switches a register off: whoever is signed in there is signed out at once, and nobody can sign in there", async () => {
    const atCounter = await signInAt('ana', counter);
    const admin = await signInAt('admin', backOffice);
    const r01 = await db.machine.findUniqueOrThrow({ where: { code: 'HQ-R01' } });
    expect(await changeRegister(address, admin.session, r01.id, { name: 'Counter 1', status: 'Inactive' }, { pin })).toMatchObject({ ok: true });
    expect(await checkSession(address, atCounter.session, { pin })).toMatchObject({ ok: false, message: SignInEnded });
    expect(await checkSession(address, admin.session, { pin })).toMatchObject({ ok: true });
    expect(await signIn(address, { username: 'ana', password: Password }, { pin, register: counter })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'This register, Counter 1, is switched off. Ask a manager.',
    });
    expect(await changeRegister(address, admin.session, r01.id, { name: 'Counter 1', status: 'Active' }, { pin })).toMatchObject({ ok: true });
    expect((await signInAt('ana', counter)).user.register).toMatchObject({ code: 'HQ-R01' });
  });

  it("never switches the server PC off, and changes only this shop's registers, for a role that may", async () => {
    const admin = await signInAt('admin', backOffice);
    const server = await db.machine.findUniqueOrThrow({ where: { code: 'HQ-SRV' } });
    expect(await changeRegister(address, admin.session, server.id, { name: 'Server', status: 'Inactive' }, { pin })).toMatchObject({ ok: false, reason: 'refused', message: /^The server PC stays switched on/ });
    const branch = await db.location.create({ data: { id: randomUUID(), code: 'GUMACA', name: 'Gumaca' } });
    const theirs = await db.machine.create({ data: { id: randomUUID(), code: 'GUMACA-R01', name: 'Theirs', machineUuid: 'theirs', locationId: branch.id } });
    expect(await changeRegister(address, admin.session, theirs.id, { name: 'Mine now', status: 'Active' }, { pin })).toEqual({
      ok: false,
      reason: 'not-found',
      message: "That register isn't one of this shop's.",
    });
    expect((await listRegisters(address, admin.session, { pin })) as { registers: { code: string }[] }).not.toMatchObject({ registers: expect.arrayContaining([expect.objectContaining({ code: 'GUMACA-R01' })]) });

    const ben = await signInAt('ben', null);
    expect(await listRegisters(address, ben.session, { pin })).toMatchObject({ ok: true });
    expect(await changeRegister(address, ben.session, server.id, { name: 'X', status: 'Active' }, { pin })).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('machines.manage') });
    const ana = await signInAt('ana', counter);
    expect(await listRegisters(address, ana.session, { pin })).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('machines.view') });
  });
});
