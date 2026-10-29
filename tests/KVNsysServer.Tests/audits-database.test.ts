import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { addProduct, listAudits, signIn, type ServerPin } from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const ServerPc = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };
const counter = { hardwareId: 'counter-pc-guid', computerName: 'COUNTER-PC' };
const any = { table: '', record: '', person: '', from: '', to: '' };

describeWithDatabase('the audit log over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let pin: ServerPin;

  async function signInAt(username: string) {
    const result = await signIn(address, { username, password: Password }, { pin, register: counter });
    if (!result.ok) throw new Error(result.message);
    return result;
  }

  beforeAll(async () => {
    database = await createThrowawayDatabase();
    db = createPrismaClient(database.url);
    await new InstallSeed(new PrismaSetupStore(db), new ScryptPasswordHasher()).run({
      locationCode: 'HQ',
      locationName: 'Kenlyn',
      adminUsername: 'admin',
      adminPassword: Password,
      server: ServerPc,
    });
    const role = await db.role.create({ data: { id: randomUUID(), code: 'CASHIER', name: 'Cashier', level: 10 } });
    await db.access.create({ data: { id: randomUUID(), roleId: role.id, access: 'sales.sell' } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username: 'ana', firstName: 'Ana', lastName: 'Cruz', passwordHash, roleId: role.id } });

    const certificate = await createServerCertificate();
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

  it("shows the Administrator every change, with who, where and the shop's own setup as KVNsys's", async () => {
    const admin = await signInAt('admin');
    const added = await addProduct(address, admin.session, { code: 'PRD-0007', barcode: null, name: 'Sardines 155g', retailPrice: 2575, status: 'Active', description: null }, { pin });
    if (!added.ok) throw new Error(added.message);

    const log = await listAudits(address, admin.session, any, { pin });
    if (!log.ok) throw new Error(log.message);
    expect(log.entries[0]).toMatchObject({ tableLabel: 'Products', recordName: 'Sardines 155g (PRD-0007)', userName: 'System Administrator (admin)', machineName: 'New register (COUNTER-PC)', shopName: 'Kenlyn' });
    expect(log.entries).toContainEqual(expect.objectContaining({ table: 'locations', columnLabel: 'Name', after: 'Kenlyn', source: 'Automatic', userName: null }));
    expect(log.byKVNsys).toBe(true);
    expect(log.people.map((p) => p.name)).toContain('System Administrator (admin)');
    expect(log.tables).toContainEqual({ name: 'machines', label: 'Machines' });

    const products = await listAudits(address, admin.session, { ...any, table: 'products' }, { pin });
    expect(products.ok && products.entries.every((entry) => entry.table === 'products')).toBe(true);
    const bySetup = await listAudits(address, admin.session, { ...any, person: 'kvnsys' }, { pin });
    expect(bySetup.ok && bySetup.entries.length > 0 && bySetup.entries.every((entry) => entry.userId === null)).toBe(true);
  });

  it("refuses someone whose role can't see the log, and a question it doesn't understand", async () => {
    const ana = await signInAt('ana');
    expect(await listAudits(address, ana.session, any, { pin })).toEqual({ ok: false, reason: 'not-allowed', message: lacksRight('audits.view') });
    const admin = await signInAt('admin');
    expect(await listAudits(address, admin.session, { ...any, table: 'receipts' }, { pin })).toMatchObject({
      ok: false,
      message: 'The audit log has no table called "receipts".',
    });
    expect(await listAudits(address, admin.session, { ...any, from: '2026-10-29', to: '2026-10-28' }, { pin })).toMatchObject({
      ok: false,
      message: 'The first day comes after the last one. Swap them round.',
    });
  });
});
