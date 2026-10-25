import {
  blankProductForm,
  categoryPaths,
  checkProductPicture,
  productFormFor,
  ProductSortingFields,
  readProductForm,
  Refusal,
  type CatalogEntry,
  type CatalogList,
  type ProductForm,
  type ProductSortingField,
} from '@kvnsys/core';
import type { SessionPass } from '@kvnsys/wire';
import { listCatalog } from './catalog-lists.js';
import {
  addProduct,
  changeProduct,
  getProduct,
  getProductPicture,
  type ProductCallOptions,
  type ProductResult,
  type ProductsProblem,
} from './products.js';

/** One entry a picker offers: its id, and what the picker shows. */
export interface ProductChoice {
  value: string;
  label: string;
}

/** What each of the form's four pickers offers (category, brand, supplier, manufacturer). */
export type ProductChoices = Record<ProductSortingField, ProductChoice[]>;

export type ProductFormResult =
  | { ok: true; form: ProductForm; choices: ProductChoices }
  | { ok: false; reason: ProductsProblem; message: string };

const ListOf: Record<ProductSortingField, CatalogList> = {
  categoryId: 'categories',
  brandId: 'brands',
  supplierId: 'suppliers',
  manufacturerId: 'manufacturers',
};

/**
 * A picker's entries, by what it shows: the Active ones, and the one already chosen even if it was
 * switched off since, said so, so editing a product never quietly drops its brand. A category shows
 * every category above it ("Appliances › Fans").
 */
function choicesFor(field: ProductSortingField, entries: CatalogEntry[], chosen: string): ProductChoice[] {
  const paths = field === 'categoryId' ? categoryPaths(entries) : null;
  return entries
    .filter((entry) => entry.status === 'Active' || entry.id === chosen)
    .map((entry) => {
      const name = paths?.get(entry.id) ?? entry.name;
      return { value: entry.id, label: entry.status === 'Active' ? name : `${name} (switched off)` };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The form to fill in: blank for a new product (id null), or the product as the server has it now,
 * with its picture, never the row a list showed a while ago, so nobody edits over someone else's
 * change unseen. It comes with what each picker offers, read from the four lists at the same time.
 */
export async function loadProductForm(
  address: string,
  pass: SessionPass,
  id: string | null,
  options: ProductCallOptions,
): Promise<ProductFormResult> {
  const [lists, product, picture] = await Promise.all([
    Promise.all(ProductSortingFields.map((field) => listCatalog(address, pass, ListOf[field], options))),
    id === null ? null : getProduct(address, pass, id, options),
    id === null ? null : getProductPicture(address, pass, id, options),
  ]);
  if (product && !product.ok) return product;
  if (picture && !picture.ok) return picture;
  const form = product ? productFormFor(product.product, picture?.picture ?? '') : blankProductForm();
  const choices = {} as ProductChoices;
  for (const [index, field] of ProductSortingFields.entries()) {
    const list = lists[index]!;
    if (!list.ok) return list;
    choices[field] = choicesFor(field, list.entries, form[field]);
  }
  return { ok: true, form, choices };
}

/**
 * Saves what was typed, as a new product (id null) or over the one with that id, picture and all.
 * It's read and checked here first, so a mistake is caught without asking the server; then the
 * server checks it again, and only the server knows whether a code is already taken.
 */
export async function saveProductForm(
  address: string,
  pass: SessionPass,
  id: string | null,
  form: ProductForm,
  options: ProductCallOptions,
): Promise<ProductResult> {
  let details;
  try {
    details = readProductForm(form);
    if (form.picture) checkProductPicture(Buffer.from(form.picture, 'base64'));
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: 'refused', message: error.message };
    throw error;
  }
  const picture = form.picture || null;
  return id === null ? addProduct(address, pass, details, options, picture) : changeProduct(address, pass, id, details, options, picture);
}
