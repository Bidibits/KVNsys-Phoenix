import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  addProduct,
  changeProduct,
  findProduct,
  getProduct,
  getProductPicture,
  listProducts,
  loadProductForm,
  saveProductForm,
  type ProductDetails,
  type ProductForm,
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

/**
 * A stand-in server that answers with whatever a test needs, and records every request, body
 * included. It answers every path the same, or each path its own way (answer).
 */
async function fakeServer(certificate: ServerCertificate, status: number, reply: unknown, answer?: (url: string) => [number, unknown]) {
  const received: Received[] = [];
  const server = createSecureServer({ key: certificate.key, cert: certificate.cert }, (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      received.push({ method: req.method ?? '', url: req.url ?? '', authorization: req.headers.authorization, body: text ? JSON.parse(text) : undefined });
      const [code, body] = answer ? answer(req.url ?? '') : [status, reply];
      res.writeHead(code, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
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
/** The fields after the launch list's, as a product left without them has them. */
const extras = {
  categoryId: null,
  brandId: null,
  supplierId: null,
  manufacturerId: null,
  unitOfMeasure: null,
  tracksStock: true,
  costPrice: 0,
  promoPrice: null,
  wholesalePrice: null,
  wholesaleQuantity: null,
  hasWarranty: false,
  warrantyMonths: 0,
};
const rice: ProductDetails = { code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: 145050, status: 'Active', description: null, ...extras };
const riceOnWire = { ...rice, retailPrice: '1450.50', costPrice: '0.00' };

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
    expect(server.received).toEqual([{ method: 'POST', url: '/api/products', authorization: `Bearer ${pass.token}`, body: { ...riceOnWire, picture: null } }]);
  });

  it('change a product, by its id', async () => {
    server = await fakeServer(certificate, 200, { product: { ...riceOnWire, id, retailPrice: '0.29' } });
    expect(await changeProduct(server.address, pass, id, { ...rice, retailPrice: 29 }, pinned())).toEqual({
      ok: true,
      product: { ...rice, id, retailPrice: 29 },
    });
    expect(server.received[0]).toMatchObject({ method: 'PUT', url: `/api/products/${id}`, body: { ...riceOnWire, retailPrice: '0.29' } });
    expect(server.received[0]!.body).not.toHaveProperty('picture');
  });

  it("carry every price as exact pesos text both ways, and ask for a picture apart", async () => {
    const fan = { ...rice, costPrice: 145029, promoPrice: 169900, wholesalePrice: 159900, wholesaleQuantity: 10 };
    const fanOnWire = { ...riceOnWire, costPrice: '1450.29', promoPrice: '1699.00', wholesalePrice: '1599.00', wholesaleQuantity: 10 };
    server = await fakeServer(certificate, 201, { product: { ...fanOnWire, id } });
    expect(await addProduct(server.address, pass, fan, pinned(), '/9j/4A==')).toEqual({ ok: true, product: { ...fan, id } });
    expect(server.received[0]!.body).toEqual({ ...fanOnWire, picture: '/9j/4A==' });
    await server.close();

    server = await fakeServer(certificate, 200, { picture: '/9j/4A==' });
    expect(await getProductPicture(server.address, pass, id, pinned())).toEqual({ ok: true, picture: '/9j/4A==' });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual([`GET /api/products/${id}/picture`]);
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
  const blank: ProductForm = {
    code: '',
    barcode: '',
    name: '',
    retailPrice: '',
    status: 'Active',
    description: '',
    categoryId: '',
    brandId: '',
    supplierId: '',
    manufacturerId: '',
    unitOfMeasure: '',
    tracksStock: true,
    costPrice: '',
    promoPrice: '',
    wholesalePrice: '',
    wholesaleQuantity: '',
    hasWarranty: false,
    warrantyMonths: '',
    picture: '',
  };
  const typed: ProductForm = { ...blank, code: 'PRD-0042', barcode: '4800016641503', name: 'Sack of rice 25kg', retailPrice: '1,450.5' };
  const entry = (n: number, name: string, extra = {}) => ({
    id: `0199c7a0-0000-7000-8000-0000000000${n}`,
    code: `E-${n}`,
    name,
    address: null,
    parentId: null,
    parentName: null,
    status: 'Active',
    description: null,
    ...extra,
  });
  const appliances = entry(11, 'Appliances');
  const fans = entry(12, 'Fans', { parentId: appliances.id, parentName: 'Appliances' });
  const oldCategory = entry(13, 'Old category', { status: 'Inactive' });
  const hanabishi = entry(21, 'Hanabishi');
  /** The four lists, the product and its picture, each at its own path. */
  const byPath = (product: unknown, picture: string | null) => (url: string): [number, unknown] => {
    if (url === '/api/catalog/categories') return [200, { entries: [appliances, fans, oldCategory] }];
    if (url === '/api/catalog/brands') return [200, { entries: [hanabishi] }];
    if (url.startsWith('/api/catalog/')) return [200, { entries: [] }];
    if (url.endsWith('/picture')) return [200, { picture }];
    return [200, { product }];
  };

  it("hands back a blank form for a new product, with what each picker offers: what's switched on, a category with those above it", async () => {
    server = await fakeServer(certificate, 200, null, byPath(null, null));
    expect(await loadProductForm(server.address, pass, null, pinned())).toEqual({
      ok: true,
      form: blank,
      choices: {
        categoryId: [
          { value: appliances.id, label: 'Appliances' },
          { value: fans.id, label: 'Appliances › Fans' },
        ],
        brandId: [{ value: hanabishi.id, label: 'Hanabishi' }],
        supplierId: [],
        manufacturerId: [],
      },
    });
    expect(server.received.map((r) => `${r.method} ${r.url}`).sort()).toEqual([
      'GET /api/catalog/brands',
      'GET /api/catalog/categories',
      'GET /api/catalog/manufacturers',
      'GET /api/catalog/suppliers',
    ]);
  });

  it('fetches a product afresh, with its picture, and still offers a choice it has that was switched off since', async () => {
    const product = { ...riceOnWire, id, categoryId: oldCategory.id, costPrice: '1200.00', hasWarranty: true, warrantyMonths: 12 };
    server = await fakeServer(certificate, 200, null, byPath(product, '/9j/4A=='));
    const loaded = await loadProductForm(server.address, pass, id, pinned());
    expect(loaded).toMatchObject({
      ok: true,
      form: { ...typed, retailPrice: '1450.50', categoryId: oldCategory.id, costPrice: '1200.00', hasWarranty: true, warrantyMonths: '12', picture: '/9j/4A==' },
    });
    expect(loaded.ok && loaded.choices.categoryId.map((c) => c.label)).toEqual(['Appliances', 'Appliances › Fans', 'Old category (switched off)']);
    expect(server.received.map((r) => r.url)).toContain(`/api/products/${id}/picture`);
  });

  it("says why when one of the lists can't be read", async () => {
    server = await fakeServer(certificate, 200, null, (url) => (url === '/api/catalog/suppliers' ? [403, { message: 'No.' }] : byPath(null, null)(url)));
    expect(await loadProductForm(server.address, pass, null, pinned())).toEqual({ ok: false, reason: 'not-allowed', message: 'No.' });
  });

  it('refuses a picture that is not a JPEG without asking the server', async () => {
    server = await fakeServer(certificate, 201, { product: { ...riceOnWire, id } });
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
    expect(await saveProductForm(server.address, pass, null, { ...typed, picture: png }, pinned())).toEqual({
      ok: false,
      reason: 'refused',
      message: "A product's picture has to be a JPEG.",
    });
    expect(server.received).toEqual([]);
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

  it('adds a new product, or changes the one being edited, sending exact pesos and the picture as the form has it', async () => {
    server = await fakeServer(certificate, 201, { product: { ...riceOnWire, id } });
    expect(await saveProductForm(server.address, pass, null, typed, pinned())).toEqual({ ok: true, product: { ...rice, id } });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]).toString('base64');
    await saveProductForm(server.address, pass, id, { ...typed, picture: jpeg }, pinned());
    type Sent = { retailPrice: string; picture: string | null };
    expect(server.received.map((r) => [r.method, r.url, (r.body as Sent).retailPrice, (r.body as Sent).picture])).toEqual([
      ['POST', '/api/products', '1450.50', null],
      ['PUT', `/api/products/${id}`, '1450.50', jpeg],
    ]);
  });
});
