import type { AccessName } from '../identity/accesses.js';
import type { Lineage } from '../shared/lineage.js';
import { Refusal } from '../shared/refusal.js';

/**
 * Why stock moved, named by the two parties (SCHEMA-PLAN): goods in from a supplier, goods out to
 * a customer, or a count put right with nobody on the other side. The migration allows the same
 * ones. SCHEMA-PLAN's others (to_supplier, transfer, from_customer, disposal) come with the features
 * that need them.
 */
export const MovementTypes = ['from_supplier', 'to_customer', 'adjustment'] as const;
export type MovementType = (typeof MovementTypes)[number];

export const StockLimits = { quantity: 1_000_000, note: 500, sourceTable: 60 } as const;

/**
 * The movements a person records by hand, on the Stock screen, and the right each one needs. Goods
 * out to a customer are never typed in: only a sale records them, so the count and the day's sales
 * can't disagree.
 */
const HandRights: Partial<Record<MovementType, AccessName>> = { from_supplier: 'stock.receive', adjustment: 'stock.adjust' };

/** The right a person needs to record this kind of movement by hand, or null when it can't be recorded by hand. */
export function rightToRecordByHand(type: MovementType): AccessName | null {
  return HandRights[type] ?? null;
}

/** A change to stock, as asked for. Quantities are whole pieces. */
export interface StockChange {
  locationId: string;
  productId: string;
  type: MovementType;
  /** Positive in, negative out, never zero. */
  quantityChange: number;
  /** Why, in words. An adjustment needs one. */
  note: string | null;
  /** The document that caused it, such as the sale it was sold in, or null. */
  source: { table: string; id: string } | null;
}

/** A line in the stock ledger, as saved. Lines are never changed or removed. */
export interface StockMovement extends StockChange {
  id: string;
  /** The location's stock of the product just after this line. */
  resultingOnHand: number;
  /** When it was saved, by the database's clock, as an ISO date and time. */
  createdAt: string;
  createdByUser: string | null;
}

/** A product's stock at one location. */
export interface StockLevel {
  productId: string;
  stock: number;
}

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/**
 * The rules a stock change meets before it's saved, wherever it came from. Hands it back tidied
 * (note and source trimmed, an empty note as none) or refuses with a message a person can act on.
 * Whether the product and the location exist, only the store can say.
 */
export function checkStockChange(change: StockChange): StockChange {
  if (!MovementTypes.includes(change.type)) refuse(`"${change.type}" isn't a kind of stock movement this version of KVNsys knows.`);
  if (!change.locationId.trim()) refuse('A stock movement needs the shop it happens at.');
  if (!change.productId.trim()) refuse('A stock movement needs the product that moves.');
  const quantity = change.quantityChange;
  if (!Number.isSafeInteger(quantity)) refuse('Stock moves in whole pieces.');
  if (quantity === 0) refuse('A stock movement has to move at least one piece.');
  if (Math.abs(quantity) > StockLimits.quantity) refuse(`One movement can be at most ${StockLimits.quantity.toLocaleString('en-US')} pieces.`);
  if (change.type === 'from_supplier' && quantity < 0) refuse('Goods from a supplier come in, so the quantity has to be more than zero.');
  if (change.type === 'to_customer' && quantity > 0) refuse('Goods sold go out, so the quantity has to be less than zero.');

  const note = change.note?.trim() || null;
  if (note && note.length > StockLimits.note) refuse(`A note can be at most ${StockLimits.note} characters.`);
  if (change.type === 'adjustment' && !note) refuse('Say why the count is being put right, such as "counted 22 on the shelf".');

  let source: StockChange['source'] = null;
  if (change.source) {
    const table = change.source.table.trim();
    const id = change.source.id.trim();
    if (!table || !id) refuse('A movement that names the document it came from needs both its kind and its id.');
    if (table.length > StockLimits.sourceTable) refuse(`A document's kind can be at most ${StockLimits.sourceTable} characters.`);
    source = { table, id };
  }
  return { locationId: change.locationId.trim(), productId: change.productId.trim(), type: change.type, quantityChange: quantity, note, source };
}

/**
 * The stock ledger. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * Every change to stock is one line, and stock on hand is those lines added up. Lines are never
 * edited or removed: a mistake is put right by another line the other way. Stock can go below
 * zero; the ledger records what happened, and whether to refuse a sale is selling's rule.
 */
export abstract class StockLedger {
  /**
   * Saves the changes, all or none, and hands back the lines as saved, in the order given. Two
   * changes at once to the same product's stock never lose either: each line's resulting_on_hand
   * counts every line before it.
   */
  abstract record(changes: StockChange[], lineage: Lineage): Promise<StockMovement[]>;
  /** How many of the product the location holds now: 0 if it has never moved there. */
  abstract onHand(locationId: string, productId: string): Promise<number>;
  /** Every product that has ever moved at the location, with its stock now. */
  abstract levels(locationId: string): Promise<StockLevel[]>;
  /** The product's movements at the location, newest first: all of them, or the newest `limit`. */
  abstract movements(locationId: string, productId: string, limit?: number): Promise<StockMovement[]>;
}
