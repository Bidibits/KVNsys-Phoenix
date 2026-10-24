import { FindSaleProductPath, ProtocolVersion, ReceiptReply, SaleFields, SaleProductOnWire, SalesPath } from '@kvnsys/wire';
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
    expect(ReceiptReply.safeParse({ receipt, shop: { id: 'x', code: 'HQ', name: 'Head Office' }, cashier: 'Ana Cruz' }).success).toBe(true);
    expect(ReceiptReply.safeParse({ receipt: { ...receipt, payment: { ...receipt.payment, type: 'Card' } }, shop: { id: 'x', code: 'HQ', name: 'H' }, cashier: 'A' }).success).toBe(false);
  });
});
