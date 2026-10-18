import { ProductStatuses } from '@kvnsys/core';
import { z } from 'zod';

/**
 * The product calls. Every one needs a signed-in pass ("Authorization: Bearer"), and a role with
 * the right: products.view to look, products.manage to add or change.
 *
 *   GET  /api/products                     every product, by name
 *   GET  /api/products/find?code=PRD-0042   one product by code (or ?barcode=...), capitals ignored
 *   GET  /api/products/<id>                 one product
 *   POST /api/products                      add one       (201)
 *   PUT  /api/products/<id>                 change one
 *
 * A refusal comes back as a ProblemReply with a status that says what kind: 400 the details break
 * a rule, 401 sign in again, 403 the role may not, 404 no such product, 409 a code or barcode
 * another product already has, 503 the server has no database.
 */
export const ProductsPath = '/api/products';
export const FindProductPath = '/api/products/find';
export const productPath = (id: string) => `${ProductsPath}/${encodeURIComponent(id)}`;

/**
 * A price in pesos, as text: "1450.50". Never a JSON number, so nothing on either side is ever
 * tempted to hold money as a float, and "1450" can't be mistaken for centavos.
 */
const Pesos = z.string().max(30);

/** What a client sends to add or change a product. The server checks KVNsysCore's rules. */
export const ProductFields = z.object({
  code: z.string().max(200),
  barcode: z.string().max(200).nullable(),
  name: z.string().max(1000),
  retailPrice: Pesos,
  status: z.enum(ProductStatuses),
  description: z.string().max(5000).nullable(),
});
export type ProductFields = z.infer<typeof ProductFields>;

/** A product as the server sends it. Prices are plain pesos with two decimals. */
export const ProductOnWire = ProductFields.extend({
  id: z.string(),
  retailPrice: z.string().regex(/^\d+\.\d{2}$/),
});
export type ProductOnWire = z.infer<typeof ProductOnWire>;

export const ProductReply = z.object({ product: ProductOnWire });
export type ProductReply = z.infer<typeof ProductReply>;

export const ProductListReply = z.object({ products: z.array(ProductOnWire) });
export type ProductListReply = z.infer<typeof ProductListReply>;

/** Why a request was refused, in words it's safe to show at a register. */
export const ProblemReply = z.object({ message: z.string() });
export type ProblemReply = z.infer<typeof ProblemReply>;
