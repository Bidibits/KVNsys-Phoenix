import { categoryPaths, type Product } from '@kvnsys/core';
import type { SessionPass } from '@kvnsys/wire';
import type { CallOptions, Refused } from '../connection/server-call.js';
import { listCatalog } from './catalog-lists.js';
import { listProducts } from './products.js';

/** A product as the Products list shows it: with the names of the category and brand it's sorted under. */
export interface ProductRow extends Product {
  /** The category with every one above it, "Appliances › Fans"; null when it has none. */
  categoryPath: string | null;
  brandName: string | null;
}

export type ProductRowsResult = { ok: true; products: ProductRow[] } | Refused;

/**
 * Every product, by name, each with its category and brand named, for the Products list to show
 * and search. The products and the two lists are asked for at the same time; all three need the
 * same right (see products.view), so a person who may see one may see all three. A switched-off
 * category or brand is still named: the product is still sorted under it.
 */
export async function listProductRows(address: string, pass: SessionPass, options: CallOptions): Promise<ProductRowsResult> {
  const [products, categories, brands] = await Promise.all([
    listProducts(address, pass, options),
    listCatalog(address, pass, 'categories', options),
    listCatalog(address, pass, 'brands', options),
  ]);
  if (!products.ok) return products;
  if (!categories.ok) return categories;
  if (!brands.ok) return brands;
  const paths = categoryPaths(categories.entries);
  const brandNames = new Map(brands.entries.map((brand) => [brand.id, brand.name]));
  return {
    ok: true,
    products: products.products.map((product) => ({
      ...product,
      categoryPath: product.categoryId === null ? null : (paths.get(product.categoryId) ?? null),
      brandName: product.brandId === null ? null : (brandNames.get(product.brandId) ?? null),
    })),
  };
}
