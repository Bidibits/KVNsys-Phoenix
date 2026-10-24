import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { findSaleProduct, priceCart, recordSale, type SaleProduct, type ServerPin, type SessionPass } from '@kvnsys/client';
import { createServerCertificate, type ServerCertificate } from '@kvnsys/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

interface Received {
  method: string;
  url: string;
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
      received.push({ method: req.method ?? '', url: req.url ?? '', body: text ? JSON.parse(text) : undefined });
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
const sardines: SaleProduct = { id: '0199c7a0-0000-7000-8000-000000000001', code: 'PRD-0007', name: 'Sardines 155g', retailPrice: 2575, status: 'Active' };
const senior = { kind: 'senior' as const, idNumber: 'OSCA-1', customerName: 'Lola Cruz' };
const shop = { id: '0199c7a0-0000-7000-8000-0000000000aa', code: 'HQ', name: 'Head Office' };
const receiptOnWire = {
  id: '0199c7a0-0000-7000-8000-0000000000bb',
  code: 'HQ-000001',
  number: 1,
  lines: [{ productId: sardines.id, code: 'PRD-0007', name: 'Sardines 155g', quantity: 2, unitPrice: '25.75', subtotal: '51.50', discount: '10.30', total: '41.20' }],
  subtotal: '51.50',
  discountTotal: '10.30',
  total: '41.20',
  discount: senior,
  payment: { type: 'Cash', tendered: '50.00', change: '8.80' },
  createdAt: '2026-10-24T09:30:00.000Z',
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

describe('selling from the register', () => {
  it('finds a product to ring up, by what was scanned, with its price back in centavos', async () => {
    server = await fakeServer(certificate, 200, { product: { ...sardines, retailPrice: '25.75' } });
    expect(await findSaleProduct(server.address, pass, '4800 249/1', pinned())).toEqual({ ok: true, product: sardines });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/sales/find?codeOrBarcode=4800%20249%2F1']);
  });

  it('prices the cart on the register, with the same rules the server records it with', () => {
    expect(priceCart([{ product: sardines, quantity: 2 }], senior)).toMatchObject({ ok: true, sale: { subtotal: 5150, discountTotal: 1030, total: 4120 } });
    expect(priceCart([{ product: { ...sardines, retailPrice: 0 }, quantity: 1 }], null)).toEqual({
      ok: false,
      reason: 'refused',
      message: "Sardines 155g has no price yet, so it can't be sold. Ask whoever manages products to price it.",
    });
  });

  it('records a sale: the lines by id, the discount, the cash, and the total the cashier saw, all as text', async () => {
    server = await fakeServer(certificate, 201, { receipt: receiptOnWire, shop, cashier: 'Ana Cruz' });
    const result = await recordSale(server.address, pass, { cart: [{ product: sardines, quantity: 2 }], discount: senior, tendered: '50' }, pinned());
    expect(result).toMatchObject({ ok: true, shop, cashier: 'Ana Cruz', receipt: { code: 'HQ-000001', total: 4120, payment: { tendered: 5000, change: 880 } } });
    expect(server.received).toEqual([
      {
        method: 'POST',
        url: '/api/sales',
        body: { lines: [{ productId: sardines.id, quantity: 2 }], discount: senior, tendered: '50.00', expectedTotal: '41.20' },
      },
    ]);
  });

  it('catches short cash, or cash typed wrong, without asking the server', async () => {
    server = await fakeServer(certificate, 201, { receipt: receiptOnWire, shop, cashier: 'Ana Cruz' });
    const cart = [{ product: sardines, quantity: 2 }];
    expect(await recordSale(server.address, pass, { cart, discount: null, tendered: '50' }, pinned())).toEqual({
      ok: false,
      reason: 'refused',
      message: "₱50.00 isn't enough: the total is ₱51.50.",
    });
    expect(await recordSale(server.address, pass, { cart, discount: null, tendered: 'fifty' }, pinned())).toMatchObject({ ok: false, reason: 'refused' });
    expect(server.received).toEqual([]);
  });

  it("passes on the server's reason when it refuses, a changed price included", async () => {
    const message = 'A price changed while this sale was being rung up: it now comes to ₱60.00, not ₱51.50. Check the cart, then take payment again.';
    server = await fakeServer(certificate, 409, { message });
    expect(await recordSale(server.address, pass, { cart: [{ product: sardines, quantity: 2 }], discount: null, tendered: '100' }, pinned())).toEqual({
      ok: false,
      reason: 'refused',
      message,
    });
  });
});
