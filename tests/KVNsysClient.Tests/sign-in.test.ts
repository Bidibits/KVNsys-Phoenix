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

  it("says who signed in when the server says yes", async () => {
    const user = { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN' };
    server = await fakeServer(certificate, 200, { signedIn: true, user });
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate) })).toEqual({ ok: true, user });
    expect(JSON.parse(server.received[0]!)).toEqual(credentials);
  });

  it("passes on the server's reason when it says no", async () => {
    server = await fakeServer(certificate, 401, { signedIn: false, message: 'Wrong username or password.' });
    expect(await signIn(server.address, credentials, { pin: pinOf(certificate) })).toEqual({
      ok: false,
      reason: 'refused',
      message: 'Wrong username or password.',
    });
  });

  it('never sends a password to a server this register has not trusted yet', async () => {
    server = await fakeServer(certificate, 200, { signedIn: true, user: { username: 'x', displayName: 'x', roleCode: 'x' } });
    expect(await signIn(server.address, credentials, { pin: null })).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(server.received).toEqual([]);
  });

  it('never lets the password reach an impostor: it stops at the handshake', async () => {
    server = await fakeServer(otherCertificate, 200, { signedIn: true, user: { username: 'x', displayName: 'x', roleCode: 'x' } });
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
