import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addProduct,
  changeProduct,
  findProduct,
  getProduct,
  listProducts,
  loadProductForm,
  saveProductForm,
  type ProductDetails,
  type ServerPin,
  type SessionPass,
} from '@kvnsys/client';
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
const rice: ProductDetails = { code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: 145050, status: 'Active', description: null };
const riceOnWire = { ...rice, retailPrice: '1450.50' };

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

describe('the product calls', () => {
  it('add a product: the pass, and the price as exact pesos text', async () => {
    server = await fakeServer(certificate, 201, { product: { ...riceOnWire, id } });
    expect(await addProduct(server.address, pass, rice, pinned())).toEqual({ ok: true, product: { ...rice, id } });
    expect(server.received).toEqual([{ method: 'POST', url: '/api/products', authorization: `Bearer ${pass.token}`, body: riceOnWire }]);
  });

  it('change a product, by its id', async () => {
    server = await fakeServer(certificate, 200, { product: { ...riceOnWire, id, retailPrice: '0.29' } });
    expect(await changeProduct(server.address, pass, id, { ...rice, retailPrice: 29 }, pinned())).toEqual({
      ok: true,
      product: { ...rice, id, retailPrice: 29 },
    });
    expect(server.received[0]).toMatchObject({ method: 'PUT', url: `/api/products/${id}`, body: { ...riceOnWire, retailPrice: '0.29' } });
  });

  it('list, get, and find by code or barcode, with the value made safe for an address', async () => {
    server = await fakeServer(certificate, 200, { products: [{ ...riceOnWire, id }] });
    expect(await listProducts(server.address, pass, pinned())).toEqual({ ok: true, products: [{ ...rice, id }] });
    await server.close();

    server = await fakeServer(certificate, 200, { product: { ...riceOnWire, id } });
    await getProduct(server.address, pass, id, pinned());
    await findProduct(server.address, pass, { code: 'A&B 1/2' }, pinned());
    await findProduct(server.address, pass, { barcode: '4800016641503' }, pinned());
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual([
      `GET /api/products/${id}`,
      'GET /api/products/find?code=A%26B%201%2F2',
      'GET /api/products/find?barcode=4800016641503',
    ]);
  });

  it("pass on the server's reason for each kind of no", async () => {
    const cases = [
      [400, 'refused', 'A product needs a name.'],
      [401, 'ended', 'Your sign-in has ended. Sign in again.'],
      [403, 'not-allowed', "This needs a right your role doesn't have."],
      [404, 'not-found', 'No product has the code X.'],
      [409, 'refused', 'PRD-0042 is already the code of Sack of rice 25kg.'],
      [503, 'refused', "KVNsys Server isn't connected to its database."],
    ] as const;
    for (const [status, reason, message] of cases) {
      server = await fakeServer(certificate, status, { message });
      expect(await addProduct(server.address, pass, rice, pinned()), String(status)).toEqual({ ok: false, reason, message });
      await server.close();
      server = undefined;
    }
  });

  it('says plainly when the server broke, or answered with something else', async () => {
    server = await fakeServer(certificate, 500, { statusCode: 500, message: 'Internal server error' });
    expect(await listProducts(server.address, pass, pinned())).toMatchObject({ ok: false, reason: 'server-error' });
    await server.close();
    server = await fakeServer(certificate, 200, { products: [{ ...riceOnWire, retailPrice: 1450.5 }] });
    expect(await listProducts(server.address, pass, pinned())).toMatchObject({ ok: false, reason: 'not-kvnsys' });
  });

  it('never shows the pass to a server this register has not pinned', async () => {
    server = await fakeServer(certificate, 200, { products: [] });
    expect(await listProducts(server.address, pass, { pin: null })).toMatchObject({ ok: false, reason: 'not-connected' });
    expect(server.received).toEqual([]);
  });

  it('refuses to send a price that is not whole centavos, without asking the server', async () => {
    server = await fakeServer(certificate, 201, { product: { ...riceOnWire, id } });
    expect(await addProduct(server.address, pass, { ...rice, retailPrice: 12.5 }, pinned())).toMatchObject({ ok: false, reason: 'refused' });
    expect(server.received).toEqual([]);
  });
});

describe('the product form', () => {
  const typed = { code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: '1,450.5', status: 'Active', description: '' };

  it('hands back a blank form for a new product, without asking the server', async () => {
    server = await fakeServer(certificate, 200, {});
    expect(await loadProductForm(server.address, pass, null, pinned())).toEqual({
      ok: true,
      form: { code: '', barcode: '', name: '', retailPrice: '', status: 'Active', description: '' },
    });
    expect(server.received).toEqual([]);
  });

  it('fetches a product afresh from the server to edit it, with its price as plain pesos', async () => {
    server = await fakeServer(certificate, 200, { product: { ...riceOnWire, id } });
    expect(await loadProductForm(server.address, pass, id, pinned())).toEqual({
      ok: true,
      form: { code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: '1450.50', status: 'Active', description: '' },
    });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual([`GET /api/products/${id}`]);
  });

  it('catches a mistake before asking the server', async () => {
    server = await fakeServer(certificate, 201, { product: { ...riceOnWire, id } });
    expect(await saveProductForm(server.address, pass, null, { ...typed, retailPrice: '12.555' }, pinned())).toEqual({
      ok: false,
      reason: 'refused',
      message: '"12.555" isn\'t a price. Type it in pesos, like 1450.50, with at most two decimals.',
    });
    expect(server.received).toEqual([]);
  });

  it('adds a new product, or changes the one being edited, sending exact pesos', async () => {
    server = await fakeServer(certificate, 201, { product: { ...riceOnWire, id } });
    expect(await saveProductForm(server.address, pass, null, typed, pinned())).toEqual({ ok: true, product: { ...rice, id } });
    await saveProductForm(server.address, pass, id, typed, pinned());
    expect(server.received.map((r) => [r.method, r.url, (r.body as { retailPrice: string }).retailPrice])).toEqual([
      ['POST', '/api/products', '1450.50'],
      ['PUT', `/api/products/${id}`, '1450.50'],
    ]);
  });
});
