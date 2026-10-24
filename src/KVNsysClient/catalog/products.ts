import { parsePesos, pesosText, type Product, type ProductDetails, type ProductStatus } from '@kvnsys/core';
import {
  FindProductPath,
  ProductListReply,
  ProductReply,
  ProductsPath,
  productPath,
  type ProductFields,
  type ProductOnWire,
  type SessionPass,
} from '@kvnsys/wire';
import { callServer as call, type Answer, type CallOptions, type CallProblem } from '../connection/server-call.js';

/** Why a product call didn't work (see CallProblem). */
export type ProductsProblem = CallProblem;

export type ProductResult = { ok: true; product: Product } | { ok: false; reason: ProductsProblem; message: string };
export type ProductListResult = { ok: true; products: Product[] } | { ok: false; reason: ProductsProblem; message: string };

export type ProductCallOptions = CallOptions;

/** Every product, by name. */
export async function listProducts(address: string, pass: SessionPass, options: ProductCallOptions): Promise<ProductListResult> {
  const answer = await call(address, pass, options, { path: ProductsPath }, ProductListReply);
  return answer.ok ? { ok: true, products: answer.reply.products.map(productFromWire) } : answer;
}

/** One product by its code or its barcode. Capitals don't matter. */
export async function findProduct(
  address: string,
  pass: SessionPass,
  by: { code: string } | { barcode: string },
  options: ProductCallOptions,
): Promise<ProductResult> {
  const query = 'code' in by ? `code=${encodeURIComponent(by.code)}` : `barcode=${encodeURIComponent(by.barcode)}`;
  return oneProduct(await call(address, pass, options, { path: `${FindProductPath}?${query}` }, ProductReply));
}

export async function getProduct(address: string, pass: SessionPass, id: string, options: ProductCallOptions): Promise<ProductResult> {
  return oneProduct(await call(address, pass, options, { path: productPath(id) }, ProductReply));
}

/** Adds a product. The server checks it against the rules, and hands back what it saved. */
export async function addProduct(
  address: string,
  pass: SessionPass,
  details: ProductDetails,
  options: ProductCallOptions,
): Promise<ProductResult> {
  const sent = toWire(details);
  if (!sent.ok) return sent;
  return oneProduct(await call(address, pass, options, { path: ProductsPath, method: 'POST', body: sent.fields }, ProductReply));
}

/** Changes a product's details, all of them at once, as the form shows them. */
export async function changeProduct(
  address: string,
  pass: SessionPass,
  id: string,
  details: ProductDetails,
  options: ProductCallOptions,
): Promise<ProductResult> {
  const sent = toWire(details);
  if (!sent.ok) return sent;
  return oneProduct(await call(address, pass, options, { path: productPath(id), method: 'PUT', body: sent.fields }, ProductReply));
}

/** Prices travel as exact pesos text; here they become whole centavos again. */
export function productFromWire(product: ProductOnWire): Product {
  return { ...product, retailPrice: parsePesos(product.retailPrice)!, status: product.status as ProductStatus };
}

function toWire(details: ProductDetails): { ok: true; fields: ProductFields } | { ok: false; reason: 'refused'; message: string } {
  try {
    return { ok: true, fields: { ...details, retailPrice: pesosText(details.retailPrice) } };
  } catch {
    return { ok: false, reason: 'refused', message: 'The price has to be zero or more, to the centavo.' };
  }
}

function oneProduct(answer: Answer<ProductReply>): ProductResult {
  return answer.ok ? { ok: true, product: productFromWire(answer.reply.product) } : answer;
}
