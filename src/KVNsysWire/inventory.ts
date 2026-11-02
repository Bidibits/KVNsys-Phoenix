import { MovementTypes } from '@kvnsys/core';
import { z } from 'zod';
import { ProductOnWire } from './products.js';

/**
 * The inventory calls. Every one needs a signed-in pass, and a role with the right: inventory.view
 * to look, inventory.receive to record goods in from a supplier, inventory.adjust to put a count
 * right. The inventory is always the server's own location's: each branch has its own server, which
 * knows which location it is.
 *
 *   GET  /api/inventory                   every product, by name, with its stock here
 *   GET  /api/inventory/find?codeOrBarcode=PRD-0042
 *                                         one product, by what was typed or scanned, with its stock here
 *   GET  /api/inventory/logs              the newest lines of the inventory log, every product's, with names
 *   GET  /api/inventory/<productId>       one product's stock, and its newest movements
 *   POST /api/inventory/movements         record goods in, or put counts right: all saved, or none (201)
 *
 * Goods out to a customer can't be recorded here: only a sale records them. A refusal is a
 * ProblemReply (see products.ts): 400 a rule, 401 sign in again, 403 the role may not (for any
 * one line), 404 no such product, 503 no database, or this PC was never set up as the server.
 */
export const InventoryPath = '/api/inventory';
export const InventoryMovementsPath = '/api/inventory/movements';
export const FindInventoryItemPath = '/api/inventory/find';
export const InventoryLogsPath = '/api/inventory/logs';
export const productInventoryPath = (productId: string) => `${InventoryPath}/${encodeURIComponent(productId)}`;

/** How many of a product's movements come back at most, newest first. */
export const MovementsShown = 200;

/** The location the stock belongs to. */
export const LocationOnWire = z.object({ id: z.string(), code: z.string(), name: z.string() });
export type LocationOnWire = z.infer<typeof LocationOnWire>;

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
  /** The location's stock of the product just after this line. */
  resultingOnHand: z.number().int(),
  /** When it was saved, by the server's clock: an ISO date and time. */
  createdAt: z.string(),
  /** Who saved it. The name is null when their account isn't on this server, such as someone at HQ. */
  createdBy: z.object({ id: z.string(), name: z.string().nullable() }).nullable(),
});
export type MovementOnWire = z.infer<typeof MovementOnWire>;

/** Every product in the catalog, Inactive ones too, with how many the location holds. Never moved: 0. */
export const InventoryListReply = z.object({
  location: LocationOnWire,
  items: z.array(z.object({ product: ProductOnWire, stock: z.number().int() })),
});
export type InventoryListReply = z.infer<typeof InventoryListReply>;

/**
 * One product and its stock here. Finding needs only the right to see stock, so whoever receives
 * goods doesn't also need the right to see the catalog.
 */
export const InventoryItemReply = z.object({ location: LocationOnWire, product: ProductOnWire, stock: z.number().int() });
export type InventoryItemReply = z.infer<typeof InventoryItemReply>;

export const ProductInventoryReply = z.object({
  location: LocationOnWire,
  product: ProductOnWire,
  stock: z.number().int(),
  /** Newest first, at most MovementsShown of them. */
  movements: z.array(MovementOnWire),
  /** True when there are older movements than these. */
  more: z.boolean(),
});
export type ProductInventoryReply = z.infer<typeof ProductInventoryReply>;

/** A line of the inventory log, every column of it, with names in place of ids. */
export const InventoryLogLineOnWire = z.object({
  id: z.string(),
  locationName: z.string(),
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  /** Positive in, negative out. */
  quantityChange: z.number().int(),
  type: z.enum(MovementTypes),
  sourceTable: z.string().nullable(),
  sourceId: z.string().nullable(),
  /** The document by name, such as a receipt's code, or null. */
  sourceName: z.string().nullable(),
  resultingOnHand: z.number().int(),
  note: z.string().nullable(),
  /** Who saved it ("Ana Cruz (ana)"), on which machine, at which location; null when nobody or none. */
  createdBy: z.string().nullable(),
  createdMachine: z.string().nullable(),
  createdLocation: z.string().nullable(),
  /** An ISO date and time. */
  createdAt: z.string(),
});
export type InventoryLogLineOnWire = z.infer<typeof InventoryLogLineOnWire>;

/** The newest lines of the location's inventory log, newest first, and whether there are older ones. */
export const InventoryLogsReply = z.object({ location: LocationOnWire, lines: z.array(InventoryLogLineOnWire), more: z.boolean() });
export type InventoryLogsReply = z.infer<typeof InventoryLogsReply>;

/** One change a person records. KVNsysCore's rules (checkInventoryChange) are checked at the server. */
export const MovementFields = z.object({
  productId: z.string().max(100),
  type: z.enum(MovementTypes),
  quantityChange: z.number(),
  note: z.string().max(2000).nullable(),
});
export type MovementFields = z.infer<typeof MovementFields>;

/** A delivery's worth of lines at most. */
export const InventoryMovementsRequest = z.object({ movements: z.array(MovementFields).min(1).max(500) });
export type InventoryMovementsRequest = z.infer<typeof InventoryMovementsRequest>;

/** The lines as saved, in the order sent. */
export const InventoryMovementsReply = z.object({ movements: z.array(MovementOnWire) });
export type InventoryMovementsReply = z.infer<typeof InventoryMovementsReply>;
