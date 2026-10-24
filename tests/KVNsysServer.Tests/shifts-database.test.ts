import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { closeShift, currentShift, openShift, recordSale, signIn, type SaleProduct, type ServerPin, type SessionPass } from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, lacksRight, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const ServerPc = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };

describeWithDatabase('shifts over HTTPS, through the client engine, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let pin: ServerPin;
  let sardines: SaleProduct;
  const passes: Record<string, SessionPass> = {};
  const as = (username: string) => passes[username]!;
  const sell = (username: string, quantity: number) =>
    recordSale(address, as(username), { cart: [{ product: sardines, quantity }], discount: null, tendered: '1000' }, { pin });

  async function addUser(username: string, roleCode: string, rights: string[]) {
    const role = await db.role.create({ data: { id: randomUUID(), code: roleCode, name: roleCode, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName: username[0]!.toUpperCase() + username.slice(1), lastName: 'Cruz', passwordHash, roleId: role.id } });
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
    await addUser('ana', 'CASHIER', ['sales.sell']);
    await addUser('ben', 'CASHIER2', ['sales.sell']);
    await addUser('cora', 'STOCKMAN', ['stock.view']);
    const id = randomUUID();
    await db.product.create({ data: { id, code: 'PRD-0007', name: 'Sardines 155g', retailPrice: '25.00' } });
    sardines = { id, code: 'PRD-0007', name: 'Sardines 155g', retailPrice: 2500, status: 'Active' };

    const certificate = await createServerCertificate();
    pin = { fingerprint256: certificate.fingerprint256, certificate: certificate.cert };
    app = await createServer({ logger: false, databaseUrl: database.url, certificate, server: ServerPc });
    await app.listen(0, '127.0.0.1');
    address = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    for (const username of ['ana', 'ben', 'cora']) {
      const result = await signIn(address, { username, password: Password }, { pin });
      if (!result.ok) throw new Error(result.message);
      passes[username] = result.session;
    }
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  it('refuses to record a sale before the cashier starts a shift', async () => {
    expect(await currentShift(address, as('ana'), { pin })).toEqual({ ok: true, shift: null });
    expect(await sell('ana', 1)).toEqual({ ok: false, reason: 'refused', message: 'Start your shift first: count the cash in the drawer, then Start shift.' });
    expect(await db.receipt.count()).toBe(0);
  });

  it("starts a shift with the drawer's cash, and every sale goes into it", async () => {
    expect(await openShift(address, as('ana'), '1,000', { pin })).toMatchObject({ ok: true, shift: { code: 'HQ-S00001', openingCash: 100000, openedBy: 'Ana Cruz' } });
    expect(await openShift(address, as('ana'), '50', { pin })).toEqual({ ok: false, reason: 'refused', message: 'Your shift HQ-S00001 is still open. End it before starting another.' });
    await sell('ana', 2);
    await sell('ana', 1);
    expect(await currentShift(address, as('ana'), { pin })).toMatchObject({ ok: true, shift: { cashSales: 7500, receipts: 2, expectedCash: 107500 } });
    const shift = await db.shift.findUniqueOrThrow({ where: { code: 'HQ-S00001' } });
    expect(await db.receipt.count({ where: { shiftId: shift.id } })).toBe(2);
  });

  it("keeps each cashier's shift their own", async () => {
    expect(await openShift(address, as('ben'), '500', { pin })).toMatchObject({ ok: true, shift: { code: 'HQ-S00002' } });
    await sell('ben', 4);
    expect(await currentShift(address, as('ben'), { pin })).toMatchObject({ ok: true, shift: { cashSales: 10000, expectedCash: 60000 } });
    expect(await currentShift(address, as('ana'), { pin })).toMatchObject({ ok: true, shift: { cashSales: 7500 } });
  });

  it('ends a shift with the cash counted, against what the drawer should hold, and then no more sales go into it', async () => {
    const ended = await closeShift(address, as('ana'), '1,055', ' two coins rolled under the counter ', { pin });
    expect(ended).toMatchObject({
      ok: true,
      shift: {
        status: 'Closed',
        openingCash: 100000,
        cashSales: 7500,
        expectedCash: 107500,
        countedCash: 105500,
        variance: -2000,
        varianceInWords: '₱20.00 short',
        closedBy: 'Ana Cruz',
        note: 'two coins rolled under the counter',
      },
    });
    expect(await currentShift(address, as('ana'), { pin })).toEqual({ ok: true, shift: null });
    expect(await sell('ana', 1)).toMatchObject({ ok: false, message: /^Start your shift first/ });
    expect(await closeShift(address, as('ana'), '0', '', { pin })).toEqual({ ok: false, reason: 'refused', message: "You haven't a shift open to end." });
    expect(await openShift(address, as('ana'), '0', { pin })).toMatchObject({ ok: true, shift: { code: 'HQ-S00003' } });
  });

  it('leaves shifts to those who may sell', async () => {
    const refused = { ok: false, reason: 'not-allowed', message: lacksRight('sales.sell') };
    expect(await currentShift(address, as('cora'), { pin })).toEqual(refused);
    expect(await openShift(address, as('cora'), '100', { pin })).toEqual(refused);
  });
});
