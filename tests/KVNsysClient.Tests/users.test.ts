import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { listUsers, loadUserForm, resetPassword, saveUserForm, type ServerPin, type SessionPass, type UserForm } from '@kvnsys/client';
import { createServerCertificate, type ServerCertificate } from '@kvnsys/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

interface Received {
  method: string;
  url: string;
  body: unknown;
}

/** A stand-in server that answers each path as the test says, and records every request, body included. */
async function fakeServer(certificate: ServerCertificate, answer: (method: string, url: string) => [number, unknown]) {
  const received: Received[] = [];
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert }, (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      received.push({ method: req.method ?? '', url: req.url ?? '', body: text ? JSON.parse(text) : undefined });
      const [status, reply] = answer(req.method ?? '', req.url ?? '');
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
    });
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

const pass: SessionPass = { token: 'the-pass-the-pass-the-pass-the-pass-the-pas', expiresAt: '2026-10-19T20:00:00.000Z' };
const id = '0199c7a0-0000-7000-8000-000000000001';
const ana = { id, username: 'ana', firstName: 'Ana', middleName: null, lastName: 'Cruz', displayName: 'Ana Cruz', roleId: 'role-cashier', roleName: 'Cashier', status: 'Active' };
const roles = [
  { id: 'role-old', name: 'Old role', status: 'Inactive' },
  { id: 'role-cashier', name: 'Cashier', status: 'Active' },
];
const typed: UserForm = {
  username: 'Ana',
  firstName: 'Ana',
  middleName: '',
  lastName: 'Cruz',
  roleId: 'role-cashier',
  status: 'Active',
  password: 'a-good-password',
  passwordAgain: 'a-good-password',
};

let certificate: ServerCertificate;
let server: Awaited<ReturnType<typeof fakeServer>> | undefined;
const pinned = () => ({ pin: { fingerprint256: certificate.fingerprint256, certificate: certificate.cert } satisfies ServerPin });
const byPath = (method: string, url: string): [number, unknown] => {
  if (url === '/api/roles') return [200, { roles }];
  if (url === `/api/users/${id}/password`) return [200, { passwordChanged: true }];
  if (url.startsWith('/api/users/')) return [200, { user: ana }];
  return method === 'POST' ? [201, { user: ana }] : [200, { users: [ana] }];
};

beforeAll(async () => {
  certificate = await createServerCertificate();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('the account calls', () => {
  it('list every account', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await listUsers(server.address, pass, pinned())).toEqual({ ok: true, users: [ana] });
  });

  it('start a new account on the first active role, asking only for the roles', async () => {
    server = await fakeServer(certificate, byPath);
    const result = await loadUserForm(server.address, pass, null, pinned());
    expect(result).toMatchObject({ ok: true, roles, form: { username: '', roleId: 'role-cashier', status: 'Active' } });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/roles']);
  });

  it('fetch an account afresh to change it, with empty password boxes', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await loadUserForm(server.address, pass, id, pinned())).toMatchObject({
      ok: true,
      form: { username: 'ana', middleName: '', password: '', passwordAgain: '' },
    });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/roles', `GET /api/users/${id}`]);
  });

  it('send a new account with its password once, and changes to one without any password', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await saveUserForm(server.address, pass, null, typed, pinned())).toEqual({ ok: true, user: ana });
    await saveUserForm(server.address, pass, id, { ...typed, password: '', passwordAgain: '' }, pinned());
    const [added, changed] = server.received;
    expect(added).toMatchObject({ method: 'POST', url: '/api/users', body: { username: 'ana', password: 'a-good-password' } });
    expect(added!.body).not.toHaveProperty('passwordAgain');
    expect(changed).toMatchObject({ method: 'PUT', url: `/api/users/${id}` });
    expect(changed!.body).not.toHaveProperty('password');
  });

  it('catch mismatched passwords before anything is sent', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await saveUserForm(server.address, pass, null, { ...typed, passwordAgain: 'nope-nope-nope' }, pinned())).toMatchObject({ ok: false, reason: 'refused' });
    expect(await resetPassword(server.address, pass, id, 'a-new-password', 'nope', pinned())).toMatchObject({ ok: false, reason: 'refused' });
    expect(server.received).toEqual([]);
  });

  it('reset a password with one request carrying it once', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await resetPassword(server.address, pass, id, 'a-new-password', 'a-new-password', pinned())).toEqual({ ok: true });
    expect(server.received).toEqual([{ method: 'POST', url: `/api/users/${id}/password`, body: { password: 'a-new-password' } }]);
  });
});
