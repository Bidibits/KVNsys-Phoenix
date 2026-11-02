import { readCount, readDelivery, type CountForm, type DeliveryLineForm, type HandMovement, type Product } from '@kvnsys/core';
import {
  FindInventoryItemPath,
  ProductInventoryReply,
  productInventoryPath,
  InventoryListReply,
  InventoryMovementsPath,
  InventoryItemReply,
  InventoryMovementsReply,
  InventoryPath,
  type MovementOnWire,
  type SessionPass,
  type LocationOnWire,
} from '@kvnsys/wire';
import { productFromWire } from '../catalog/products.js';
import { callServer as call, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

/** The location the stock belongs to: always the server's own. */
export type Location = LocationOnWire;
/** A line of the stock ledger, with the name of whoever saved it. */
export type RecordedMovement = MovementOnWire;
export interface InventoryItem {
  product: Product;
  stock: number;
}

export type InventoryListResult = { ok: true; location: Location; items: InventoryItem[] } | Refused;
export type InventoryItemResult = { ok: true; location: Location; item: InventoryItem } | Refused;
export type ProductInventoryResult =
  | { ok: true; location: Location; product: Product; stock: number; movements: RecordedMovement[]; more: boolean }
  | Refused;
export type RecordMovementsResult = { ok: true; movements: RecordedMovement[] } | Refused;

/** Every product, by name, with how many the location holds. */
export async function listInventory(address: string, pass: SessionPass, options: CallOptions): Promise<InventoryListResult> {
  const answer = await call(address, pass, options, { path: InventoryPath }, InventoryListReply);
  if (!answer.ok) return answer;
  const items = answer.reply.items.map((item) => ({ product: productFromWire(item.product), stock: item.stock }));
  return { ok: true, location: answer.reply.location, items };
}

/** One product by what was typed or scanned, its code or its barcode, with its stock here. */
export async function findInventoryItem(address: string, pass: SessionPass, codeOrBarcode: string, options: CallOptions): Promise<InventoryItemResult> {
  const path = `${FindInventoryItemPath}?codeOrBarcode=${encodeURIComponent(codeOrBarcode)}`;
  const answer = await call(address, pass, options, { path }, InventoryItemReply);
  if (!answer.ok) return answer;
  return { ok: true, location: answer.reply.location, item: { product: productFromWire(answer.reply.product), stock: answer.reply.stock } };
}

/** One product's stock, and its movements, newest first. `more` says there are older ones. */
export async function getProductInventory(address: string, pass: SessionPass, productId: string, options: CallOptions): Promise<ProductInventoryResult> {
  const answer = await call(address, pass, options, { path: productInventoryPath(productId) }, ProductInventoryReply);
  if (!answer.ok) return answer;
  return { ok: true, ...answer.reply, product: productFromWire(answer.reply.product) };
}

/** Records the lines, all or none, and hands them back as saved, each with the stock just after it. */
export async function recordMovements(
  address: string,
  pass: SessionPass,
  movements: HandMovement[],
  options: CallOptions,
): Promise<RecordMovementsResult> {
  const answer = await call(address, pass, options, { path: InventoryMovementsPath, method: 'POST', body: { movements } }, InventoryMovementsReply);
  return answer.ok ? { ok: true, movements: answer.reply.movements } : answer;
}

/** Saves a delivery as typed. A mistake in any line is caught here, naming its product, before the server is asked. */
export async function saveDelivery(
  address: string,
  pass: SessionPass,
  lines: DeliveryLineForm[],
  note: string,
  options: CallOptions,
): Promise<RecordMovementsResult> {
  const read = readOrRefuse(() => readDelivery(lines, note));
  return read.ok ? recordMovements(address, pass, read.value, options) : read;
}

/** Puts a count right: the change is what was counted less what KVNsys showed when the count was typed. */
export async function saveCount(address: string, pass: SessionPass, form: CountForm, options: CallOptions): Promise<RecordMovementsResult> {
  const read = readOrRefuse(() => readCount(form));
  return read.ok ? recordMovements(address, pass, [read.value], options) : read;
}
