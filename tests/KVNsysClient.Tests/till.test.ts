import { Till, type SaleForm, type SaleProduct, type SaleResult } from '@kvnsys/client';
import { describe, expect, it } from 'vitest';

const sardines: SaleProduct = { id: 'p-7', code: 'PRD-0007', name: 'Sardines 155g', retailPrice: 2575, status: 'Active' };
const rice: SaleProduct = { id: 'p-42', code: 'PRD-0042', name: 'Sack of rice 25kg', retailPrice: 145050, status: 'Active' };
const senior = { kind: 'senior' as const, idNumber: 'OSCA-1', customerName: 'Lola Cruz' };
const found = (product: SaleProduct) => async () => ({ ok: true as const, product });
const notFound = async () => ({ ok: false as const, reason: 'not-found' as const, message: 'No product has the code or barcode X.' });
const shown = (till: Till) => till.view().lines.map((line) => [line.name, line.quantity, line.total]);

describe('the till: the sale being rung up on a register', () => {
  it('starts empty, at zero', () => {
    expect(new Till().view()).toEqual({ lines: [], subtotal: 0, discountTotal: 0, total: 0, discount: null });
  });

  it('adds one of what was scanned, and one more each time it is scanned again, at its price now', async () => {
    const till = new Till();
    await till.scan(found(sardines));
    await till.scan(found(rice));
    const result = await till.scan(found({ ...sardines, retailPrice: 3000 }));
    expect(result).toMatchObject({ ok: true, till: { total: 145050 + 6000 } });
    expect(shown(till)).toEqual([
      ['Sardines 155g', 2, 6000],
      ['Sack of rice 25kg', 1, 145050],
    ]);
  });

  it("leaves the sale as it was when what's scanned isn't found, or can't be sold", async () => {
    const till = new Till();
    await till.scan(found(sardines));
    expect(await till.scan(notFound)).toEqual({ ok: false, reason: 'not-found', message: 'No product has the code or barcode X.' });
    expect(await till.scan(found({ ...rice, retailPrice: 0 }))).toMatchObject({ ok: false, reason: 'refused', message: /^Sack of rice 25kg has no price yet/ });
    expect(shown(till)).toEqual([['Sardines 155g', 1, 2575]]);
  });

  it('changes how many of a line, refusing less than one, and removes a line', async () => {
    const till = new Till();
    await till.scan(found(sardines));
    await till.scan(found(rice));
    expect(till.setQuantity('p-7', 4)).toMatchObject({ ok: true, till: { subtotal: 4 * 2575 + 145050 } });
    expect(till.setQuantity('p-7', 0)).toMatchObject({ ok: false, message: 'Sardines 155g: sell at least one whole piece.' });
    expect(till.remove('p-42')).toMatchObject({ ok: true, till: { total: 10300 } });
    expect(shown(till)).toEqual([['Sardines 155g', 4, 10300]]);
  });

  it('gives the senior/PWD discount only with its ID number and name, and takes it off', async () => {
    const till = new Till();
    expect(till.setDiscount({ ...senior, idNumber: '' })).toMatchObject({ ok: false, message: "Type the senior citizen's ID number." });
    await till.scan(found(sardines));
    expect(till.setDiscount({ ...senior, customerName: ' ' })).toMatchObject({ ok: false });
    expect(till.view().discount).toBeNull();
    expect(till.setDiscount({ ...senior, idNumber: ' OSCA-1 ' })).toMatchObject({ ok: true, till: { discountTotal: 515, total: 2060, discount: senior } });
    expect(till.setDiscount(null)).toMatchObject({ ok: true, till: { discountTotal: 0, total: 2575, discount: null } });
  });

  it('records the sale with its cart, discount and cash, and starts a new one only once it is recorded', async () => {
    const till = new Till();
    await till.scan(found(sardines));
    till.setDiscount(senior);
    const sent: SaleForm[] = [];
    const refused: SaleResult = { ok: false, reason: 'refused', message: "₱10.00 isn't enough: the total is ₱20.60." };
    expect(await till.pay('10', async (form) => (sent.push(form), refused))).toEqual(refused);
    expect(till.view().total).toBe(2060);

    const recorded = { ok: true, receipt: {}, shop: {}, cashier: 'Ana' } as unknown as SaleResult;
    expect(await till.pay('50', async (form) => (sent.push(form), recorded))).toBe(recorded);
    expect(sent[1]).toEqual({ cart: [{ product: sardines, quantity: 1 }], discount: senior, tendered: '50' });
    expect(till.view()).toEqual({ lines: [], subtotal: 0, discountTotal: 0, total: 0, discount: null });
  });
});
