import { readCount, readDelivery, type CountForm, type DeliveryLineForm, type HandMovement, type Product } from '@kvnsys/core';
import {
  FindStockItemPath,
  ProductStockReply,
  productStockPath,
  StockListReply,
  StockMovementsPath,
  StockItemReply,
  StockMovementsReply,
  StockPath,
  type MovementOnWire,
  type SessionPass,
  type ShopOnWire,
} from '@kvnsys/wire';
import { productFromWire } from '../catalog/products.js';
import { callServer as call, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

/** The shop the stock belongs to: always the server's own. */
export type Shop = ShopOnWire;
/** A line of the stock ledger, with the name of whoever saved it. */
export type RecordedMovement = MovementOnWire;
export interface StockItem {
  product: Product;
  stock: number;
}

export type StockListResult = { ok: true; shop: Shop; items: StockItem[] } | Refused;
export type StockItemResult = { ok: true; shop: Shop; item: StockItem } | Refused;
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

/** One product by what was typed or scanned, its code or its barcode, with its stock here. */
export async function findStockItem(address: string, pass: SessionPass, codeOrBarcode: string, options: CallOptions): Promise<StockItemResult> {
  const path = `${FindStockItemPath}?codeOrBarcode=${encodeURIComponent(codeOrBarcode)}`;
  const answer = await call(address, pass, options, { path }, StockItemReply);
  if (!answer.ok) return answer;
  return { ok: true, shop: answer.reply.shop, item: { product: productFromWire(answer.reply.product), stock: answer.reply.stock } };
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

/** Saves a delivery as typed. A mistake in any line is caught here, naming its product, before the server is asked. */
export async function saveDelivery(
  address: string,
  pass: SessionPass,
  lines: DeliveryLineForm[],
  note: string,
  options: CallOptions,
): Promise<RecordStockResult> {
  const read = readOrRefuse(() => readDelivery(lines, note));
  return read.ok ? recordStock(address, pass, read.value, options) : read;
}

/** Puts a count right: the change is what was counted less what KVNsys showed when the count was typed. */
export async function saveCount(address: string, pass: SessionPass, form: CountForm, options: CallOptions): Promise<RecordStockResult> {
  const read = readOrRefuse(() => readCount(form));
  return read.ok ? recordStock(address, pass, [read.value], options) : read;
}
