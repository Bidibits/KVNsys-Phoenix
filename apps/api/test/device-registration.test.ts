import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@phoenix/database';
import { newId, ScryptPasswordHasher, WrongCredentials } from '@phoenix/modules';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createPhoenixApp } from '../src/create-app.js';
import { AdminPassword, describeWithDatabase, freshTestDatabase } from './test-database.js';

/** The value of one cookie from a response's Set-Cookie headers. */
function cookieValue(response: request.Response, name: string): string | undefined {
  const headers = response.headers['set-cookie'] as unknown as string[] | undefined;
  const line = headers?.find((h) => h.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.split(';')[0]!.slice(name.length + 1)) : undefined;
}

describeWithDatabase('device registration, end to end over HTTP', () => {
  let app: INestApplication;
  let db: PrismaClient;
  let hqId: string;
  let adminId: string;

  beforeAll(async () => {
    const url = await freshTestDatabase();
    db = createPrismaClient(url);
    hqId = (await db.location.findUniqueOrThrow({ where: { code: 'HQ' } })).id;
    adminId = (await db.user.findUniqueOrThrow({ where: { username: 'admin' } })).id;

    const cashierRole = await db.role.findUniqueOrThrow({ where: { code: 'CASHIER' } });
    await db.user.create({
      data: {
        id: newId(),
        username: 'cashier',
        firstName: 'Carla',
        lastName: 'Reyes',
        passwordHash: await new ScryptPasswordHasher().hash('cashier-password'),
        roleId: cashierRole.id,
      },
    });

    app = await createPhoenixApp({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });

  /** A fresh browser: its own cookie jar. */
  const browser = () => request.agent(app.getHttpServer());

  const signIn = (agent: ReturnType<typeof browser>, username = 'admin', password = AdminPassword) =>
    agent.post('/api/auth/sign-in').send({ username, password });

  it('tells a new browser it is not registered', async () => {
    const response = await browser().get('/api/devices/me').expect(200);
    expect(response.body).toEqual({ registered: false });
  });

  it('refuses registration and the location list to someone not signed in', async () => {
    const agent = browser();
    const refused = await agent.post('/api/devices/register').send({ locationId: hqId, code: 'X-1', name: 'X' }).expect(401);
    expect(refused.body).toEqual({ statusCode: 401, message: 'Sign in first.' });
    await agent.get('/api/locations').expect(401);
  });

  it('answers a wrong password and an unknown username identically', async () => {
    const wrong = await signIn(browser(), 'admin', 'not-the-password').expect(401);
    const unknown = await signIn(browser(), 'nobody', 'whatever').expect(401);
    expect(wrong.body.message).toBe(WrongCredentials);
    expect(unknown.body).toEqual(wrong.body);
  });

  it("refuses a cashier, whose role can't register devices", async () => {
    const agent = browser();
    await signIn(agent, 'cashier', 'cashier-password').expect(200);
    const refused = await agent.post('/api/devices/register').send({ locationId: hqId, code: 'X-1', name: 'X' }).expect(403);
    expect(refused.body.message).toMatch(/Your role can't do this/);
  });

  it('registers a device: the browser keeps a token, the database keeps only its hash, stamped with who and where', async () => {
    const agent = browser();
    const signedIn = await signIn(agent).expect(200);
    expect(signedIn.body).toMatchObject({ username: 'admin', roleCode: 'ADMIN', displayName: 'System Administrator' });

    const locations = await agent.get('/api/locations').expect(200);
    expect(locations.body).toEqual([{ id: hqId, code: 'HQ', name: 'Head Office' }]);

    const registered = await agent
      .post('/api/devices/register')
      .send({ locationId: hqId, code: 'front-1', name: 'Front counter 1' })
      .expect(201);
    expect(registered.body).toMatchObject({ code: 'FRONT-1', name: 'Front counter 1', location: { code: 'HQ' } });

    const token = cookieValue(registered, 'phoenix_device');
    expect(token).toBeDefined();
    const cookieLine = (registered.headers['set-cookie'] as unknown as string[]).find((h) => h.startsWith('phoenix_device='))!;
    expect(cookieLine).toMatch(/HttpOnly/i);
    expect(cookieLine).toMatch(/SameSite=Strict/i);

    const status = await agent.get('/api/devices/me').expect(200);
    expect(status.body).toMatchObject({ registered: true, machine: { code: 'FRONT-1', location: { code: 'HQ' } } });

    const row = await db.machine.findUniqueOrThrow({ where: { code: 'FRONT-1' } });
    expect(row.deviceTokenHash).toBe(createHash('sha256').update(token!).digest('hex'));
    expect(row.deviceTokenHash).not.toBe(token);
    expect(row.machineName).toBeNull();
    expect({ by: row.createdByUser, on: row.createdAtMachine, at: row.createdAtLocation }).toEqual({
      by: adminId,
      on: row.id,
      at: hqId,
    });

    const again = await agent.post('/api/devices/register').send({ locationId: hqId, code: 'FRONT-9', name: 'Again' }).expect(409);
    expect(again.body.message).toMatch(/already registered as FRONT-1/);
  });

  it('refuses a code another register already has', async () => {
    const agent = browser();
    await signIn(agent).expect(200);
    const taken = await agent.post('/api/devices/register').send({ locationId: hqId, code: 'FRONT-1', name: 'Dup' }).expect(409);
    expect(taken.body.message).toMatch(/already used/);
  });

  it('refuses a malformed request with a message a person can act on', async () => {
    const agent = browser();
    await signIn(agent).expect(200);
    const bad = await agent.post('/api/devices/register').send({ locationId: hqId, code: 'no spaces!', name: 'X' }).expect(400);
    expect(bad.body.message).toMatch(/letters, digits or dashes/);
  });

  it('does not accept a forged device cookie', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/devices/me')
      .set('Cookie', 'phoenix_device=made-up-token')
      .expect(200);
    expect(response.body).toEqual({ registered: false });
  });

  it('signs out', async () => {
    const agent = browser();
    await signIn(agent).expect(200);
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/sign-out').expect(200);
    await agent.get('/api/auth/me').expect(401);
  });
});
