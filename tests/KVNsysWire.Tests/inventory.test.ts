import {
  FindInventoryItemPath,
  MovementOnWire,
  MovementsShown,
  ProductInventoryReply,
  productInventoryPath,
  ProtocolVersion,
  InventoryListReply,
  InventoryMovementsPath,
  InventoryMovementsRequest,
  InventoryItemReply,
  InventoryPath,
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
  categoryId: null,
  brandId: null,
  supplierId: null,
  manufacturerId: null,
  unitOfMeasure: null,
  tracksStock: true,
  costPrice: '0.00',
  promoPrice: null,
  wholesalePrice: null,
  wholesaleQuantity: null,
  hasWarranty: false,
  warrantyMonths: 0,
  hasPicture: false,
};
const location = { id: '0199c7a0-0000-7000-8000-0000000000aa', code: 'HQ', name: 'Head Office' };
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
  it('live under /api/inventory, and came with protocol 8', () => {
    expect(InventoryPath).toBe('/api/inventory');
    expect(InventoryMovementsPath).toBe('/api/inventory/movements');
    expect(FindInventoryItemPath).toBe('/api/inventory/find');
    expect(productInventoryPath('a/b')).toBe('/api/inventory/a%2Fb');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(8);
  });

  it("answer with the location and every product's stock, or one product's stock and newest lines", () => {
    expect(InventoryListReply.safeParse({ location, items: [{ product, stock: 24 }] }).success).toBe(true);
    expect(InventoryListReply.safeParse({ location, items: [{ product, stock: 2.5 }] }).success).toBe(false);
    expect(ProductInventoryReply.safeParse({ location, product, stock: 24, movements: [line], more: false }).success).toBe(true);
    expect(ProductInventoryReply.safeParse({ location, product, stock: 24, movements: [line] }).success).toBe(false);
    expect(MovementsShown).toBeGreaterThan(0);
    expect(InventoryItemReply.safeParse({ location, product, stock: -3 }).success).toBe(true);
  });

  it("carry who saved a line, with no name when their account isn't on this server, or nobody", () => {
    expect(MovementOnWire.safeParse({ ...line, createdBy: { id: line.createdBy.id, name: null } }).success).toBe(true);
    expect(MovementOnWire.safeParse({ ...line, createdBy: null }).success).toBe(true);
    expect(MovementOnWire.safeParse({ ...line, type: 'disposal' }).success).toBe(false);
  });

  it('send one line or a delivery of many, but never none and never an unknown kind', () => {
    expect(InventoryMovementsRequest.safeParse({ movements: [received] }).success).toBe(true);
    expect(InventoryMovementsRequest.safeParse({ movements: Array(500).fill(received) }).success).toBe(true);
    expect(InventoryMovementsRequest.safeParse({ movements: Array(501).fill(received) }).success).toBe(false);
    expect(InventoryMovementsRequest.safeParse({ movements: [] }).success).toBe(false);
    expect(InventoryMovementsRequest.safeParse({ movements: [{ ...received, type: 'transfer' }] }).success).toBe(false);
    expect(InventoryMovementsRequest.safeParse({ movements: [{ ...received, quantityChange: '24' }] }).success).toBe(false);
  });
});
