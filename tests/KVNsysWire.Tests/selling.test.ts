import { DaySalesReply, FindSaleProductPath, ProtocolVersion, receiptPath, ReceiptReply, SaleFields, SaleProductOnWire, SalesPath } from '@kvnsys/wire';
import { describe, expect, it } from 'vitest';

const sale = {
  lines: [{ productId: '0199c7a0-0000-7000-8000-000000000001', quantity: 2 }],
  discount: { kind: 'senior', idNumber: 'OSCA-1', customerName: 'Lola Cruz' },
  tendered: '1500.00',
  expectedTotal: '41.20',
};
const receipt = {
  id: '0199c7a0-0000-7000-8000-0000000000bb',
  code: 'HQ-000001',
  number: 1,
  lines: [{ productId: sale.lines[0]!.productId, code: 'PRD-0007', name: 'Sardines 155g', quantity: 2, unitPrice: '25.75', subtotal: '51.50', discount: '10.30', total: '41.20' }],
  subtotal: '51.50',
  discountTotal: '10.30',
  total: '41.20',
  discount: sale.discount,
  payment: { type: 'Cash', tendered: '1500.00', change: '1458.80' },
  createdAt: '2026-10-24T09:30:00.000Z',
};

describe('the selling calls', () => {
  // The rule, not today's number: selling arrived with protocol 9, and it only goes up.
  it('live under /api/sales, and came with protocol 9', () => {
    expect(SalesPath).toBe('/api/sales');
    expect(FindSaleProductPath).toBe('/api/sales/find');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(9);
  });

  it('send every amount as pesos text, never a JSON number', () => {
    expect(SaleFields.safeParse(sale).success).toBe(true);
    expect(SaleFields.safeParse({ ...sale, tendered: 1500 }).success).toBe(false);
    expect(SaleFields.safeParse({ ...sale, expectedTotal: '41.2' }).success).toBe(false);
    expect(SaleProductOnWire.safeParse({ id: 'x', code: 'P', name: 'N', retailPrice: 25.75, status: 'Active' }).success).toBe(false);
  });

  it('send at least one line, a known discount or none, and answer with a receipt, its shop and its cashier', () => {
    expect(SaleFields.safeParse({ ...sale, lines: [] }).success).toBe(false);
    expect(SaleFields.safeParse({ ...sale, discount: null }).success).toBe(true);
    expect(SaleFields.safeParse({ ...sale, discount: { ...sale.discount, kind: 'student' } }).success).toBe(false);
    expect(ReceiptReply.safeParse({ receipt, shop: { id: 'x', code: 'HQ', name: 'Head Office' }, cashier: 'Ana Cruz', register: 'Counter 1' }).success).toBe(true);
    expect(ReceiptReply.safeParse({ receipt: { ...receipt, payment: { ...receipt.payment, type: 'Card' } }, shop: { id: 'x', code: 'HQ', name: 'H' }, cashier: 'A', register: null }).success).toBe(false);
  });
});

describe("a day's sales, and one receipt again", () => {
  const shop = { id: 'x', code: 'HQ', name: 'Head Office' };
  const line = { id: receipt.id, code: 'HQ-000001', number: 1, createdAt: receipt.createdAt, cashier: 'Ana Cruz', pieces: 2, subtotal: '51.50', discountTotal: '10.30', total: '41.20', discountKind: 'senior' };
  const totals = { receipts: 1, pieces: 2, subtotal: '51.50', discountTotal: '10.30', total: '41.20' };

  // The rule, not today's number: these arrived with protocol 10.
  it('live at /api/sales and /api/sales/<id>, and came with protocol 10', () => {
    expect(receiptPath('a/b')).toBe('/api/sales/a%2Fb');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(10);
  });

  it("answer with the shop, the day, its receipts and their totals, money as text; a cashier can be unknown", () => {
    expect(DaySalesReply.safeParse({ shop, date: '2026-10-24', receipts: [line], totals }).success).toBe(true);
    expect(DaySalesReply.safeParse({ shop, date: '2026-10-24', receipts: [{ ...line, cashier: null, discountKind: null }], totals }).success).toBe(true);
    expect(DaySalesReply.safeParse({ shop, date: '24/10/2026', receipts: [], totals }).success).toBe(false);
    expect(DaySalesReply.safeParse({ shop, date: '2026-10-24', receipts: [{ ...line, total: 41.2 }], totals }).success).toBe(false);
    expect(ReceiptReply.safeParse({ receipt, shop, cashier: null, register: null }).success).toBe(true);
  });
});
