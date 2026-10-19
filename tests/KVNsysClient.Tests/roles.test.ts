import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { listRoles, loadRoleForm, saveRoleForm, type RoleForm, type ServerPin, type SessionPass } from '@kvnsys/client';
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
const id = '0199c7a0-0000-7000-8000-000000000002';
const cashier = { id, code: 'CASHIER', name: 'Cashier', status: 'Active', rights: ['products.view', 'users.view'], userCount: 3, fixed: false };
const typed: RoleForm = { name: ' Cashier ', status: 'Active', rights: ['products.manage'] };

let certificate: ServerCertificate;
let server: Awaited<ReturnType<typeof fakeServer>> | undefined;
const pinned = () => ({ pin: { fingerprint256: certificate.fingerprint256, certificate: certificate.cert } satisfies ServerPin });
const byPath = (method: string, url: string): [number, unknown] => {
  if (url.startsWith('/api/roles/')) return [200, { role: cashier }];
  return method === 'POST' ? [201, { role: cashier }] : [200, { roles: [cashier] }];
};

beforeAll(async () => {
  certificate = await createServerCertificate();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('the role calls', () => {
  it('list every role, with its rights in words', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await listRoles(server.address, pass, pinned())).toEqual({ ok: true, roles: [{ ...cashier, rightsInWords: 'See products, See users' }] });
  });

  it('start a new role blank, without asking the server, with a tick box for every right', async () => {
    server = await fakeServer(certificate, byPath);
    const blank = await loadRoleForm(server.address, pass, null, pinned());
    expect(blank).toMatchObject({ ok: true, fixed: false, form: { name: '', status: 'Active', rights: [] } });
    if (!blank.ok) return;
    expect(blank.groups.map((g) => g.area)).toEqual(['Registers', 'Products', 'Users', 'Roles']);
    expect(blank.groups[1]!.rights).toEqual([
      { access: 'products.view', description: 'See the products and their prices', needs: undefined },
      { access: 'products.manage', description: 'Add products, and change their details and prices', needs: 'products.view' },
    ]);
    expect(server.received).toEqual([]);
  });

  it('load a role to change as the server has it now', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await loadRoleForm(server.address, pass, id, pinned())).toMatchObject({
      ok: true,
      fixed: false,
      form: { name: 'Cashier', status: 'Active', rights: ['products.view', 'users.view'] },
    });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual([`GET /api/roles/${id}`]);
  });

  it('send a role tidied, with the rights the ticked ones need', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await saveRoleForm(server.address, pass, null, typed, pinned())).toMatchObject({ ok: true, role: { name: 'Cashier' } });
    await saveRoleForm(server.address, pass, id, typed, pinned());
    const [made, changed] = server.received;
    expect(made).toEqual({ method: 'POST', url: '/api/roles', body: { name: 'Cashier', status: 'Active', rights: ['products.view', 'products.manage'] } });
    expect(changed).toMatchObject({ method: 'PUT', url: `/api/roles/${id}` });
  });

  it('catch a role with no name before anything is sent', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await saveRoleForm(server.address, pass, null, { ...typed, name: '' }, pinned())).toEqual({ ok: false, reason: 'refused', message: 'A role needs a name.' });
    expect(server.received).toEqual([]);
  });
});
