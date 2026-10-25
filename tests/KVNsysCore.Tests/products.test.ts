import {
  blankProductForm,
  checkProduct,
  checkProductPicture,
  displayPesos,
  isCentavos,
  MaxCentavos,
  parsePesos,
  pesosText,
  ProductDefaults,
  productFormFor,
  readProductForm,
  type FullProductDetails,
  type ProductDetails,
  type ProductForm,
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
      ...ProductDefaults,
      barcode: null,
    });
    expect(checkProduct(rice)).toEqual({ ...rice, ...ProductDefaults });
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

  const fan: FullProductDetails = {
    ...rice,
    code: 'HNB-SF16',
    name: 'Hanabishi stand fan 16"',
    retailPrice: 189900,
    categoryId: '0199c7a0-0000-7000-8000-000000000011',
    brandId: '0199c7a0-0000-7000-8000-000000000012',
    supplierId: '0199c7a0-0000-7000-8000-000000000013',
    manufacturerId: '0199c7a0-0000-7000-8000-000000000014',
    unitOfMeasure: 'pc',
    tracksStock: true,
    costPrice: 145000,
    promoPrice: 169900,
    wholesalePrice: 159900,
    wholesaleQuantity: 10,
    hasWarranty: true,
    warrantyMonths: 12,
  };
  const fanRefusal = (details: Partial<FullProductDetails>) => {
    try {
      checkProduct({ ...fan, ...details });
    } catch (error) {
      return (error as Error).message;
    }
    return null;
  };

  it("takes the rest of the plan's fields, and each one left out is as ProductDefaults says", () => {
    expect(checkProduct({ ...fan, unitOfMeasure: ' pc ', categoryId: ' ' })).toEqual({ ...fan, categoryId: null });
    expect(ProductDefaults).toEqual({
      categoryId: null,
      brandId: null,
      supplierId: null,
      manufacturerId: null,
      unitOfMeasure: null,
      tracksStock: true,
      costPrice: 0,
      promoPrice: null,
      wholesalePrice: null,
      wholesaleQuantity: null,
      hasWarranty: false,
      warrantyMonths: 0,
    });
    expect(checkProduct({ ...rice, costPrice: undefined, tracksStock: undefined }).tracksStock).toBe(true);
  });

  it('is sorted under ids, and anything else is a choice that has gone', () => {
    expect(fanRefusal({ brandId: 'Hanabishi' })).toBe("That brand isn't there any more. Choose another.");
    expect(fanRefusal({ categoryId: '42' })).toBe("That category isn't there any more. Choose another.");
  });

  it('has a promo price and a wholesale price above zero and below the shelf price', () => {
    expect(fanRefusal({ promoPrice: 189900 })).toBe('A promo price has to be below the shelf price (₱1,899.00).');
    expect(fanRefusal({ promoPrice: 199900 })).toBe('A promo price has to be below the shelf price (₱1,899.00).');
    expect(fanRefusal({ promoPrice: 0 })).toBe("A promo price of ₱0.00 would give it away. Leave it empty if there isn't one.");
    expect(fanRefusal({ promoPrice: -1 })).toBe('The promo price has to be more than zero, to the centavo.');
    expect(fanRefusal({ wholesalePrice: 189900 })).toBe('A wholesale price has to be below the shelf price (₱1,899.00).');
    expect(fanRefusal({ promoPrice: 189899, wholesalePrice: 1 })).toBeNull();
  });

  it('has a wholesale price and the pieces it starts at together, from 2 pieces up', () => {
    expect(fanRefusal({ wholesaleQuantity: null })).toBe('A wholesale price needs the number of pieces it starts at.');
    expect(fanRefusal({ wholesalePrice: null })).toBe('Wholesale from 10 pieces needs a wholesale price.');
    expect(fanRefusal({ wholesalePrice: null, wholesaleQuantity: null })).toBeNull();
    for (const wholesaleQuantity of [1, 2.5, 1_000_001]) {
      expect(fanRefusal({ wholesaleQuantity }), String(wholesaleQuantity)).toBe('Wholesale starts at a whole number of pieces, from 2 to 1,000,000.');
    }
  });

  it('has a warranty of 1 to 120 whole months, or none and 0 months', () => {
    for (const warrantyMonths of [0, 1.5, 121]) {
      expect(fanRefusal({ warrantyMonths }), String(warrantyMonths)).toBe('A warranty lasts a whole number of months, from 1 to 120.');
    }
    expect(fanRefusal({ warrantyMonths: 120 })).toBeNull();
    expect(fanRefusal({ hasWarranty: false })).toBe('Warranty months only go with a warranty.');
    expect(fanRefusal({ hasWarranty: false, warrantyMonths: 0 })).toBeNull();
  });

  it('never costs less than nothing, and keeps its unit short', () => {
    expect(fanRefusal({ costPrice: -1 })).toBe('The cost has to be zero or more, to the centavo.');
    expect(fanRefusal({ costPrice: 0 })).toBeNull();
    expect(fanRefusal({ unitOfMeasure: 'U'.repeat(21) })).toBe('A unit can be at most 20 characters, like pc, box or pack.');
  });
});

describe("a product's picture", () => {
  const jpeg = (length: number) => Uint8Array.from({ length }, (_, i) => [0xff, 0xd8, 0xff][i] ?? 0x20);
  const refusalOf = (bytes: Uint8Array) => {
    try {
      checkProductPicture(bytes);
    } catch (error) {
      return (error as Error).message;
    }
    return null;
  };

  it('is a JPEG of at most 256 KB, and nothing else', () => {
    expect(refusalOf(jpeg(256 * 1024))).toBeNull();
    expect(refusalOf(jpeg(256 * 1024 + 1))).toBe("A product's picture can be at most 256 KB; this one is 257 KB.");
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(refusalOf(png)).toBe("A product's picture has to be a JPEG.");
    expect(refusalOf(new Uint8Array())).toBe("A product's picture has to be a JPEG.");
  });
});

