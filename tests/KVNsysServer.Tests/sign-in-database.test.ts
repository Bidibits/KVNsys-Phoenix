import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { checkDatabase, createPrismaClient, knownMigrations, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import { createServer, InstallSeed, ScryptPasswordHasher, SwitchedOff, WrongCredentials } from '@kvnsys/server';
import { SignInPath, SignInReply } from '@kvnsys/wire';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const AdminPassword = 'test-admin-password';

describeWithDatabase('sign-in, over HTTP, against a real database', () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let app: INestApplication;
  let base: string;

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
    app = await createServer({ logger: false, databaseUrl: database.url });
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
  });

  async function signIn(body: unknown) {
    const response = await fetch(base + SignInPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, reply: SignInReply.parse(await response.json()) };
  }

  it('says yes to the seeded administrator, with their name and role', async () => {
    expect(await signIn({ username: 'admin', password: AdminPassword })).toEqual({
      status: 200,
      reply: { signedIn: true, user: { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN' } },
    });
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
    const response = await fetch(base + SignInPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: AdminPassword }),
    });
    expect(await response.text()).not.toMatch(/scrypt|passwordHash/i);
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
