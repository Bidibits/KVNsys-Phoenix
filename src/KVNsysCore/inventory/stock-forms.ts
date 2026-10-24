import { Refusal } from '../shared/refusal.js';
import { StockLimits } from './stock-ledger.js';

/**
 * A change a person records by hand: goods in from a supplier, or a count put right. The shop is
 * never part of it: it's always the server's own.
 */
export interface HandMovement {
  productId: string;
  type: 'from_supplier' | 'adjustment';
  quantityChange: number;
  note: string | null;
}

/** One line of a delivery as the Receive panel holds it: the product found, and the pieces as typed. */
export interface DeliveryLineForm {
  productId: string;
  /** The product's name, to say which line a problem is on. */
  name: string;
  pieces: string;
}

/** A count as the Adjust panel holds it: what KVNsys had when the panel opened, and what was typed. */
export interface CountForm {
  productId: string;
  /** The stock KVNsys showed when the count was typed. */
  onHand: number;
  counted: string;
  reason: string;
}

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/** Pieces as typed, "24" or "1,200", into a whole number, or a refusal that says how to type it. */
export function readPieces(typed: string): number {
  const text = typed.trim();
  if (!text) refuse('Type how many pieces, like 24.');
  if (!/^(\d+|\d{1,3}(,\d{3})+)$/.test(text)) refuse(`"${text}" isn't a number of pieces. Type a whole number, like 24.`);
  const pieces = Number(text.replaceAll(',', ''));
  if (pieces > StockLimits.quantity) refuse(`That's more than ${StockLimits.quantity.toLocaleString('en-US')} pieces. Check the number.`);
  return pieces;
}

/**
 * A delivery as typed, into one goods-in line per line typed, each carrying the delivery's note, or
 * a refusal that names the product it's about.
 */
export function readDelivery(lines: readonly DeliveryLineForm[], note: string): HandMovement[] {
  if (lines.length === 0) refuse('Add at least one product to the delivery.');
  const shared = note.trim() || null;
  return lines.map((line) => {
    let pieces: number;
    try {
      pieces = readPieces(line.pieces);
    } catch (error) {
      if (error instanceof Refusal) refuse(`${line.name}: ${error.message}`);
      throw error;
    }
    if (pieces === 0) refuse(`${line.name}: a delivery brings at least one piece. Remove the line if none came.`);
    return { productId: line.productId, type: 'from_supplier', quantityChange: pieces, note: shared };
  });
}

/**
 * A count as typed, into the change that puts KVNsys's stock right: what was counted, less what
 * KVNsys had. Nothing to put right, or no reason, is refused.
 */
export function readCount(form: CountForm): HandMovement {
  const counted = readPieces(form.counted);
  const reason = form.reason.trim();
  const change = counted - form.onHand;
  if (change === 0) refuse(`KVNsys already has ${counted.toLocaleString('en-US')}, so there's nothing to put right.`);
  if (!reason) refuse('Say why the count is different, such as "2 torn, thrown away".');
  return { productId: form.productId, type: 'adjustment', quantityChange: change, note: reason };
}
