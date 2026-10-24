import type { Product } from '@kvnsys/core';
import {
  ProductStockReply,
  productStockPath,
  StockListReply,
  StockMovementsPath,
  StockMovementsReply,
  StockPath,
  type MovementOnWire,
  type SessionPass,
  type ShopOnWire,
} from '@kvnsys/wire';
import { productFromWire } from '../catalog/products.js';
import { callServer as call, type CallOptions, type Refused } from '../connection/server-call.js';

/** The shop the stock belongs to: always the server's own. */
export type Shop = ShopOnWire;
/** A line of the stock ledger, with the name of whoever saved it. */
export type RecordedMovement = MovementOnWire;
export interface StockItem {
  product: Product;
  stock: number;
}

/**
 * What a person records by hand: goods in from a supplier (more than zero), or a count put right
 * (either way, with the reason). Goods out to a customer only a sale records.
 */
export interface HandMovement {
  productId: string;
  type: 'from_supplier' | 'adjustment';
  quantityChange: number;
  note: string | null;
}

export type StockListResult = { ok: true; shop: Shop; items: StockItem[] } | Refused;
export type ProductStockResult =
  | { ok: true; shop: Shop; product: Product; stock: number; movements: RecordedMovement[]; more: boolean }
  | Refused;
export type RecordStockResult = { ok: true; movements: RecordedMovement[] } | Refused;

/** Every product, by name, with how many the shop holds. */
export async function listStock(address: string, pass: SessionPass, options: CallOptions): Promise<StockListResult> {
  const answer = await call(address, pass, options, { path: StockPath }, StockListReply);
  if (!answer.ok) return answer;
  const items = answer.reply.items.map((item) => ({ product: productFromWire(item.product), stock: item.stock }));
  return { ok: true, shop: answer.reply.shop, items };
}

/** One product's stock, and its movements, newest first. `more` says there are older ones. */
export async function getProductStock(address: string, pass: SessionPass, productId: string, options: CallOptions): Promise<ProductStockResult> {
  const answer = await call(address, pass, options, { path: productStockPath(productId) }, ProductStockReply);
  if (!answer.ok) return answer;
  return { ok: true, ...answer.reply, product: productFromWire(answer.reply.product) };
}

/** Records the lines, all or none, and hands them back as saved, each with the stock just after it. */
export async function recordStock(
  address: string,
  pass: SessionPass,
  movements: HandMovement[],
  options: CallOptions,
): Promise<RecordStockResult> {
  const answer = await call(address, pass, options, { path: StockMovementsPath, method: 'POST', body: { movements } }, StockMovementsReply);
  return answer.ok ? { ok: true, movements: answer.reply.movements } : answer;
}