describe('the product form', () => {
  const typed: ProductForm = { ...blankProductForm(), code: ' PRD-0042 ', barcode: ' ', name: 'Sack of rice 25kg', retailPrice: '1,450.5' };
  const refusalOf = (form: ProductForm) => {
    try {
      readProductForm(form);
    } catch (error) {
      return error as { kind: string; message: string };
    }
    return null;
  };

  it('starts a new product empty, Active, counted in stock, and without a warranty', () => {
    expect(blankProductForm()).toEqual({
      code: '',
      barcode: '',
      name: '',
      retailPrice: '',
      status: 'Active',
      description: '',
      categoryId: '',
      brandId: '',
      supplierId: '',
      manufacturerId: '',
      unitOfMeasure: '',
      tracksStock: true,
      costPrice: '',
      promoPrice: '',
      wholesalePrice: '',
      wholesaleQuantity: '',
      hasWarranty: false,
      warrantyMonths: '',
      picture: '',
    });
  });

  it('reads what was typed into a product that meets the rules', () => {
    expect(readProductForm(typed)).toEqual({
      code: 'PRD-0042',
      barcode: null,
      name: 'Sack of rice 25kg',
      retailPrice: 145050,
      status: 'Active',
      description: null,
      ...ProductDefaults,
    });
  });

  it('shows a product for editing exactly as it reads back', () => {
    const rice: FullProductDetails = {
      ...ProductDefaults,
      code: 'PRD-0042',
      barcode: '4800016641503',
      name: 'Rice',
      retailPrice: 29,
      status: 'Inactive',
      description: 'Brown',
    };
    expect(productFormFor(rice)).toEqual({
      ...blankProductForm(),
      code: 'PRD-0042',
      barcode: '4800016641503',
      name: 'Rice',
      retailPrice: '0.29',
      status: 'Inactive',
      description: 'Brown',
    });
    expect(readProductForm(productFormFor(rice))).toEqual(rice);

    const fan: FullProductDetails = {
      ...rice,
      retailPrice: 189900,
      categoryId: '0199c7a0-0000-7000-8000-000000000011',
      brandId: '0199c7a0-0000-7000-8000-000000000012',
      supplierId: null,
      manufacturerId: '0199c7a0-0000-7000-8000-000000000014',
      unitOfMeasure: 'pc',
      tracksStock: false,
      costPrice: 145000,
      promoPrice: 169900,
      wholesalePrice: 159900,
      wholesaleQuantity: 10,
      hasWarranty: true,
      warrantyMonths: 12,
    };
    expect(productFormFor(fan, '/9j/4AAQ')).toMatchObject({
      categoryId: fan.categoryId,
      supplierId: '',
      tracksStock: false,
      costPrice: '1450.00',
      promoPrice: '1699.00',
      wholesalePrice: '1599.00',
      wholesaleQuantity: '10',
      hasWarranty: true,
      warrantyMonths: '12',
      picture: '/9j/4AAQ',
    });
    expect(readProductForm(productFormFor(fan))).toEqual(fan);
  });

  it('reads the other prices, the pieces and the months, an empty box as none, naming the box that is wrong', () => {
    const fan = { ...typed, retailPrice: '1899', costPrice: '1,450', promoPrice: '1699.5', wholesalePrice: '1599', wholesaleQuantity: ' 10 ' };
    expect(readProductForm(fan)).toMatchObject({ costPrice: 145000, promoPrice: 169950, wholesalePrice: 159900, wholesaleQuantity: 10 });
    expect(readProductForm({ ...fan, costPrice: '', promoPrice: ' ', wholesalePrice: '', wholesaleQuantity: '' })).toMatchObject({
      costPrice: 0,
      promoPrice: null,
      wholesalePrice: null,
      wholesaleQuantity: null,
    });
    expect(refusalOf({ ...fan, costPrice: 'abc' })?.message).toBe('The cost "abc" isn\'t a price. Type it in pesos, like 1450.50, with at most two decimals.');
    expect(refusalOf({ ...fan, promoPrice: '-5' })?.message).toBe('The promo price "-5" isn\'t a price. Type it in pesos, like 1450.50, with at most two decimals.');
    expect(refusalOf({ ...fan, wholesaleQuantity: '2.5' })?.message).toBe('"2.5" isn\'t a whole number of pieces.');
    expect(refusalOf({ ...fan, wholesalePrice: '1999' })?.message).toBe('A wholesale price has to be below the shelf price (₱1,899.00).');
  });

  it("needs the warranty's months when it's ticked, and ignores them when it isn't", () => {
    expect(readProductForm({ ...typed, hasWarranty: true, warrantyMonths: '12' })).toMatchObject({ hasWarranty: true, warrantyMonths: 12 });
    expect(readProductForm({ ...typed, hasWarranty: false, warrantyMonths: '12' })).toMatchObject({ hasWarranty: false, warrantyMonths: 0 });
    expect(refusalOf({ ...typed, hasWarranty: true, warrantyMonths: ' ' })?.message).toBe('Type how many months the warranty lasts.');
    expect(refusalOf({ ...typed, hasWarranty: true, warrantyMonths: 'one' })?.message).toBe('"one" isn\'t a whole number of months.');
    expect(refusalOf({ ...typed, hasWarranty: true, warrantyMonths: '0' })?.message).toBe('A warranty lasts a whole number of months, from 1 to 120.');
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
