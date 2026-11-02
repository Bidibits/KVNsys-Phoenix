import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { loadMySettings, saveMySettings, signIn, type ServerPin, type SessionPass, type UserSettings } from '@kvnsys/client';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, createServerCertificate, InstallSeed, ScryptPasswordHasher } from '@kvnsys/server';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const Password = 'test-password-1234';
const ServerPc = { hardwareId: 'test-hardware-id', computerName: 'TEST-SERVER' };
const None: UserSettings = { columnWidths: {} };

describeWithDatabase("a person's own settings over HTTPS, through the client engine, against a real database", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let address: string;
  let pin: ServerPin;

  async function addUser(username: string, roleCode: string, rights: string[]): Promise<void> {
    const role = await db.role.create({ data: { id: randomUUID(), code: roleCode, name: roleCode, level: 10 } });
    for (const access of rights) await db.access.create({ data: { id: randomUUID(), roleId: role.id, access } });
    const passwordHash = await new ScryptPasswordHasher().hash(Password);
    await db.user.create({ data: { id: randomUUID(), username, firstName: username, lastName: 'Cruz', passwordHash, roleId: role.id } });
  }

  async function passOf(username: string): Promise<SessionPass> {
    const result = await signIn(address, { username, password: Password }, { pin, machine: null });
    if (!result.ok) throw new Error(result.message);
    return result.session;
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
    // Ana's role holds no right at all: her own settings need none.
    await addUser('ana', 'NOTHING', []);
    await addUser('ben', 'LOOKER', ['machines.view']);

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

  it('reads none for someone who has changed nothing, and needs no right', async () => {
    expect(await loadMySettings(address, await passOf('ana'), { pin })).toEqual({ ok: true, settings: None });
  });

  it("keeps a person's widths, gives them back to that person alone, and replaces them whole", async () => {
    const ana = await passOf('ana');
    const settings: UserSettings = { columnWidths: { Machines: { Id: '8.5em', Name: '20em' } } };
    expect(await saveMySettings(address, ana, settings, { pin })).toEqual({ ok: true, settings });
    // A new sign-in, as at another machine, finds them; someone else doesn't.
    expect(await loadMySettings(address, await passOf('ana'), { pin })).toEqual({ ok: true, settings });
    expect(await loadMySettings(address, await passOf('ben'), { pin })).toEqual({ ok: true, settings: None });
    const fewer: UserSettings = { columnWidths: { Users: { Name: '12em' } } };
    await saveMySettings(address, ana, fewer, { pin });
    expect(await loadMySettings(address, ana, { pin })).toEqual({ ok: true, settings: fewer });
  });

  it("isn't written to the audit log: it's how one person likes the screens, not a record of the shop's", async () => {
    await saveMySettings(address, await passOf('ben'), { columnWidths: { Roles: { Name: '15em' } } }, { pin });
    expect(await db.audit.count({ where: { tableName: 'user_settings' } })).toBe(0);
  });

  it("refuses a width KVNsys can't keep, and settings that aren't settings, and keeps what it had", async () => {
    const ana = await passOf('ana');
    const kept: UserSettings = { columnWidths: { Products: { Code: '9em' } } };
    await saveMySettings(address, ana, kept, { pin });
    expect(await saveMySettings(address, ana, { columnWidths: { Machines: { Id: '9px' } } }, { pin })).toEqual({
      ok: false,
      reason: 'refused',
      message: `"9px" isn't a width KVNsys keeps: it's in em, from 3 to 80, such as "8.5em".`,
    });
    const notSettings = { columnWidths: { Machines: { Id: 9 } } } as unknown as UserSettings;
    expect(await saveMySettings(address, ana, notSettings, { pin })).toEqual({
      ok: false,
      reason: 'refused',
      message: "The settings didn't arrive in a form the server understands.",
    });
    expect(await loadMySettings(address, ana, { pin })).toEqual({ ok: true, settings: kept });
  });

  it('needs a pass, and someone still allowed to sign in', async () => {
    const stranger: SessionPass = { token: 'x'.repeat(43), expiresAt: new Date().toISOString() };
    expect(await loadMySettings(address, stranger, { pin })).toMatchObject({ ok: false, reason: 'ended' });
    const ben = await passOf('ben');
    await db.user.update({ where: { username: 'ben' }, data: { status: 'Inactive' } });
    expect(await saveMySettings(address, ben, { columnWidths: { Machines: { Id: '9em' } } }, { pin })).toMatchObject({ ok: false, reason: 'ended' });
    const benId = (await db.user.findUniqueOrThrow({ where: { username: 'ben' } })).id;
    expect(JSON.parse((await db.userSetting.findUniqueOrThrow({ where: { userId: benId } })).settings)).toEqual({ columnWidths: { Roles: { Name: '15em' } } });
  });
});
