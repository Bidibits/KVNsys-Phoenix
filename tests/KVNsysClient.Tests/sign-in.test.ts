import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { signIn, type ServerPin } from '@kvnsys/client';
import { createServerCertificate, type ServerCertificate } from '@kvnsys/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

/** A stand-in server that answers sign-ins with whatever a test needs, and counts what reaches it. */
async function fakeServer(certificate: ServerCertificate, status: number, reply: unknown) {
  const received: string[] = [];
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert }, (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push(Buffer.concat(chunks).toString('utf8'));
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(typeof reply === 'string' ? reply : JSON.stringify(reply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    address,
    received,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const credentials = { username: 'admin', password: 'the-real-password' };
const pinOf = (c: ServerCertificate): ServerPin => ({ fingerprint256: c.fingerprint256, certificate: c.cert });

describe('signIn', () => {
  let certificate: ServerCertificate;
  let otherCertificate: ServerCertificate;
  let server: Awaited<ReturnType<typeof fakeServer>> | undefined;

  beforeAll(async () => {
    [certificate, otherCertificate] = await Promise.all([createServerCertificate(), createServerCertificate()]);
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('says who signed in when the server says yes, with the pass it hands back', async () => {
    const user = { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN', rights: ['products.view'], register: null };
    const session = { token: 'p'.repeat(43), expiresAt: '2026-10-18T20:00:00.000Z' };
    server = await fakeServer(certificate, 200, { signedIn: true, user, session });
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate) })).toEqual({ ok: true, user, session });
    expect(JSON.parse(server.received[0]!)).toEqual(credentials);
  });

  it('tells the server which PC it is, when this PC could read its own id', async () => {
    const user = { username: 'ana', displayName: 'Ana Cruz', roleCode: 'CASHIER', rights: ['sales.sell'], register: { code: 'HQ-R01', name: 'Counter 1' } };
    const session = { token: 'p'.repeat(43), expiresAt: '2026-10-18T20:00:00.000Z' };
    server = await fakeServer(certificate, 200, { signedIn: true, user, session });
    const register = { hardwareId: 'a1b2c3', computerName: 'COUNTER-PC' };
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate), register })).toEqual({ ok: true, user, session });
    await signIn(server.address, credentials, { pin: pinOf(certificate), register: null });
    expect(server.received.map((body) => JSON.parse(body))).toEqual([{ ...credentials, register }, credentials]);
  });

  it("passes on the server's reason when it says no", async () => {
    server = await fakeServer(certificate, 401, { signedIn: false, message: 'Wrong username or password.' });
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate) })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Wrong username or password.',
    });
  });

  it('carries the server password, for a server that has one, and leaves it out when there is none', async () => {
    const user = { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN', rights: [], register: null };
    server = await fakeServer(certificate, 200, { signedIn: true, user, session: { token: 'p'.repeat(43), expiresAt: '2026-10-18T20:00:00.000Z' } });
    await signIn(server.address, credentials, { pin: pinOf(certificate), serverPassword: 'shop-door-1234' });
    await signIn(server.address, credentials, { pin: pinOf(certificate), serverPassword: null });
    expect(server.received.map((body) => JSON.parse(body))).toEqual([{ ...credentials, serverPassword: 'shop-door-1234' }, credentials]);
  });

  it("says when it was the server password that was turned down, not the person's", async () => {
    server = await fakeServer(certificate, 401, { signedIn: false, message: "That isn't this server's password.", serverPassword: true });
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate), serverPassword: 'old-one-1234' })).toEqual({
      ok: false,
      reason: 'server-password',
      message: "That isn't this server's password.",
    });
  });

  it('never sends a password to a server this register has not trusted yet', async () => {
    server = await fakeServer(certificate, 200, { signedIn: true, user: { username: 'x', displayName: 'x', roleCode: 'x', rights: [], register: null } });
    expect(await signIn(server.address, credentials, { pin: null })).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(server.received).toEqual([]);
  });

  it('never lets the password reach an impostor: it stops at the handshake', async () => {
    server = await fakeServer(otherCertificate, 200, { signedIn: true, user: { username: 'x', displayName: 'x', roleCode: 'x', rights: [], register: null } });
    const result = await signIn(server.address, credentials, { pin: pinOf(certificate) });
    expect(result).toMatchObject({ ok: false, reason: 'not-trusted' });
    expect(server.received).toEqual([]);
  });

  it('asks for both a username and a password, without bothering the server', async () => {
    server = await fakeServer(certificate, 200, {});
    expect(await signIn(server.address, { username: ' ', password: 'x' }, { pin: pinOf(certificate) })).toMatchObject({ reason: 'refused' });
    expect(await signIn(server.address, { username: 'admin', password: '' }, { pin: pinOf(certificate) })).toMatchObject({ reason: 'refused' });
    expect(server.received).toEqual([]);
  });

  it("says when the server's answer makes no sense", async () => {
    server = await fakeServer(certificate, 200, '<h1>not json</h1>');
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate) })).toMatchObject({ ok: false, reason: 'not-kvnsys' });
  });

  it('says when the server cannot be reached', async () => {
    const gone = await fakeServer(certificate, 200, {});
    await gone.close();
    expect(await signIn(gone.address, credentials, { pin: pinOf(certificate), timeoutMs: 2000 })).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
  });
});
