import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getProductStock, listStock, recordStock, type HandMovement, type ServerPin, type SessionPass } from '@kvnsys/client';
import { createServerCertificate, type ServerCertificate } from '@kvnsys/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

interface Received {
  method: string;
  url: string;
  authorization: string | undefined;
  body: unknown;
}

/** A stand-in server that answers with whatever a test needs, and records every request, body included. */
async function fakeServer(certificate: ServerCertificate, status: number, reply: unknown) {
  const received: Received[] = [];
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert }, (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      received.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body: text ? JSON.parse(text) : undefined });
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

const pass: SessionPass = { token: 'the-pass-the-pass-the-pass-the-pass-the-pas', expiresAt: '2026-10-18T20:00:00.000Z' };
const id = '0199c7a0-0000-7000-8000-000000000001';
const shop = { id: '0199c7a0-0000-7000-8000-0000000000aa', code: 'HQ', name: 'Head Office' };
const rice = { id, code: 'PRD-0042', barcode: null, name: 'Sack of rice 25kg', retailPrice: 145050, status: 'Active' as const, description: null };
const riceOnWire = { ...rice, retailPrice: '1450.50' };
const line = {
  id: '0199c7a0-0000-7000-8000-0000000000bb',
  productId: id,
  type: 'from_supplier' as const,
  quantityChange: 24,
  note: null,
  source: null,
  resultingOnHand: 24,
  createdAt: '2026-10-24T09:30:00.000Z',
  createdBy: { id: '0199c7a0-0000-7000-8000-0000000000cc', name: 'Ana Cruz' },
};

let certificate: ServerCertificate;
let server: Awaited<ReturnType<typeof fakeServer>> | undefined;
const pinned = () => ({ pin: { fingerprint256: certificate.fingerprint256, certificate: certificate.cert } satisfies ServerPin });

beforeAll(async () => {
  certificate = await createServerCertificate();
});

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('the stock calls', () => {
  it("list the shop's stock, with prices back in centavos", async () => {
    server = await fakeServer(certificate, 200, { shop, items: [{ product: riceOnWire, stock: 24 }] });
    expect(await listStock(server.address, pass, pinned())).toEqual({ ok: true, shop, items: [{ product: rice, stock: 24 }] });
    expect(server.received).toEqual([{ method: 'GET', url: '/api/stock', authorization: `Bearer ${pass.token}`, body: undefined }]);
  });

  it("get one product's stock and its newest lines, by its id made safe for an address", async () => {
    server = await fakeServer(certificate, 200, { shop, product: riceOnWire, stock: 24, movements: [line], more: true });
    expect(await getProductStock(server.address, pass, id, pinned())).toEqual({ ok: true, shop, product: rice, stock: 24, movements: [line], more: true });
    await getProductStock(server.address, pass, 'a/b', pinned());
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual([`GET /api/stock/${id}`, 'GET /api/stock/a%2Fb']);
  });

  it('record a delivery and a count put right in one go, and hand back the lines as saved', async () => {
    const lines: HandMovement[] = [
      { productId: id, type: 'from_supplier', quantityChange: 24, note: null },
      { productId: id, type: 'adjustment', quantityChange: -2, note: 'counted 22 on the shelf' },
    ];
    const saved = [line, { ...line, type: 'adjustment' as const, quantityChange: -2, resultingOnHand: 22, note: 'counted 22 on the shelf' }];
    server = await fakeServer(certificate, 201, { movements: saved });
    expect(await recordStock(server.address, pass, lines, pinned())).toEqual({ ok: true, movements: saved });
    expect(server.received).toEqual([{ method: 'POST', url: '/api/stock/movements', authorization: `Bearer ${pass.token}`, body: { movements: lines } }]);
  });

  it("pass on the server's reason for each kind of no", async () => {
    const cases = [
      [400, 'refused', 'Say why the count is being put right, such as "counted 22 on the shelf".'],
      [401, 'ended', 'Your sign-in has ended. Sign in again.'],
      [403, 'not-allowed', "This needs a right your role doesn't have."],
      [404, 'not-found', "That product isn't in the catalog."],
      [503, 'refused', "KVNsys Server can't tell which shop it serves."],
    ] as const;
    for (const [status, reason, message] of cases) {
      server = await fakeServer(certificate, status, { message });
      const sent = await recordStock(server.address, pass, [{ productId: id, type: 'adjustment', quantityChange: -1, note: null }], pinned());
      expect(sent, String(status)).toEqual({ ok: false, reason, message });
      await server.close();
      server = undefined;
    }
  });

  it("says plainly when an answer isn't stock, and never shows the pass to an unpinned server", async () => {
    server = await fakeServer(certificate, 200, { shop, items: [{ product: riceOnWire, stock: '24' }] });
    expect(await listStock(server.address, pass, pinned())).toMatchObject({ ok: false, reason: 'not-kvnsys' });
    expect(await listStock(server.address, pass, { pin: null })).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(server.received).toHaveLength(1);
  });
});
