import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { checkSession, requestJson, signOut, type ServerPin, type SessionPass } from '@kvnsys/client';
import { createServerCertificate, type ServerCertificate } from '@kvnsys/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
}

/** A stand-in server that answers with whatever a test needs, and records every request that reaches it. */
async function fakeServer(certificate: ServerCertificate, status: number, reply: unknown) {
  const received: Received[] = [];
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert }, (req: IncomingMessage, res: ServerResponse) => {
    received.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization });
    req.resume();
    req.on('end', () => res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply)));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    address: `https://127.0.0.1:${(server.address() as AddressInfo).port}`,
    received,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const pinOf = (c: ServerCertificate): ServerPin => ({ fingerprint256: c.fingerprint256, certificate: c.cert });
const pass: SessionPass = { token: 'the-pass-the-pass-the-pass-the-pass-the-pas', expiresAt: '2026-10-18T20:00:00.000Z' };
const user = { username: 'admin', displayName: 'System Administrator', roleCode: 'ADMIN' };
const Ended = 'Your sign-in has ended. Sign in again.';

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

describe('checkSession', () => {
  it('shows the pass to the server, and says whose it is', async () => {
    server = await fakeServer(certificate, 200, { signedIn: true, user, expiresAt: pass.expiresAt });
    expect(await checkSession(server.address, pass, { pin: pinOf(certificate) })).toEqual({ ok: true, user, expiresAt: pass.expiresAt });
    expect(server.received).toEqual([{ method: 'GET', url: '/api/session', authorization: `Bearer ${pass.token}` }]);
  });

  it('says the sign-in has ended when the server turns the pass away', async () => {
    server = await fakeServer(certificate, 401, { signedIn: false, message: Ended });
    expect(await checkSession(server.address, pass, { pin: pinOf(certificate) })).toEqual({ ok: false, reason: 'ended', message: Ended });
  });
});

describe('signOut', () => {
  it('hands the pass back to the server', async () => {
    server = await fakeServer(certificate, 200, { signedOut: true });
    expect(await signOut(server.address, pass, { pin: pinOf(certificate) })).toEqual({ ok: true });
    expect(server.received).toEqual([{ method: 'POST', url: '/api/sign-out', authorization: `Bearer ${pass.token}` }]);
  });

  it('says when the server cannot be reached', async () => {
    const gone = await fakeServer(certificate, 200, { signedOut: true });
    await gone.close();
    expect(await signOut(gone.address, pass, { pin: pinOf(certificate), timeoutMs: 2000 })).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
  });
});

describe('a pass goes only where a password may', () => {
  it('is never shown to a server this register has not trusted yet', async () => {
    server = await fakeServer(certificate, 200, { signedOut: true });
    expect(await checkSession(server.address, pass, { pin: null })).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(await signOut(server.address, pass, { pin: null })).toMatchObject({ ok: false, reason: 'not-connected' });
    // Underneath both, the request itself refuses, so no future caller can forget the rule.
    await expect(requestJson({ address: server.address, path: '/api/session', pass: pass.token, pin: null, timeoutMs: 2000 })).rejects.toThrow(
      /only ever sent to a server this register has pinned/,
    );
    expect(server.received).toEqual([]);
  });

  it('never reaches an impostor: it stops at the handshake', async () => {
    server = await fakeServer(otherCertificate, 200, { signedIn: true, user, expiresAt: pass.expiresAt });
    expect(await checkSession(server.address, pass, { pin: pinOf(certificate) })).toMatchObject({ ok: false, reason: 'not-trusted' });
    expect(await signOut(server.address, pass, { pin: pinOf(certificate) })).toMatchObject({ ok: false, reason: 'not-trusted' });
    expect(server.received).toEqual([]);
  });
});
