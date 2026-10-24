import {
  FindStockItemPath,
  MovementOnWire,
  MovementsShown,
  ProductStockReply,
  productStockPath,
  ProtocolVersion,
  StockListReply,
  StockMovementsPath,
  StockMovementsRequest,
  StockItemReply,
  StockPath,
} from '@kvnsys/wire';
import { describe, expect, it } from 'vitest';

const product = {
  id: '0199c7a0-0000-7000-8000-000000000001',
  code: 'PRD-0042',
  barcode: null,
  name: 'Sack of rice 25kg',
  retailPrice: '1450.50',
  status: 'Active',
  description: null,
};
const shop = { id: '0199c7a0-0000-7000-8000-0000000000aa', code: 'HQ', name: 'Head Office' };
const line = {
  id: '0199c7a0-0000-7000-8000-0000000000bb',
  productId: product.id,
  type: 'from_supplier',
  quantityChange: 24,
  note: null,
  source: null,
  resultingOnHand: 24,
  createdAt: '2026-10-24T09:30:00.000Z',
  createdBy: { id: '0199c7a0-0000-7000-8000-0000000000cc', name: 'Ana Cruz' },
};
const received = { productId: product.id, type: 'from_supplier', quantityChange: 24, note: null };

describe('the stock calls', () => {
  // The rule, not today's number: stock arrived with protocol 8, and it only goes up.
  it('live under /api/stock, and came with protocol 8', () => {
    expect(StockPath).toBe('/api/stock');
    expect(StockMovementsPath).toBe('/api/stock/movements');
    expect(FindStockItemPath).toBe('/api/stock/find');
    expect(productStockPath('a/b')).toBe('/api/stock/a%2Fb');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(8);
  });

  it("answer with the shop and every product's stock, or one product's stock and newest lines", () => {
    expect(StockListReply.safeParse({ shop, items: [{ product, stock: 24 }] }).success).toBe(true);
    expect(StockListReply.safeParse({ shop, items: [{ product, stock: 2.5 }] }).success).toBe(false);
    expect(ProductStockReply.safeParse({ shop, product, stock: 24, movements: [line], more: false }).success).toBe(true);
    expect(ProductStockReply.safeParse({ shop, product, stock: 24, movements: [line] }).success).toBe(false);
    expect(MovementsShown).toBeGreaterThan(0);
    expect(StockItemReply.safeParse({ shop, product, stock: -3 }).success).toBe(true);
  });

  it("carry who saved a line, with no name when their account isn't on this server, or nobody", () => {
    expect(MovementOnWire.safeParse({ ...line, createdBy: { id: line.createdBy.id, name: null } }).success).toBe(true);
    expect(MovementOnWire.safeParse({ ...line, createdBy: null }).success).toBe(true);
    expect(MovementOnWire.safeParse({ ...line, type: 'disposal' }).success).toBe(false);
  });

  it('send one line or a delivery of many, but never none and never an unknown kind', () => {
    expect(StockMovementsRequest.safeParse({ movements: [received] }).success).toBe(true);
    expect(StockMovementsRequest.safeParse({ movements: Array(500).fill(received) }).success).toBe(true);
    expect(StockMovementsRequest.safeParse({ movements: Array(501).fill(received) }).success).toBe(false);
    expect(StockMovementsRequest.safeParse({ movements: [] }).success).toBe(false);
    expect(StockMovementsRequest.safeParse({ movements: [{ ...received, type: 'transfer' }] }).success).toBe(false);
    expect(StockMovementsRequest.safeParse({ movements: [{ ...received, quantityChange: '24' }] }).success).toBe(false);
  });
});
