import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { AllAccesses } from '@kvnsys/core';
import { checkDatabase, createPrismaClient, knownMigrations, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import {
  createServer,
  createServerCertificate,
  InstallSeed,
  ScryptPasswordHasher,
  Sessions,
  SignInEnded,
  SwitchedOff,
  WrongCredentials,
  type ServerCertificate,
} from '@kvnsys/server';
import { SessionPath, SessionReply, SignInPath, SignInReply, SignOutPath, SignOutReply } from '@kvnsys/wire';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { httpsJson } from './https.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';

describeWithDatabase('sign-in and sessions, over HTTP, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let base: string;
  let certificate: ServerCertificate;

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
    certificate = await createServerCertificate();
    app = await createServer({ logger: false, databaseUrl: database.url, certificate });
    await app.listen(0, '127.0.0.1');
    base = `https://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  async function signIn(body: unknown) {
    const response = await httpsJson(base + SignInPath, { ca: certificate.cert, method: 'POST', body });
    return { status: response.status, reply: SignInReply.parse(response.body) };
  }

  /** Signs the administrator in and returns the pass. */
  async function signedInPass(): Promise<string> {
    const { reply } = await signIn({ username: 'admin', password: AdminPassword });
    if (!reply.signedIn) throw new Error(`Sign-in failed: ${reply.message}`);
    return reply.session.token;
  }

  const showing = (token?: string): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {});

  async function session(token?: string) {
    const response = await httpsJson(base + SessionPath, { ca: certificate.cert, headers: showing(token) });
    return { status: response.status, reply: SessionReply.parse(response.body) };
  }

  async function signOut(token?: string) {
    const response = await httpsJson(base + SignOutPath, { ca: certificate.cert, method: 'POST', headers: showing(token) });
    return { status: response.status, reply: SignOutReply.parse(response.body) };
  }

  it('says yes to the seeded administrator, with their name and role, and a pass', async () => {
    expect(await signIn({ username: 'admin', password: AdminPassword })).toEqual({
      status: 200,
      reply: {
        signedIn: true,
        user: { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN', rights: [...AllAccesses].sort(), register: null },
        session: { token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), expiresAt: expect.any(String) },
      },
    });
  });

  it('hands back a pass that later requests can show, to say who is asking', async () => {
    const { reply } = await signIn({ username: 'admin', password: AdminPassword });
    if (!reply.signedIn) throw new Error(reply.message);
    expect(await session(reply.session.token)).toEqual({
      status: 200,
      reply: { signedIn: true, user: reply.user, expiresAt: reply.session.expiresAt },
    });
  });

  it('turns away a request with no pass, or a made-up one', async () => {
    const ended = { status: 401, reply: { signedIn: false, message: SignInEnded } };
    expect(await session()).toEqual(ended);
    expect(await session('made-up-made-up-made-up-made-up-made-up-mad')).toEqual(ended);
  });

  it('cancels a pass at sign-out, so it stops working, and leaves other passes alone', async () => {
    const leaving = await signedInPass();
    const staying = await signedInPass();
    const before = app.get(Sessions).activeCount();
    expect(await signOut(leaving)).toEqual({ status: 200, reply: { signedOut: true } });
    expect(app.get(Sessions).activeCount()).toBe(before - 1);
    expect(await session(leaving)).toMatchObject({ status: 401 });
    expect(await session(staying)).toMatchObject({ status: 200 });
  });

  it('treats signing out twice, or with no pass at all, as signed out', async () => {
    const token = await signedInPass();
    const signedOut = { status: 200, reply: { signedOut: true } };
    expect(await signOut(token)).toEqual(signedOut);
    expect(await signOut(token)).toEqual(signedOut);
    expect(await signOut()).toEqual(signedOut);
  });

  it('gives no pass for a wrong password', async () => {
    const before = app.get(Sessions).activeCount();
    await signIn({ username: 'admin', password: 'not-the-password' });
    expect(app.get(Sessions).activeCount()).toBe(before);
  });

  it('says no to a wrong password, and the same no to a username that does not exist', async () => {
    const wrong = await signIn({ username: 'admin', password: 'not-the-password' });
    expect(wrong).toEqual({ status: 401, reply: { signedIn: false, message: WrongCredentials } });
    expect(await signIn({ username: 'nobody', password: 'whatever' })).toEqual(wrong);
  });

  it('asks for both a username and a password', async () => {
    expect(await signIn({ username: 'admin' })).toEqual({
      status: 400,
      reply: { signedIn: false, message: 'Type a username and a password.' },
    });
  });

  it('turns away a switched-off account', async () => {
    await db.user.update({ where: { username: 'admin' }, data: { status: 'Inactive' } });
    try {
      expect(await signIn({ username: 'admin', password: AdminPassword })).toEqual({
        status: 403,
        reply: { signedIn: false, message: SwitchedOff },
      });
    } finally {
      await db.user.update({ where: { username: 'admin' }, data: { status: 'Active' } });
    }
  });

  it('never sends the password hash back', async () => {
    const response = await httpsJson(base + SignInPath, {
      ca: certificate.cert,
      method: 'POST',
      body: { username: 'admin', password: AdminPassword },
    });
    expect(response.text).not.toMatch(/scrypt|passwordHash/i);
  });
});

describeWithDatabase('checkDatabase, which the server runs before it starts', () => {
  /** Runs `check` against a throwaway database, then drops it. */
  async function withDatabase(migrate: boolean, check: (db: PrismaClient) => Promise<void>) {
    const database = await createThrowawayDatabase({ migrate });
    const db = createPrismaClient(database.url);
    try {
      await check(db);
    } finally {
      await db.$disconnect();
      await database.drop();
    }
  }

  it('passes a database with exactly the updates this server ships with', async () => {
    await withDatabase(true, async (db) => {
      expect(knownMigrations().length).toBeGreaterThan(0);
      expect(await checkDatabase(db)).toEqual({ ok: true });
    });
  }, 120_000);

  it('turns down an empty database as not set up', async () => {
    await withDatabase(false, async (db) => {
      expect(await checkDatabase(db)).toMatchObject({ ok: false, problem: 'not-set-up' });
    });
  }, 120_000);

  it("isn't fooled by another program's database that happens to have a users table", async () => {
    await withDatabase(false, async (db) => {
      await db.$executeRawUnsafe('CREATE TABLE users (id serial PRIMARY KEY, email text)');
      expect(await checkDatabase(db)).toMatchObject({ ok: false, problem: 'not-set-up' });
    });
  }, 120_000);

  it('turns down a database that is missing an update', async () => {
    await withDatabase(true, async (db) => {
      expect(await checkDatabase(db, [...knownMigrations(), '29991231000000_from_the_future'])).toMatchObject({
        ok: false,
        problem: 'out-of-date',
        detail: '29991231000000_from_the_future',
      });
    });
  }, 120_000);

  it('turns down a database with updates this server has never heard of', async () => {
    await withDatabase(true, async (db) => {
      expect(await checkDatabase(db, [])).toMatchObject({ ok: false, problem: 'unrecognised' });
    });
  }, 120_000);

  // The same failure arrives in two shapes: a bare ECONNREFUSED for "localhost", and Prisma's own
  // sentence for "127.0.0.1". Both must come out as words a person can act on.
  it.each([
    ['localhost', /^nothing is answering at that address and port$/],
    ['127.0.0.1', /^Can't reach database server at 127\.0\.0\.1:1$/],
  ])('says it cannot reach a database that is not there (%s), and why, in plain words', async (host, reason) => {
    const db = createPrismaClient(`postgresql://postgres:x@${host}:1/nothing`);
    try {
      expect(await checkDatabase(db)).toMatchObject({ ok: false, problem: 'unreachable', detail: expect.stringMatching(reason) });
    } finally {
      await db.$disconnect();
    }
  });

  it("passes on PostgreSQL's own reason, such as a wrong password", async () => {
    const wrong = new URL(process.env.KVNSYS_TEST_POSTGRES_URL!);
    wrong.password = 'definitely-not-the-password';
    const db = createPrismaClient(wrong.toString());
    try {
      expect(await checkDatabase(db)).toMatchObject({
        ok: false,
        problem: 'unreachable',
        detail: expect.stringMatching(/password authentication failed/),
      });
    } finally {
      await db.$disconnect();
    }
  });
});
