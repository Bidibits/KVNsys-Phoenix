import {
  FindProductPath,
  ProblemReply,
  ProductFields,
  ProductListReply,
  ProductOnWire,
  ProductPictureReply,
  ProductReply,
  ProductsPath,
  productPath,
  productPicturePath,
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
  categoryId: null,
  brandId: null,
  supplierId: null,
  manufacturerId: null,
  unitOfMeasure: 'sack',
  tracksStock: true,
  costPrice: '1200.00',
  promoPrice: null,
  wholesalePrice: '1400.00',
  wholesaleQuantity: 10,
  hasWarranty: false,
  warrantyMonths: 0,
};
const saved = { ...rice, id: '0199c7a0-0000-7000-8000-000000000001', hasPicture: false };

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
    for (const price of ['costPrice', 'promoPrice', 'wholesalePrice']) {
      expect(ProductOnWire.safeParse({ ...saved, [price]: '1450' }).success, price).toBe(false);
    }
  });

  it("carry the rest of a product's fields (protocol 14): counts as whole numbers, stock and warranty as yes or no", () => {
    expect(ProtocolVersion).toBeGreaterThanOrEqual(14);
    expect(ProductFields.safeParse({ ...rice, wholesaleQuantity: 2.5 }).success).toBe(false);
    expect(ProductFields.safeParse({ ...rice, warrantyMonths: '12' }).success).toBe(false);
    expect(ProductFields.safeParse({ ...rice, tracksStock: 'yes' }).success).toBe(false);
    expect(ProductFields.safeParse({ ...rice, costPrice: null }).success).toBe(false);
    const { unitOfMeasure: _unit, ...withoutUnit } = rice;
    expect(ProductFields.safeParse(withoutUnit).success).toBe(false);
  });

  it("send a picture with the details if there is one, and never hand one back with a product", () => {
    expect(ProductFields.safeParse({ ...rice, picture: '/9j/4AAQSkZJRg==' }).success).toBe(true);
    expect(ProductFields.safeParse({ ...rice, picture: null }).success).toBe(true);
    expect(ProductFields.safeParse({ ...rice, picture: 'x'.repeat(400_001) }).success).toBe(false);
    expect(ProductOnWire.parse({ ...saved, picture: '/9j/4AAQSkZJRg==' })).not.toHaveProperty('picture');
    expect(productPicturePath('a/b')).toBe('/api/products/a%2Fb/picture');
    expect(ProductPictureReply.safeParse({ picture: null }).success).toBe(true);
    expect(ProductPictureReply.safeParse({}).success).toBe(false);
  });

  it('say whether a product has a picture (protocol 15), always as yes or no', () => {
    expect(ProtocolVersion).toBeGreaterThanOrEqual(15);
    expect(ProductOnWire.safeParse({ ...saved, hasPicture: true }).success).toBe(true);
    expect(ProductOnWire.safeParse({ ...saved, hasPicture: undefined }).success).toBe(false);
    expect(ProductOnWire.safeParse({ ...saved, hasPicture: 'yes' }).success).toBe(false);
  });

  it('answer with a product, a list, or a reason', () => {
    expect(ProductReply.safeParse({ product: saved }).success).toBe(true);
    // A list's rows each come with who made them and who last changed them.
    const history = {
      createdAt: '2026-10-30T02:00:00.000Z',
      createdBy: 'System Administrator (admin)',
      createdMachine: 'Server',
      createdShop: 'Kenlyn',
      updatedAt: null,
      updatedBy: null,
      updatedMachine: null,
      updatedShop: null,
    };
    expect(ProductListReply.safeParse({ products: [{ ...saved, history }, { ...saved, history }] }).success).toBe(true);
    expect(ProductListReply.safeParse({ products: [saved] }).success).toBe(false);
    expect(ProblemReply.safeParse({ message: 'No product has the code X.' }).success).toBe(true);
    expect(ProductReply.safeParse({ message: 'No product has the code X.' }).success).toBe(false);
  });
});
