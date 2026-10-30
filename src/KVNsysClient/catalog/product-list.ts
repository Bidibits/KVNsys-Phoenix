import { categoryPaths, type Listed, type Product } from '@kvnsys/core';
import type { SessionPass } from '@kvnsys/wire';
import type { CallOptions, Refused } from '../connection/server-call.js';
import { listCatalog } from './catalog-lists.js';
import { listProducts } from './products.js';

/** A product as the Products list shows it: with the names of the lists it's sorted under, and its history. */
export interface ProductRow extends Listed<Product> {
  /** The category with every one above it, "Appliances › Fans"; null when it has none. */
  categoryPath: string | null;
  brandName: string | null;
  supplierName: string | null;
  manufacturerName: string | null;
}

export type ProductRowsResult = { ok: true; products: ProductRow[] } | Refused;

/**
 * Every product, by name, each with its category, brand, supplier and manufacturer named, for the
 * Products list to show and search. The products and the four lists are asked for at the same
 * time; all five need the same right (see products.view), so a person who may see one may see them
 * all. A switched-off entry is still named: the product is still sorted under it.
 */
export async function listProductRows(address: string, pass: SessionPass, options: CallOptions): Promise<ProductRowsResult> {
  const [products, categories, brands, suppliers, manufacturers] = await Promise.all([
    listProducts(address, pass, options),
    listCatalog(address, pass, 'categories', options),
    listCatalog(address, pass, 'brands', options),
    listCatalog(address, pass, 'suppliers', options),
    listCatalog(address, pass, 'manufacturers', options),
  ]);
  if (!products.ok) return products;
  if (!categories.ok) return categories;
  if (!brands.ok) return brands;
  if (!suppliers.ok) return suppliers;
  if (!manufacturers.ok) return manufacturers;
  const paths = categoryPaths(categories.entries);
  const nameIn = (list: { id: string; name: string }[]) => {
    const names = new Map(list.map((entry) => [entry.id, entry.name]));
    return (id: string | null) => (id === null ? null : (names.get(id) ?? null));
  };
  const [brandName, supplierName, manufacturerName] = [nameIn(brands.entries), nameIn(suppliers.entries), nameIn(manufacturers.entries)];
  return {
    ok: true,
    products: products.products.map((product) => ({
      ...product,
      categoryPath: product.categoryId === null ? null : (paths.get(product.categoryId) ?? null),
      brandName: brandName(product.brandId),
      supplierName: supplierName(product.supplierId),
      manufacturerName: manufacturerName(product.manufacturerId),
    })),
  };
}
