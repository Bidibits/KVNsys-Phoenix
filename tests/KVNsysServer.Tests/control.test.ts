import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createPlainServer, request } from 'node:http';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { createPrismaClient, PrismaSetupStore, type PrismaClient } from '@kvnsys/postgres';
import {
  ControlFile,
  createServer,
  createServerCertificate,
  DisconnectedAtServer,
  InstallSeed,
  lanAddresses,
  ScryptPasswordHasher,
  ServerVersion,
  startServerControl,
  type ServerCertificate,
  type ServerControl,
} from '@kvnsys/server';
import {
  configuredPort,
  disconnectPerson,
  serverStatus,
  setServerPassword,
  turnOffServerPassword,
} from '@kvnsys/server/control';
import { HelloPath, JoinPath, ProtocolVersion, SessionPath, SignInPath } from '@kvnsys/wire';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { httpsJson } from './https.js';
import { createThrowawayDatabase, describeWithDatabase } from './throwaway-database.js';

const freshDir = () => mkdtempSync(join(tmpdir(), 'kvnsys-control-'));

/** A raw request to the control channel, with whatever key a test chooses to show. */
function rawControl(port: number, key: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/status', headers: { Authorization: `Bearer ${key}` }, agent: false });
    req.on('error', reject);
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.end();
  });
}

/** Whether anything accepts a connection at this address and port. */
function answersAt(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 2000 });
    socket.once('connect', () => (socket.destroy(), resolve(true)));
    socket.once('error', () => resolve(false));
    socket.once('timeout', () => (socket.destroy(), resolve(false)));
  });
}

describe("the dashboard's channel to the running server", () => {
  let dataDir: string;
  let certificate: ServerCertificate;
  let app: INestApplication;
  let control: ServerControl;
  let base: string;

  beforeEach(async () => {
    dataDir = freshDir();
    certificate = await createServerCertificate();
    app = await createServer({ logger: false, certificate, dataDir });
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    base = `https://127.0.0.1:${port}`;
    control = await startServerControl(app, { dataDir, port });
  });

  afterEach(async () => {
    await control?.close();
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('says how the server is: its version, port, addresses, and nobody connected yet', async () => {
    const status = await serverStatus(dataDir);
    if (!status.ok) throw new Error(status.message);
    expect(status.value).toMatchObject({
      version: ServerVersion,
      protocol: ProtocolVersion,
      port: Number(new URL(base).port),
      addresses: lanAddresses(),
      serverPassword: 'off',
      connected: [],
    });
  });

  it('answers only a request showing this run’s key, which is new every run', async () => {
    const { key } = JSON.parse(readFileSync(join(dataDir, ControlFile), 'utf8')) as { key: string };
    expect((await rawControl(control.port, key)).status).toBe(200);
    const wrong = await rawControl(control.port, 'x'.repeat(key.length));
    expect(wrong.status).toBe(401);
    expect(wrong.text).not.toContain(ServerVersion);

    const second = await startServerControl(app, { dataDir, port: 1 });
    try {
      const { key: next } = JSON.parse(readFileSync(join(dataDir, ControlFile), 'utf8')) as { key: string };
      expect(next).not.toBe(key);
    } finally {
      await second.close();
    }
  });

  it("can't be reached from the shop's network: only on this PC", async () => {
    // Not skipped when this PC has no network address: then the test can't check, and says so by failing.
    const outside = lanAddresses();
    expect(outside.length).toBeGreaterThan(0);
    expect(await answersAt('127.0.0.1', control.port)).toBe(true);
    for (const address of outside) expect(await answersAt(address, control.port)).toBe(false);
  });

  it('turns the server password on, changes it and turns it off; registers see it in hello and at join', async () => {
    const hello = async () => (await httpsJson(base + HelloPath, { ca: certificate.cert })).body as { serverPassword: boolean };
    const join = (serverPassword?: string) => httpsJson(base + JoinPath, { ca: certificate.cert, method: 'POST', body: { serverPassword } });

    expect(await join()).toMatchObject({ status: 200, body: { joined: true } });
    expect(await setServerPassword(dataDir, 'short', 'short')).toMatchObject({ ok: false, reason: 'refused', message: expect.stringMatching(/8 characters/) });
    expect(await setServerPassword(dataDir, 'shop-door-1234', 'shop-door-1234')).toEqual({ ok: true, value: true });
    expect((await hello()).serverPassword).toBe(true);
    expect(await join()).toMatchObject({ status: 401, body: { joined: false, message: 'This server has a password. Type it to connect.' } });
    expect(await join('shop-door-9999')).toMatchObject({ status: 401, body: { joined: false } });
    expect(await join('shop-door-1234')).toMatchObject({ status: 200, body: { joined: true } });
    expect((await serverStatus(dataDir)).ok && (await serverStatus(dataDir))).toMatchObject({ value: { serverPassword: 'on' } });

    expect(await setServerPassword(dataDir, 'new-door-5678', 'new-door-5678')).toEqual({ ok: true, value: true });
    expect(await join('shop-door-1234')).toMatchObject({ status: 401 });
    expect(await join('new-door-5678')).toMatchObject({ status: 200 });

    expect(await turnOffServerPassword(dataDir)).toEqual({ ok: true, value: true });
    expect((await hello()).serverPassword).toBe(false);
    expect(await join()).toMatchObject({ status: 200 });
  });

  it('keeps the server password through a restart of the server', async () => {
    await setServerPassword(dataDir, 'shop-door-1234', 'shop-door-1234');
    const restarted = await createServer({ logger: false, certificate, dataDir });
    await restarted.listen(0, '127.0.0.1');
    try {
      const port = (restarted.getHttpServer().address() as AddressInfo).port;
      const hello = await httpsJson(`https://127.0.0.1:${port}${HelloPath}`, { ca: certificate.cert });
      expect(hello.body).toMatchObject({ serverPassword: true });
    } finally {
      await restarted.close();
    }
  });

  it('takes its key out of the folder when it closes, and then the dashboard sees the server as off', async () => {
    await control.close();
    expect(existsSync(join(dataDir, ControlFile))).toBe(false);
    expect(await serverStatus(dataDir)).toMatchObject({ ok: false, reason: 'off', message: "KVNsys Server isn't running." });
  });
});

describe('the dashboard, when the server is not there to answer', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = freshDir();
  });
  afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

  it('sees it as off when it never ran, when its file is damaged, or when the file is left from a run that ended', async () => {
    expect(await serverStatus(dataDir)).toMatchObject({ ok: false, reason: 'off' });
    writeFileSync(join(dataDir, ControlFile), 'garbage');
    expect(await serverStatus(dataDir)).toMatchObject({ ok: false, reason: 'off' });

    // Another program now has the port the old file names, and doesn't know the key.
    const other = createPlainServer((_req, res) => res.writeHead(401).end());
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    try {
      writeFileSync(join(dataDir, ControlFile), JSON.stringify({ port: (other.address() as AddressInfo).port, key: 'k'.repeat(43) }));
      expect(await serverStatus(dataDir)).toMatchObject({ ok: false, reason: 'off' });
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });

  it('reads the port registers use from the settings file, or the usual one', () => {
    expect(configuredPort(dataDir)).toBe(9000);
    writeFileSync(join(dataDir, 'server.env'), 'KVNSYS_PORT=9107\n');
    expect(configuredPort(dataDir)).toBe(9107);
    writeFileSync(join(dataDir, 'server.env'), 'KVNSYS_PORT=not-a-port\n');
    expect(configuredPort(dataDir)).toBe(9000);
  });
});

