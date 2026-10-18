import { blankProductForm, productFormFor, readProductForm, Refusal, type ProductForm } from '@kvnsys/core';
import type { SessionPass } from '@kvnsys/wire';
import {
  addProduct,
  changeProduct,
  getProduct,
  type ProductCallOptions,
  type ProductResult,
  type ProductsProblem,
} from './products.js';

export type ProductFormResult = { ok: true; form: ProductForm } | { ok: false; reason: ProductsProblem; message: string };

/**
 * The form to fill in: blank for a new product (id null), or the product as the server has it now,
 * never the row a list showed a while ago, so nobody edits over someone else's change unseen.
 */
export async function loadProductForm(
  address: string,
  pass: SessionPass,
  id: string | null,
  options: ProductCallOptions,
): Promise<ProductFormResult> {
  if (id === null) return { ok: true, form: blankProductForm() };
  const result = await getProduct(address, pass, id, options);
  return result.ok ? { ok: true, form: productFormFor(result.product) } : result;
}

/**
 * Saves what was typed, as a new product (id null) or over the one with that id. It's read and
 * checked here first, so a mistake is caught without asking the server; then the server checks it
 * again, and only the server knows whether a code is already taken.
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
  } catch (error) {
    if (error instanceof Refusal) return { ok: false, reason: 'refused', message: error.message };
    throw error;
  }
  return id === null ? addProduct(address, pass, details, options) : changeProduct(address, pass, id, details, options);
}
