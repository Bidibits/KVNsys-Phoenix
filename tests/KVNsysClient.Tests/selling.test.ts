import { createServer as createSecureServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { closeShift, currentShift, findSaleProduct, getReceipt, listDaySales, openShift, priceCart, recordSale, type SaleProduct, type ServerPin, type SessionPass } from '@kvnsys/client';
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
    server = await fakeServer(certificate, 201, { receipt: receiptOnWire, shop, cashier: 'Ana Cruz', register: 'Counter 1' });
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
    server = await fakeServer(certificate, 201, { receipt: receiptOnWire, shop, cashier: 'Ana Cruz', register: 'Counter 1' });
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

describe("looking back at a day's sales from the register", () => {
  const line = { id: receiptOnWire.id, code: 'HQ-000001', number: 1, createdAt: receiptOnWire.createdAt, cashier: null, pieces: 2, subtotal: '51.50', discountTotal: '10.30', total: '41.20', discountKind: 'senior' };
  const totals = { receipts: 1, pieces: 2, subtotal: '51.50', discountTotal: '10.30', total: '41.20' };

  it("asks for today when no day is given, or the day given, with money back in centavos", async () => {
    server = await fakeServer(certificate, 200, { shop, date: '2026-10-24', receipts: [line], totals });
    expect(await listDaySales(server.address, pass, null, pinned())).toEqual({
      ok: true,
      shop,
      date: '2026-10-24',
      receipts: [{ ...line, subtotal: 5150, discountTotal: 1030, total: 4120 }],
      totals: { receipts: 1, pieces: 2, subtotal: 5150, discountTotal: 1030, total: 4120 },
    });
    await listDaySales(server.address, pass, '2026-10-23', pinned());
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/sales', 'GET /api/sales?date=2026-10-23']);
  });

  it('opens one receipt by its id, whoever rang it up', async () => {
    server = await fakeServer(certificate, 200, { receipt: receiptOnWire, shop, cashier: null, register: null });
    expect(await getReceipt(server.address, pass, receiptOnWire.id, pinned())).toMatchObject({ ok: true, cashier: null, receipt: { code: 'HQ-000001', total: 4120 } });
    expect(server.received.map((r) => r.url)).toEqual([`/api/sales/${receiptOnWire.id}`]);
  });
});

describe("the cashier's shift, from the register", () => {
  const closed = {
    id: 's1',
    code: 'HQ-S00001',
    status: 'Closed',
    openingCash: '1000.00',
    cashSales: '41.20',
    receipts: 1,
    discounts: '10.30',
    expectedCash: '1041.20',
    countedCash: '1021.20',
    openedAt: '2026-10-24T00:00:00.000Z',
    openedBy: 'Ana Cruz',
    closedAt: '2026-10-24T09:00:00.000Z',
    closedBy: 'Ana Cruz',
    note: 'gave too much change',
  };

  it('asks for the open shift, or none', async () => {
    server = await fakeServer(certificate, 200, { shift: null });
    expect(await currentShift(server.address, pass, pinned())).toEqual({ ok: true, shift: null });
    expect(server.received.map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/shifts/current']);
  });

  it('starts a shift with the cash as typed, sent as exact pesos', async () => {
    server = await fakeServer(certificate, 201, { shift: { ...closed, status: 'Open', countedCash: null, closedAt: null, closedBy: null, note: null } });
    expect(await openShift(server.address, pass, '1,000', pinned())).toMatchObject({ ok: true, shift: { openingCash: 100000, variance: null, varianceInWords: null } });
    expect(server.received[0]).toMatchObject({ method: 'POST', url: '/api/shifts', body: { openingCash: '1000.00' } });
  });

  it("ends it with the cash counted, and says how far out the drawer is", async () => {
    server = await fakeServer(certificate, 200, { shift: closed });
    expect(await closeShift(server.address, pass, '1021.20', 'gave too much change', pinned())).toMatchObject({
      ok: true,
      shift: { expectedCash: 104120, countedCash: 102120, variance: -2000, varianceInWords: '₱20.00 short' },
    });
    expect(server.received[0]).toMatchObject({ method: 'POST', url: '/api/shifts/current/close', body: { countedCash: '1021.20', note: 'gave too much change' } });
  });

  it("catches cash typed wrong without asking the server", async () => {
    server = await fakeServer(certificate, 201, { shift: closed });
    expect(await openShift(server.address, pass, 'a thousand', pinned())).toMatchObject({ ok: false, reason: 'refused' });
    expect(await closeShift(server.address, pass, '', '', pinned())).toMatchObject({ ok: false, reason: 'refused', message: /^Type the cash/ });
    expect(server.received).toEqual([]);
  });
});