const AdminPassword = 'test-admin-password';

describeWithDatabase("who's connected, disconnecting, and signing in with the server password, against a real database", () => {
  let database: Awaited<ReturnType<typeof createThrowawayDatabase>>;
  let db: PrismaClient;
  let dataDir: string;
  let certificate: ServerCertificate;
  let app: INestApplication;
  let control: ServerControl;
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
    dataDir = freshDir();
    certificate = await createServerCertificate();
    app = await createServer({ logger: false, databaseUrl: database.url, certificate, dataDir });
    await app.listen(0, '127.0.0.1');
    const port = (app.getHttpServer().address() as AddressInfo).port;
    base = `https://127.0.0.1:${port}`;
    control = await startServerControl(app, { dataDir, port });
  }, 120_000);

  afterAll(async () => {
    await control?.close();
    await app?.close();
    await db?.$disconnect();
    await database?.drop();
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  async function signIn(computerName: string, extra: Record<string, unknown> = {}) {
    const response = await httpsJson(base + SignInPath, {
      ca: certificate.cert,
      method: 'POST',
      body: { username: 'admin', password: AdminPassword, register: { hardwareId: `hw-${computerName}`, computerName }, ...extra },
    });
    return response as { status: number; body: { signedIn: boolean; message?: string; serverPassword?: true; session?: { token: string } } };
  }
  const sessionOf = (token: string) => httpsJson(base + SessionPath, { ca: certificate.cert, headers: { Authorization: `Bearer ${token}` } });

  it('lists each sign-in with its register, never its pass, and disconnects one', async () => {
    const front = (await signIn('FRONT-PC')).body.session!.token;
    const back = (await signIn('BACK-PC')).body.session!.token;

    const status = await serverStatus(dataDir);
    if (!status.ok) throw new Error(status.message);
    expect(status.value.connected.map((person) => [person.username, person.register?.name])).toEqual([
      ['admin', 'New register (FRONT-PC)'],
      ['admin', 'New register (BACK-PC)'],
    ]);
    expect(JSON.stringify(status.value)).not.toContain(front);

    const frontId = status.value.connected[0]!.id;
    expect(await disconnectPerson(dataDir, frontId)).toEqual({ ok: true, value: true });
    expect(await sessionOf(front)).toMatchObject({ status: 401, body: { signedIn: false, message: DisconnectedAtServer } });
    expect(await sessionOf(back)).toMatchObject({ status: 200 });
    expect(await disconnectPerson(dataDir, frontId)).toMatchObject({ ok: false, reason: 'refused', message: 'That person had already signed out.' });
  });

  it('asks for the server password before the person’s, and leaves those already signed in alone', async () => {
    const before = (await signIn('BEFORE-PC')).body.session!.token;
    await setServerPassword(dataDir, 'shop-door-1234', 'shop-door-1234');
    try {
      expect(await signIn('FRONT-PC')).toMatchObject({ status: 401, body: { signedIn: false, serverPassword: true } });
      expect(await signIn('FRONT-PC', { serverPassword: 'shop-door-9999' })).toMatchObject({
        status: 401,
        body: { serverPassword: true, message: "That isn't this server's password." },
      });
      // A wrong person with no server password learns nothing about the person: it's the server password that's asked for.
      expect(await signIn('FRONT-PC', { password: 'not-the-password' })).toMatchObject({ status: 401, body: { serverPassword: true } });
      expect(await signIn('FRONT-PC', { serverPassword: 'shop-door-1234' })).toMatchObject({ status: 200, body: { signedIn: true } });
      expect(await sessionOf(before)).toMatchObject({ status: 200 });
    } finally {
      await turnOffServerPassword(dataDir);
    }
    expect(await signIn('FRONT-PC')).toMatchObject({ status: 200 });
  });
});
