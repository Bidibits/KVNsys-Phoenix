import { parsePesos, pesosText, ProductDefaults, type Product, type ProductDetails, type ProductStatus } from '@kvnsys/core';
import {
  FindProductPath,
  ProductListReply,
  ProductPictureReply,
  ProductReply,
  ProductsPath,
  productPath,
  productPicturePath,
  type ProductFields,
  type ProductOnWire,
  type SessionPass,
} from '@kvnsys/wire';
import { callServer as call, type Answer, type CallOptions, type CallProblem, type Refused } from '../connection/server-call.js';

/** Why a product call didn't work (see CallProblem). */
export type ProductsProblem = CallProblem;

export type ProductResult = { ok: true; product: Product } | { ok: false; reason: ProductsProblem; message: string };
export type ProductListResult = { ok: true; products: Product[] } | { ok: false; reason: ProductsProblem; message: string };
/** A product's picture as base64 JPEG text, or null when it has none. */
export type ProductPictureResult = { ok: true; picture: string | null } | Refused;

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

/** A product's picture, apart from its details, so a list never carries every product's picture. */
export async function getProductPicture(address: string, pass: SessionPass, id: string, options: ProductCallOptions): Promise<ProductPictureResult> {
  const answer = await call(address, pass, options, { path: productPicturePath(id) }, ProductPictureReply);
  return answer.ok ? { ok: true, picture: answer.reply.picture } : answer;
}

/**
 * Adds a product. The server checks it against the rules, and hands back what it saved. A picture
 * (base64 JPEG) goes in the same save; without one, the product has none.
 */
export async function addProduct(
  address: string,
  pass: SessionPass,
  details: ProductDetails,
  options: ProductCallOptions,
  picture: string | null = null,
): Promise<ProductResult> {
  const sent = toWire(details, picture);
  if (!sent.ok) return sent;
  return oneProduct(await call(address, pass, options, { path: ProductsPath, method: 'POST', body: sent.fields }, ProductReply));
}

/**
 * Changes a product's details, all of them at once, as the form shows them. A picture (base64
 * JPEG) replaces the one it has, null takes it away, and leaving it out keeps it.
 */
export async function changeProduct(
  address: string,
  pass: SessionPass,
  id: string,
  details: ProductDetails,
  options: ProductCallOptions,
  picture?: string | null,
): Promise<ProductResult> {
  const sent = toWire(details, picture);
  if (!sent.ok) return sent;
  return oneProduct(await call(address, pass, options, { path: productPath(id), method: 'PUT', body: sent.fields }, ProductReply));
}

/** Prices travel as exact pesos text; here they become whole centavos again. */
export function productFromWire(product: ProductOnWire): Product {
  const centavos = (pesos: string | null) => (pesos === null ? null : parsePesos(pesos)!);
  return {
    ...product,
    retailPrice: parsePesos(product.retailPrice)!,
    costPrice: parsePesos(product.costPrice)!,
    promoPrice: centavos(product.promoPrice),
    wholesalePrice: centavos(product.wholesalePrice),
    status: product.status as ProductStatus,
  };
}

/** The details as the server takes them: every field, the ones left out as ProductDefaults says. */
function toWire(details: ProductDetails, picture: string | null | undefined): { ok: true; fields: ProductFields } | Refused {
  const full = { ...ProductDefaults, ...details };
  const pesos = (centavos: number | null) => (centavos === null ? null : pesosText(centavos));
  try {
    return {
      ok: true,
      fields: {
        ...full,
        retailPrice: pesosText(full.retailPrice),
        costPrice: pesosText(full.costPrice ?? 0),
        promoPrice: pesos(full.promoPrice ?? null),
        wholesalePrice: pesos(full.wholesalePrice ?? null),
        ...(picture === undefined ? {} : { picture }),
      },
    };
  } catch {
    return { ok: false, reason: 'refused', message: 'The prices have to be zero or more, to the centavo.' };
  }
}

function oneProduct(answer: Answer<ProductReply>): ProductResult {
  return answer.ok ? { ok: true, product: productFromWire(answer.reply.product) } : answer;
}
