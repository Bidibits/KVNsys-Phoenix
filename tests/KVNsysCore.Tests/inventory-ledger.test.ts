import { checkInventoryChange, MovementTypes, rightToRecordByHand, withNeededRights, type InventoryChange } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

const received: InventoryChange = { locationId: 'loc-1', productId: 'prd-1', type: 'from_supplier', quantityChange: 24, note: null, source: null };

describe('a stock change', () => {
  it('is tidied: note and source trimmed, an empty note as none', () => {
    expect(checkInventoryChange({ ...received, note: '  ', source: { table: ' sales ', id: ' s-1 ' } })).toEqual({ ...received, note: null, source: { table: 'sales', id: 's-1' } });
  });

  it('moves whole pieces, at least one, at most a million', () => {
    expect(refusalOf(() => checkInventoryChange({ ...received, quantityChange: 1.5 }))).toMatchObject({ kind: 'invalid', message: 'Stock moves in whole pieces.' });
    expect(refusalOf(() => checkInventoryChange({ ...received, quantityChange: 0 }))).toMatchObject({ message: 'A stock movement has to move at least one piece.' });
    expect(refusalOf(() => checkInventoryChange({ ...received, quantityChange: Number.NaN }))).toMatchObject({ message: 'Stock moves in whole pieces.' });
    expect(refusalOf(() => checkInventoryChange({ ...received, quantityChange: 1_000_001 }))).toMatchObject({ message: 'One movement can be at most 1,000,000 pieces.' });
    expect(checkInventoryChange({ ...received, quantityChange: 1_000_000 }).quantityChange).toBe(1_000_000);
  });

  it('goes the right way for its kind: in from a supplier, out to a customer, either way for a count', () => {
    expect(refusalOf(() => checkInventoryChange({ ...received, quantityChange: -3 }))).toMatchObject({ message: /from a supplier come in/ });
    expect(refusalOf(() => checkInventoryChange({ ...received, type: 'to_customer', quantityChange: 3 }))).toMatchObject({ message: /sold go out/ });
    expect(checkInventoryChange({ ...received, type: 'to_customer', quantityChange: -3 }).quantityChange).toBe(-3);
    expect(checkInventoryChange({ ...received, type: 'adjustment', quantityChange: -2, note: 'counted 22' }).quantityChange).toBe(-2);
    expect(checkInventoryChange({ ...received, type: 'adjustment', quantityChange: 2, note: 'found 2 in the stockroom' }).quantityChange).toBe(2);
  });

  it('needs a reason when a count is put right', () => {
    expect(refusalOf(() => checkInventoryChange({ ...received, type: 'adjustment', quantityChange: -2, note: ' ' }))).toMatchObject({
      kind: 'invalid',
      message: 'Say why the count is being put right, such as "counted 22 on the shelf".',
    });
    expect(refusalOf(() => checkInventoryChange({ ...received, note: 'x'.repeat(501) }))).toMatchObject({ message: /at most 500/ });
  });

  it('refuses a kind of movement this version does not know', () => {
    expect(refusalOf(() => checkInventoryChange({ ...received, type: 'disposal' as never }))).toMatchObject({
      message: '"disposal" isn\'t a kind of stock movement this version of KVNsys knows.',
    });
    expect(MovementTypes).toEqual(['from_supplier', 'to_customer', 'adjustment']);
  });

  it('needs a location, a product, and a whole source if it names one', () => {
    expect(refusalOf(() => checkInventoryChange({ ...received, locationId: ' ' }))).toMatchObject({ message: /needs the location/ });
    expect(refusalOf(() => checkInventoryChange({ ...received, productId: '' }))).toMatchObject({ message: /needs the product/ });
    expect(refusalOf(() => checkInventoryChange({ ...received, source: { table: 'sales', id: ' ' } }))).toMatchObject({ message: /both its kind and its id/ });
  });
});

describe('recording stock by hand', () => {
  it('needs its own right to receive goods, and another to put a count right', () => {
    expect(rightToRecordByHand('from_supplier')).toBe('inventory.receive');
    expect(rightToRecordByHand('adjustment')).toBe('inventory.adjust');
  });

  it('never covers goods out to a customer: only a sale records those', () => {
    expect(rightToRecordByHand('to_customer')).toBeNull();
  });

  it('brings the right to see stock along with either', () => {
    expect(withNeededRights(['inventory.receive'])).toEqual(['inventory.view', 'inventory.receive']);
    expect(withNeededRights(['inventory.adjust'])).toEqual(['inventory.view', 'inventory.adjust']);
  });
});
