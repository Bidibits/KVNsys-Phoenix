import {
  blankProductForm,
  checkProduct,
  displayPesos,
  isCentavos,
  MaxCentavos,
  parsePesos,
  pesosText,
  productFormFor,
  readProductForm,
  type ProductDetails,
} from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

describe('money', () => {
  it('reads pesos as a person or a spreadsheet writes them, into whole centavos', () => {
    expect(parsePesos('12')).toBe(1200);
    expect(parsePesos('12.5')).toBe(1250);
    expect(parsePesos('12.50')).toBe(1250);
    expect(parsePesos(' 0.05 ')).toBe(5);
    expect(parsePesos('1,234.56')).toBe(123456);
    expect(parsePesos('1,234,567')).toBe(123456700);
    expect(parsePesos('007.10')).toBe(710);
  });

  it('refuses anything that isn\'t an exact amount of pesos', () => {
    for (const text of ['', ' ', '-1', '12.555', '12.', '.5', 'abc', '1,23.00', '12,34', '₱12', '1e3', '0x10', '12 50']) {
      expect(parsePesos(text), text).toBeNull();
    }
  });

  it('adds up exactly, where floating point would not (0.1 + 0.2)', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(parsePesos('0.1')! + parsePesos('0.2')!).toBe(parsePesos('0.3'));
  });

  it('holds up to what the database holds, and no more', () => {
    expect(parsePesos('999,999,999,999.99')).toBe(MaxCentavos);
    expect(parsePesos('1,000,000,000,000')).toBeNull();
    expect(isCentavos(MaxCentavos)).toBe(true);
    expect(isCentavos(MaxCentavos + 1)).toBe(false);
    expect(isCentavos(-1)).toBe(false);
    expect(isCentavos(12.5)).toBe(false);
  });

  it('writes centavos back as plain pesos, and reads them back the same', () => {
    expect(pesosText(0)).toBe('0.00');
    expect(pesosText(5)).toBe('0.05');
    expect(pesosText(123450)).toBe('1234.50');
    expect(pesosText(MaxCentavos)).toBe('999999999999.99');
    for (const centavos of [0, 1, 99, 100, 12345, MaxCentavos]) expect(parsePesos(pesosText(centavos))).toBe(centavos);
    expect(() => pesosText(1.5)).toThrow();
    expect(() => pesosText(-100)).toThrow();
  });

  it('shows pesos the way a person reads them, with the peso sign and thousands commas', () => {
    expect(displayPesos(0)).toBe('₱0.00');
    expect(displayPesos(29)).toBe('₱0.29');
    expect(displayPesos(99999)).toBe('₱999.99');
    expect(displayPesos(100000)).toBe('₱1,000.00');
    expect(displayPesos(145050)).toBe('₱1,450.50');
    expect(displayPesos(123456789)).toBe('₱1,234,567.89');
    expect(displayPesos(MaxCentavos)).toBe('₱999,999,999,999.99');
  });
});

