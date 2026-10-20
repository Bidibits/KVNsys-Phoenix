import { checkStockChange, MovementTypes, type StockChange } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

const received: StockChange = { locationId: 'loc-1', productId: 'prd-1', type: 'from_supplier', quantityChange: 24, note: null, source: null };

describe('a stock change', () => {
  it('is tidied: note and source trimmed, an empty note as none', () => {
    expect(checkStockChange({ ...received, note: '  ', source: { table: ' sales ', id: ' s-1 ' } })).toEqual({ ...received, note: null, source: { table: 'sales', id: 's-1' } });
  });

  it('moves whole pieces, at least one, at most a million', () => {
    expect(refusalOf(() => checkStockChange({ ...received, quantityChange: 1.5 }))).toMatchObject({ kind: 'invalid', message: 'Stock moves in whole pieces.' });
    expect(refusalOf(() => checkStockChange({ ...received, quantityChange: 0 }))).toMatchObject({ message: 'A stock movement has to move at least one piece.' });
    expect(refusalOf(() => checkStockChange({ ...received, quantityChange: Number.NaN }))).toMatchObject({ message: 'Stock moves in whole pieces.' });
    expect(refusalOf(() => checkStockChange({ ...received, quantityChange: 1_000_001 }))).toMatchObject({ message: 'One movement can be at most 1,000,000 pieces.' });
    expect(checkStockChange({ ...received, quantityChange: 1_000_000 }).quantityChange).toBe(1_000_000);
  });

  it('goes the right way for its kind: in from a supplier, out to a customer, either way for a count', () => {
    expect(refusalOf(() => checkStockChange({ ...received, quantityChange: -3 }))).toMatchObject({ message: /from a supplier come in/ });
    expect(refusalOf(() => checkStockChange({ ...received, type: 'to_customer', quantityChange: 3 }))).toMatchObject({ message: /sold go out/ });
    expect(checkStockChange({ ...received, type: 'to_customer', quantityChange: -3 }).quantityChange).toBe(-3);
    expect(checkStockChange({ ...received, type: 'adjustment', quantityChange: -2, note: 'counted 22' }).quantityChange).toBe(-2);
    expect(checkStockChange({ ...received, type: 'adjustment', quantityChange: 2, note: 'found 2 in the stockroom' }).quantityChange).toBe(2);
  });

  it('needs a reason when a count is put right', () => {
    expect(refusalOf(() => checkStockChange({ ...received, type: 'adjustment', quantityChange: -2, note: ' ' }))).toMatchObject({
      kind: 'invalid',
      message: 'Say why the count is being put right, such as "counted 22 on the shelf".',
    });
    expect(refusalOf(() => checkStockChange({ ...received, note: 'x'.repeat(501) }))).toMatchObject({ message: /at most 500/ });
  });

  it('refuses a kind of movement this version does not know', () => {
    expect(refusalOf(() => checkStockChange({ ...received, type: 'disposal' as never }))).toMatchObject({
      message: '"disposal" isn\'t a kind of stock movement this version of KVNsys knows.',
    });
    expect(MovementTypes).toEqual(['from_supplier', 'to_customer', 'adjustment']);
  });

  it('needs a shop, a product, and a whole source if it names one', () => {
    expect(refusalOf(() => checkStockChange({ ...received, locationId: ' ' }))).toMatchObject({ message: /needs the shop/ });
    expect(refusalOf(() => checkStockChange({ ...received, productId: '' }))).toMatchObject({ message: /needs the product/ });
    expect(refusalOf(() => checkStockChange({ ...received, source: { table: 'sales', id: ' ' } }))).toMatchObject({ message: /both its kind and its id/ });
  });
});
