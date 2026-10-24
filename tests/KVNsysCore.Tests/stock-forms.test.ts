import { readCount, readDelivery, readPieces } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

const sardines = { productId: 'prd-1', name: 'Sardines 155g', pieces: '24' };
const soap = { productId: 'prd-2', name: 'Bath soap', pieces: '1,200' };

describe('pieces as typed', () => {
  it('are whole numbers, with or without thousands commas', () => {
    expect(readPieces(' 24 ')).toBe(24);
    expect(readPieces('1,200')).toBe(1200);
    expect(readPieces('0')).toBe(0);
  });

  it('refuse anything else, saying how to type them', () => {
    expect(refusalOf(() => readPieces(''))).toMatchObject({ kind: 'invalid', message: 'Type how many pieces, like 24.' });
    for (const typed of ['2.5', '-3', 'abc', '12,00', '1 200', '+4']) {
      expect(refusalOf(() => readPieces(typed)), typed).toMatchObject({ message: `"${typed}" isn't a number of pieces. Type a whole number, like 24.` });
    }
    expect(refusalOf(() => readPieces('1000001'))).toMatchObject({ message: /more than 1,000,000 pieces/ });
  });
});

describe('a delivery as typed', () => {
  it('is one goods-in line per line typed, each carrying the delivery note', () => {
    expect(readDelivery([sardines, soap, sardines], '  DR 10234  ')).toEqual([
      { productId: 'prd-1', type: 'from_supplier', quantityChange: 24, note: 'DR 10234' },
      { productId: 'prd-2', type: 'from_supplier', quantityChange: 1200, note: 'DR 10234' },
      { productId: 'prd-1', type: 'from_supplier', quantityChange: 24, note: 'DR 10234' },
    ]);
    expect(readDelivery([sardines], ' ')[0]!.note).toBeNull();
  });

  it('names the product a mistake is on, and refuses a line of none or a delivery of nothing', () => {
    expect(refusalOf(() => readDelivery([sardines, { ...soap, pieces: 'ten' }], ''))).toMatchObject({
      message: `Bath soap: "ten" isn't a number of pieces. Type a whole number, like 24.`,
    });
    expect(refusalOf(() => readDelivery([{ ...soap, pieces: '0' }], ''))).toMatchObject({ message: /^Bath soap: a delivery brings at least one piece/ });
    expect(refusalOf(() => readDelivery([], ''))).toMatchObject({ message: 'Add at least one product to the delivery.' });
  });
});

describe('a count as typed', () => {
  const count = { productId: 'prd-1', onHand: 24, counted: '22', reason: ' 2 torn, thrown away ' };

  it('puts the stock right by the difference between the count and what KVNsys had, with the reason', () => {
    expect(readCount(count)).toEqual({ productId: 'prd-1', type: 'adjustment', quantityChange: -2, note: '2 torn, thrown away' });
    expect(readCount({ ...count, counted: '30' }).quantityChange).toBe(6);
    expect(readCount({ ...count, onHand: -3, counted: '0' }).quantityChange).toBe(3);
  });

  it('refuses a count that matches, one without a reason, or one that is not a number', () => {
    expect(refusalOf(() => readCount({ ...count, counted: '24' }))).toMatchObject({ message: "KVNsys already has 24, so there's nothing to put right." });
    expect(refusalOf(() => readCount({ ...count, reason: '  ' }))).toMatchObject({ message: /^Say why the count is different/ });
    expect(refusalOf(() => readCount({ ...count, counted: '' }))).toMatchObject({ message: 'Type how many pieces, like 24.' });
  });
});