describe('a product', () => {
  const rice: ProductDetails = {
    code: 'PRD-0042',
    barcode: '4800016641503',
    name: 'Sack of rice 25kg',
    retailPrice: 145000,
    status: 'Active',
    description: null,
  };
  const refusal = (details: Partial<ProductDetails>) => {
    try {
      checkProduct({ ...rice, ...details });
    } catch (error) {
      return error as { name: string; kind: string; message: string };
    }
    return null;
  };

  it('comes back tidied: spaces trimmed, an empty barcode or description as none', () => {
    expect(checkProduct({ ...rice, code: ' PRD-0042 ', name: '  Sack of rice 25kg ', barcode: '  ', description: ' ' })).toEqual({
      ...rice,
      barcode: null,
    });
    expect(checkProduct(rice)).toEqual(rice);
  });

  it('may be encoded before it has a price; the till is what refuses to sell it', () => {
    expect(checkProduct({ ...rice, retailPrice: 0 }).retailPrice).toBe(0);
  });

  it('needs a code and a name, and refuses with a message a person can act on', () => {
    expect(refusal({ code: '  ' })).toMatchObject({ name: 'Refusal', kind: 'invalid', message: 'A product needs a code.' });
    expect(refusal({ name: '' })).toMatchObject({ kind: 'invalid', message: 'A product needs a name.' });
  });

  it('has no spaces inside its code or barcode', () => {
    expect(refusal({ code: 'PRD 42' })?.message).toMatch(/code can't contain spaces/);
    expect(refusal({ barcode: '4800 0166' })?.message).toMatch(/barcode can't contain spaces/);
  });

  it('keeps every field within its length', () => {
    expect(refusal({ code: 'C'.repeat(41) })?.message).toMatch(/at most 40/);
    expect(refusal({ barcode: '4'.repeat(49) })?.message).toMatch(/at most 48/);
    expect(refusal({ name: 'N'.repeat(201) })?.message).toMatch(/at most 200/);
    expect(refusal({ description: 'D'.repeat(1001) })?.message).toMatch(/at most 1000/);
    expect(refusal({ code: 'C'.repeat(40), barcode: '4'.repeat(48), name: 'N'.repeat(200), description: 'D'.repeat(1000) })).toBeNull();
  });

  it('has a price in whole centavos, never negative, never more than the database holds', () => {
    for (const retailPrice of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY, MaxCentavos + 1]) {
      expect(refusal({ retailPrice })?.message, String(retailPrice)).toMatch(/price has to be zero or more/);
    }
  });

  it('is Active or Inactive, nothing else', () => {
    expect(refusal({ status: 'Inactive' })).toBeNull();
    expect(refusal({ status: 'active' as never })?.message).toBe('A product is Active or Inactive, not "active".');
  });
});

describe('the product form', () => {
  const typed = { code: ' PRD-0042 ', barcode: ' ', name: 'Sack of rice 25kg', retailPrice: '1,450.5', status: 'Active', description: '' };
  const refusalOf = (form: typeof typed) => {
    try {
      readProductForm(form);
    } catch (error) {
      return error as { kind: string; message: string };
    }
    return null;
  };

  it('starts a new product empty, and Active', () => {
    expect(blankProductForm()).toEqual({ code: '', barcode: '', name: '', retailPrice: '', status: 'Active', description: '' });
  });

  it('reads what was typed into a product that meets the rules', () => {
    expect(readProductForm(typed)).toEqual({
      code: 'PRD-0042',
      barcode: null,
      name: 'Sack of rice 25kg',
      retailPrice: 145050,
      status: 'Active',
      description: null,
    });
  });

  it('shows a product for editing exactly as it reads back', () => {
    const rice: ProductDetails = { code: 'PRD-0042', barcode: '4800016641503', name: 'Rice', retailPrice: 29, status: 'Inactive', description: 'Brown' };
    expect(productFormFor(rice)).toEqual({ code: 'PRD-0042', barcode: '4800016641503', name: 'Rice', retailPrice: '0.29', status: 'Inactive', description: 'Brown' });
    expect(readProductForm(productFormFor(rice))).toEqual(rice);
  });

  it('refuses a price it cannot read, and an empty one, saying how to type it', () => {
    expect(refusalOf({ ...typed, retailPrice: '12.555' })).toMatchObject({
      kind: 'invalid',
      message: '"12.555" isn\'t a price. Type it in pesos, like 1450.50, with at most two decimals.',
    });
    expect(refusalOf({ ...typed, retailPrice: '  ' })?.message).toBe('Type the price, in pesos, like 1450.50.');
    expect(readProductForm({ ...typed, retailPrice: '0' }).retailPrice).toBe(0);
  });

  it('refuses a status that is not one of the two, and keeps every product rule', () => {
    expect(refusalOf({ ...typed, status: 'Gone' })?.message).toBe('A product is Active or Inactive, not "Gone".');
    expect(refusalOf({ ...typed, name: ' ' })?.message).toBe('A product needs a name.');
  });
});
