import { parsePesos, pesosText, type Product, type ProductDetails, type ProductStatus } from '@kvnsys/core';
import {
  FindProductPath,
  ProblemReply,
  ProductListReply,
  ProductReply,
  ProductsPath,
  productPath,
  type ProductFields,
  type ProductOnWire,
  type SessionPass,
} from '@kvnsys/wire';
import { describeTransportFailure, type TransportProblem } from '../connection/failures.js';
import { requestJson, type ServerPin } from '../connection/secure-request.js';

/**
 * Why a product call didn't work:
 * - refused: the server said no to the details (a rule, or a code another product has), with why
 * - ended: the sign-in has ended; sign in again
 * - not-allowed: signed in, but the role may not
 * - not-found: no such product
 * - server-error: the server broke while handling it; its log says why
 */
export type ProductsProblem =
  | 'refused'
  | 'ended'
  | 'not-allowed'
  | 'not-found'
  | 'server-error'
  | 'not-connected'
  | TransportProblem;

export type ProductResult = { ok: true; product: Product } | { ok: false; reason: ProductsProblem; message: string };
export type ProductListResult = { ok: true; products: Product[] } | { ok: false; reason: ProductsProblem; message: string };

export interface ProductCallOptions {
  pin: ServerPin | null;
  timeoutMs?: number;
}

const DefaultTimeoutMs = 5000;

/** Every product, by name. */
export async function listProducts(address: string, pass: SessionPass, options: ProductCallOptions): Promise<ProductListResult> {
  const answer = await call(address, pass, options, { path: ProductsPath }, ProductListReply);
  return answer.ok ? { ok: true, products: answer.reply.products.map(fromWire) } : answer;
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
function fromWire(product: ProductOnWire): Product {
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
  return answer.ok ? { ok: true, product: fromWire(answer.reply.product) } : answer;
}

type Answer<T> = { ok: true; reply: T } | { ok: false; reason: ProductsProblem; message: string };

/** One of KVNsysWire's reply shapes. */
interface Shape<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

/** One call: the pass goes only to a pinned server, and every refusal comes back in words. */
async function call<T>(
  address: string,
  pass: SessionPass,
  options: ProductCallOptions,
  request: { path: string; method?: 'GET' | 'POST' | 'PUT'; body?: unknown },
  shape: Shape<T>,
): Promise<Answer<T>> {
  if (!options.pin) {
    return {
      ok: false,
      reason: 'not-connected',
      message: "This register hasn't connected to that server securely, so it won't show it a pass. Connect first.",
    };
  }
  const timeoutMs = options.timeoutMs ?? DefaultTimeoutMs;
  let response;
  try {
    response = await requestJson({ address, ...request, pass: pass.token, pin: options.pin, timeoutMs });
  } catch (error) {
    return { ok: false, ...describeTransportFailure(error, address, timeoutMs) };
  }

  if (response.status === 200 || response.status === 201) {
    const reply = shape.safeParse(response.body);
    if (reply.success) return { ok: true, reply: reply.data };
  } else if (response.status >= 500 && response.status !== 503) {
    return {
      ok: false,
      reason: 'server-error',
      message: `The server at ${address} ran into a problem with that. Try again; if it keeps happening, its log says why.`,
    };
  } else {
    const problem = ProblemReply.safeParse(response.body);
    const reason = ({ 400: 'refused', 401: 'ended', 403: 'not-allowed', 404: 'not-found', 409: 'refused', 503: 'refused' } as const)[
      response.status as 400 | 401 | 403 | 404 | 409 | 503
    ];
    if (problem.success && reason) return { ok: false, reason, message: problem.data.message };
  }
  return { ok: false, reason: 'not-kvnsys', message: `The server at ${address} gave an answer this app doesn't understand.` };
}
