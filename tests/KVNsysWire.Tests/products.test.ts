import {
  FindProductPath,
  ProblemReply,
  ProductFields,
  ProductListReply,
  ProductOnWire,
  ProductReply,
  ProductsPath,
  productPath,
  ProtocolVersion,
} from '@kvnsys/wire';
import { describe, expect, it } from 'vitest';

const rice = {
  code: 'PRD-0042',
  barcode: '4800016641503',
  name: 'Sack of rice 25kg',
  retailPrice: '1450.50',
  status: 'Active',
  description: null,
};
const saved = { ...rice, id: '0199c7a0-0000-7000-8000-000000000001' };

describe('the product calls', () => {
  // The rule, not today's number: products arrived with protocol 4, and it only goes up.
  it('live under /api/products, and came with protocol 4', () => {
    expect(ProductsPath).toBe('/api/products');
    expect(FindProductPath).toBe('/api/products/find');
    expect(productPath('abc')).toBe('/api/products/abc');
    expect(productPath('a/b?c')).toBe('/api/products/a%2Fb%3Fc');
    expect(ProtocolVersion).toBeGreaterThanOrEqual(4);
  });

  it('send a price as text, never as a JSON number, which could arrive as a float', () => {
    expect(ProductFields.safeParse(rice).success).toBe(true);
    expect(ProductFields.safeParse({ ...rice, retailPrice: 1450.5 }).success).toBe(false);
    expect(ProductFields.safeParse({ ...rice, retailPrice: 145050 }).success).toBe(false);
  });

  it('carry every field, with none for a missing barcode or description, and only the two statuses', () => {
    expect(ProductFields.safeParse({ ...rice, barcode: null }).success).toBe(true);
    expect(ProductFields.safeParse({ ...rice, barcode: undefined }).success).toBe(false);
    expect(ProductFields.safeParse({ ...rice, status: 'Discontinued' }).success).toBe(false);
  });

  it('hand prices back as plain pesos with exactly two decimals', () => {
    expect(ProductOnWire.safeParse(saved).success).toBe(true);
    for (const retailPrice of ['1450.5', '1,450.50', '1450', '-1.00']) {
      expect(ProductOnWire.safeParse({ ...saved, retailPrice }).success, retailPrice).toBe(false);
    }
  });

  it('answer with a product, a list, or a reason', () => {
    expect(ProductReply.safeParse({ product: saved }).success).toBe(true);
    expect(ProductListReply.safeParse({ products: [saved, saved] }).success).toBe(true);
    expect(ProblemReply.safeParse({ message: 'No product has the code X.' }).success).toBe(true);
    expect(ProductReply.safeParse({ message: 'No product has the code X.' }).success).toBe(false);
  });
});
