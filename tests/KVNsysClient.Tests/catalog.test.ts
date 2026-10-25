import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { listCatalog, loadCatalogEntryForm, saveCatalogEntryForm, type CatalogEntryForm, type ServerPin, type SessionPass } from '@kvnsys/client';
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

const pass: SessionPass = { token: 'the-pass-the-pass-the-pass-the-pass-the-pas', expiresAt: '2026-10-25T20:00:00.000Z' };
const appliancesId = '0199c7a0-0000-7000-8000-000000000011';
const fansId = '0199c7a0-0000-7000-8000-000000000012';
const appliances = { id: appliancesId, code: 'CAT-APP', name: 'Appliances', address: null, parentId: null, parentName: null, status: 'Active', description: null };
const fans = { id: fansId, code: 'CAT-FAN', name: 'Fans', address: null, parentId: appliancesId, parentName: 'Appliances', status: 'Active', description: null };
const typed: CatalogEntryForm = { code: ' CAT-FAN ', name: 'Fans', address: '', parentId: appliancesId, status: 'Active', description: '  ' };

let certificate: ServerCertificate;
let server: Awaited<ReturnType<typeof fakeServer>> | undefined;
const pinned = () => ({ pin: { fingerprint256: certificate.fingerprint256, certificate: certificate.cert } satisfies ServerPin });
const byPath = (method: string, url: string): [number, unknown] => {
  if (url === `/api/catalog/categories/${fansId}`) return [200, { entry: fans }];
  if (url === '/api/catalog/categories') return method === 'POST' ? [201, { entry: fans }] : [200, { entries: [appliances, fans] }];
  return [200, { entries: [] }];
};

beforeAll(async () => {
  certificate = await createServerCertificate();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("the catalogue's list calls", () => {
  it("ask each list's own path, and hand back what its entries have", async () => {
    server = await fakeServer(certificate, byPath);
    expect(await listCatalog(server.address, pass, 'categories', pinned())).toMatchObject({ ok: true, entries: [appliances, fans], shape: { hasParent: true } });
    expect(await listCatalog(server.address, pass, 'suppliers', pinned())).toMatchObject({ ok: true, entries: [], shape: { hasAddress: true } });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/catalog/categories', 'GET /api/catalog/suppliers']);
  });

  it("offer a category every other category to sit inside, and load the one being changed as the server has it", async () => {
    server = await fakeServer(certificate, byPath);
    const editing = await loadCatalogEntryForm(server.address, pass, 'categories', fansId, pinned());
    expect(editing).toMatchObject({ ok: true, form: { code: 'CAT-FAN', parentId: appliancesId } });
    if (editing.ok) expect(editing.parents.map((p) => p.name)).toEqual(['Appliances']);
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/catalog/categories', `GET /api/catalog/categories/${fansId}`]);
  });

  it("start a brand blank without asking the server: a brand sits inside nothing", async () => {
    server = await fakeServer(certificate, byPath);
    expect(await loadCatalogEntryForm(server.address, pass, 'brands', null, pinned())).toMatchObject({ ok: true, parents: [], shape: { hasParent: false } });
    expect(server.received).toEqual([]);
  });

  it('send an entry tidied, and catch a missing code before anything is sent', async () => {
    server = await fakeServer(certificate, byPath);
    expect(await saveCatalogEntryForm(server.address, pass, 'categories', null, typed, pinned())).toMatchObject({ ok: true, entry: { name: 'Fans' } });
    expect(server.received[0]).toEqual({
      method: 'POST',
      url: '/api/catalog/categories',
      body: { code: 'CAT-FAN', name: 'Fans', address: null, parentId: appliancesId, status: 'Active', description: null },
    });
    expect(await saveCatalogEntryForm(server.address, pass, 'brands', null, { ...typed, code: '' }, pinned())).toEqual({
      ok: false,
      reason: 'refused',
      message: 'A brand needs a code.',
    });
    expect(server.received).toHaveLength(1);
  });
});
