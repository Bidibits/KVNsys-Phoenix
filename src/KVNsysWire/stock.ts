import { MovementTypes } from '@kvnsys/core';
import { z } from 'zod';
import { ProductOnWire } from './products.js';

/**
 * The stock calls. Every one needs a signed-in pass, and a role with the right: stock.view to look,
 * stock.receive to record goods in from a supplier, stock.adjust to put a count right. Stock is
 * always the server's own shop's: each branch has its own server, which knows which shop it is.
 *
 *   GET  /api/stock                   every product, by name, with its stock here
 *   GET  /api/stock/find?codeOrBarcode=PRD-0042
 *                                     one product, by what was typed or scanned, with its stock here
 *   GET  /api/stock/<productId>       one product's stock, and its newest movements
 *   POST /api/stock/movements         record goods in, or put counts right: all saved, or none (201)
 *
 * Goods out to a customer can't be recorded here: only a sale records them. A refusal is a
 * ProblemReply (see products.ts): 400 a rule, 401 sign in again, 403 the role may not (for any
 * one line), 404 no such product, 503 no database, or this PC was never set up as the server.
 */
export const StockPath = '/api/stock';
export const StockMovementsPath = '/api/stock/movements';
export const FindStockItemPath = '/api/stock/find';
export const productStockPath = (productId: string) => `${StockPath}/${encodeURIComponent(productId)}`;

/** How many of a product's movements come back at most, newest first. */
export const MovementsShown = 200;

/** The shop the stock belongs to. */
export const ShopOnWire = z.object({ id: z.string(), code: z.string(), name: z.string() });
export type ShopOnWire = z.infer<typeof ShopOnWire>;

/** One line of the ledger, as the server sends it. Quantities are whole pieces. */
export const MovementOnWire = z.object({
  id: z.string(),
  productId: z.string(),
  type: z.enum(MovementTypes),
  /** Positive in, negative out. */
  quantityChange: z.number().int(),
  note: z.string().nullable(),
  /** The document that caused it, such as a sale, or null. */
  source: z.object({ table: z.string(), id: z.string() }).nullable(),
  /** The shop's stock of the product just after this line. */
  resultingOnHand: z.number().int(),
  /** When it was saved, by the server's clock: an ISO date and time. */
  createdAt: z.string(),
  /** Who saved it. The name is null when their account isn't on this server, such as someone at HQ. */
  createdBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
});
export type MovementOnWire = z.infer<typeof MovementOnWire>;

/** Every product in the catalog, Inactive ones too, with how many the shop holds. Never moved: 0. */
export const StockListReply = z.object({
  shop: ShopOnWire,
  items: z.array(z.object({ product: ProductOnWire, stock: z.number().int() })),
});
export type StockListReply = z.infer<typeof StockListReply>;

/**
 * One product and its stock here. Finding needs only the right to see stock, so whoever receives
 * goods doesn't also need the right to see the catalog.
 */
export const StockItemReply = z.object({ shop: ShopOnWire, product: ProductOnWire, stock: z.number().int() });
export type StockItemReply = z.infer<typeof StockItemReply>;

export const ProductStockReply = z.object({
  shop: ShopOnWire,
  product: ProductOnWire,
  stock: z.number().int(),
  /** Newest first, at most MovementsShown of them. */
  movements: z.array(MovementOnWire),
  /** True when there are older movements than these. */
  more: z.boolean(),
});
export type ProductStockReply = z.infer<typeof ProductStockReply>;

/** One change a person records. KVNsysCore's rules (checkStockChange) are checked at the server. */
export const MovementFields = z.object({
  productId: z.string().max(100),
  type: z.enum(MovementTypes),
  quantityChange: z.number(),
  note: z.string().max(2000).nullable(),
});
export type MovementFields = z.infer<typeof MovementFields>;

/** A delivery's worth of lines at most. */
export const StockMovementsRequest = z.object({ movements: z.array(MovementFields).min(1).max(500) });
export type StockMovementsRequest = z.infer<typeof StockMovementsRequest>;

/** The lines as saved, in the order sent. */
export const StockMovementsReply = z.object({ movements: z.array(MovementOnWire) });
export type StockMovementsReply = z.infer<typeof StockMovementsReply>;
