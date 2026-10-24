import { priceSale, readCash, takeCash, type CartLine, type SaleProduct } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

const product = (code: string, name: string, retailPrice: number, status: SaleProduct['status'] = 'Active'): SaleProduct => ({
  id: `id-${code}`,
  code,
  name,
  retailPrice,
  status,
});
const sardines = product('PRD-0007', 'Sardines 155g', 2575);
const rice = product('PRD-0042', 'Sack of rice 25kg', 145050);
const senior = { kind: 'senior' as const, idNumber: ' OSCA-12345 ', customerName: ' Lola Cruz ' };

describe('pricing a sale', () => {
  it('charges each line its price times its pieces, and adds them up', () => {
    const sale = priceSale([{ product: sardines, quantity: 3 }, { product: rice, quantity: 1 }], null);
    expect(sale.lines).toEqual([
      { productId: 'id-PRD-0007', code: 'PRD-0007', name: 'Sardines 155g', quantity: 3, unitPrice: 2575, subtotal: 7725, discount: 0, total: 7725 },
      { productId: 'id-PRD-0042', code: 'PRD-0042', name: 'Sack of rice 25kg', quantity: 1, unitPrice: 145050, subtotal: 145050, discount: 0, total: 145050 },
    ]);
    expect(sale).toMatchObject({ subtotal: 152775, discountTotal: 0, total: 152775, discount: null });
  });

  it('takes 20% off every line for a senior citizen or a PWD, keeping whose ID it was', () => {
    const sale = priceSale([{ product: sardines, quantity: 3 }, { product: rice, quantity: 1 }], senior);
    expect(sale.lines.map((line) => [line.discount, line.total])).toEqual([
      [1545, 6180],
      [29010, 116040],
    ]);
    expect(sale).toMatchObject({ subtotal: 152775, discountTotal: 30555, total: 122220 });
    expect(sale.discount).toEqual({ kind: 'senior', idNumber: 'OSCA-12345', customerName: 'Lola Cruz' });
    expect(priceSale([{ product: sardines, quantity: 1 }], { ...senior, kind: 'pwd' }).discountTotal).toBe(515);
  });

  it('rounds a discount to the centavo, half a centavo and up rounding up', () => {
    const cheap = (centavos: number) => priceSale([{ product: product('X', 'Candy', centavos), quantity: 1 }], senior).discountTotal;
    expect(cheap(2)).toBe(0); // 0.4 of a centavo
    expect(cheap(3)).toBe(1); // 0.6
    expect(cheap(5)).toBe(1); // exactly 1
    expect(cheap(13)).toBe(3); // 2.6
  });

  it('always adds up: the lines are the total, whatever is in the cart', () => {
    for (let round = 0; round < 200; round++) {
      const cart: CartLine[] = Array.from({ length: 1 + (round % 7) }, (_, i) => ({
        product: product(`P${i}`, `Product ${i}`, 1 + ((round * 7919 + i * 104729) % 500_000)),
        quantity: 1 + ((round + i) % 12),
      }));
      const sale = priceSale(cart, round % 2 ? senior : null);
      expect(sale.lines.reduce((sum, line) => sum + line.total, 0)).toBe(sale.total);
      expect(sale.total).toBe(sale.subtotal - sale.discountTotal);
    }
  });

  it("refuses what can't be rung up, saying which product", () => {
    expect(refusalOf(() => priceSale([], null))).toMatchObject({ kind: 'invalid', message: 'Scan or type at least one product.' });
    expect(refusalOf(() => priceSale([{ product: sardines, quantity: 0 }], null))).toMatchObject({ message: 'Sardines 155g: sell at least one whole piece.' });
    expect(refusalOf(() => priceSale([{ product: sardines, quantity: 1.5 }], null))).toMatchObject({ message: 'Sardines 155g: sell at least one whole piece.' });
    expect(refusalOf(() => priceSale([{ product: sardines, quantity: 10_001 }], null))).toMatchObject({ message: /at most 10,000 pieces/ });
    expect(refusalOf(() => priceSale([{ product: { ...sardines, status: 'Inactive' }, quantity: 1 }], null))).toMatchObject({
      message: "Sardines 155g is switched off, so it can't be sold.",
    });
    // The launch plan's lesson: an unpriced item once rang up free.
    expect(refusalOf(() => priceSale([{ product: { ...sardines, retailPrice: 0 }, quantity: 1 }], null))).toMatchObject({
      message: "Sardines 155g has no price yet, so it can't be sold. Ask whoever manages products to price it.",
    });
  });

  it("needs the ID number and the name for a statutory discount, and knows only the two", () => {
    const cart = [{ product: sardines, quantity: 1 }];
    expect(refusalOf(() => priceSale(cart, { ...senior, idNumber: ' ' }))).toMatchObject({ message: "Type the senior citizen's ID number." });
    expect(refusalOf(() => priceSale(cart, { ...senior, kind: 'pwd', idNumber: '' }))).toMatchObject({ message: "Type the PWD's ID number." });
    expect(refusalOf(() => priceSale(cart, { ...senior, customerName: '' }))).toMatchObject({ message: "Type the senior citizen's name, as it is on the ID." });
    expect(refusalOf(() => priceSale(cart, { ...senior, kind: 'student' as never }))).toMatchObject({ message: '"student" isn\'t a discount this version of KVNsys knows.' });
  });
});

describe('taking cash', () => {
  it('gives the change, or none when it is exact', () => {
    expect(takeCash(122220, 150000)).toEqual({ type: 'Cash', tendered: 150000, change: 27780 });
    expect(takeCash(122220, 122220)).toEqual({ type: 'Cash', tendered: 122220, change: 0 });
  });

  it('says how much is short when it is not enough', () => {
    expect(refusalOf(() => takeCash(122220, 100000))).toMatchObject({ message: "₱1,000.00 isn't enough: the total is ₱1,222.20." });
    expect(refusalOf(() => takeCash(100, -1))).toMatchObject({ message: "That isn't an amount of cash." });
    expect(refusalOf(() => takeCash(100, 1.5))).toMatchObject({ message: "That isn't an amount of cash." });
  });
});

describe('cash as typed', () => {
  it('is pesos, with or without thousands commas and centavos', () => {
    expect(readCash(' 1,500 ')).toBe(150000);
    expect(readCash('1500.5')).toBe(150050);
    expect(readCash('0')).toBe(0);
  });

  it('refuses anything else, saying how to type it', () => {
    expect(refusalOf(() => readCash(''))).toMatchObject({ message: 'Type the cash the customer gave, in pesos, like 1500.' });
    for (const typed of ['abc', '-5', '1.005', '1,50']) {
      expect(refusalOf(() => readCash(typed)), typed).toMatchObject({ message: `"${typed}" isn't an amount of cash. Type it in pesos, like 1500 or 1500.50.` });
    }
  });
});
