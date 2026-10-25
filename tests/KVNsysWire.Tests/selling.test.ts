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
  lines: [{ productId: sale.lines[0]!.productId, code: 'PRD-0007', name: 'Sardines 155g', quantity: 2, unitPrice: '25.75', priceBasis: 'Retail', subtotal: '51.50', discount: '10.30', total: '41.20' }],
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

  it('carry every price a product can be charged at, and say which one each line was (protocol 16)', () => {
    expect(ProtocolVersion).toBeGreaterThanOrEqual(16);
    const fan = { id: 'x', code: 'P', name: 'N', retailPrice: '100.00', status: 'Active', promoPrice: '90.00', wholesalePrice: '85.00', wholesaleQuantity: 10 };
    expect(SaleProductOnWire.safeParse(fan).success).toBe(true);
    expect(SaleProductOnWire.safeParse({ ...fan, promoPrice: null, wholesalePrice: null, wholesaleQuantity: null }).success).toBe(true);
    expect(SaleProductOnWire.safeParse({ ...fan, promoPrice: 90 }).success).toBe(false);
    const { promoPrice: _left, ...withoutPromo } = fan;
    expect(SaleProductOnWire.safeParse(withoutPromo).success).toBe(false);
    const shop = { id: 'x', code: 'HQ', name: 'Head Office' };
    const line = (priceBasis: unknown) => ({ receipt: { ...receipt, lines: [{ ...receipt.lines[0], priceBasis }] }, shop, cashier: null, register: null });
    for (const basis of ['Retail', 'Promo', 'Wholesale']) expect(ReceiptReply.safeParse(line(basis)).success, basis).toBe(true);
    expect(ReceiptReply.safeParse(line('Member')).success).toBe(false);
    expect(ReceiptReply.safeParse(line(undefined)).success).toBe(false);
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

describe('the shift calls', () => {
  const shift = {
    id: 's1',
    code: 'HQ-S00001',
    status: 'Open',
    openingCash: '1000.00',
    cashSales: '41.20',
    receipts: 1,
    discounts: '10.30',
    expectedCash: '1041.20',
    countedCash: null,
    openedAt: '2026-10-24T00:00:00.000Z',
    openedBy: 'Ana Cruz',
    closedAt: null,
    closedBy: null,
    note: null,
  };

  it('live under /api/shifts, came with protocol 12, and carry money as text', async () => {
    const { CloseShiftPath, CurrentShiftPath, CurrentShiftReply, OpenShiftFields, ShiftReply, ShiftsPath } = await import('@kvnsys/wire');
    expect([ShiftsPath, CurrentShiftPath, CloseShiftPath]).toEqual(['/api/shifts', '/api/shifts/current', '/api/shifts/current/close']);
    expect(ProtocolVersion).toBeGreaterThanOrEqual(12);
    expect(CurrentShiftReply.safeParse({ shift: null }).success).toBe(true);
    expect(ShiftReply.safeParse({ shift }).success).toBe(true);
    expect(ShiftReply.safeParse({ shift: { ...shift, status: 'Paused' } }).success).toBe(false);
    expect(OpenShiftFields.safeParse({ openingCash: 1000 }).success).toBe(false);
  });
});
