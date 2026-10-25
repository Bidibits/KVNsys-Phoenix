import type { ProductStatus } from '../catalog/products.js';
import type { Lineage } from '../shared/lineage.js';
import { displayPesos, MaxCentavos, parsePesos } from '../shared/money.js';
import { Refusal } from '../shared/refusal.js';
import type { ReceiptSummary } from './days.js';

/**
 * The statutory discounts: a senior citizen (RA 9994) or a person with a disability (RA 10754).
 * A cashier gives one without a supervisor, on the customer's ID.
 */
export const DiscountKinds = ['senior', 'pwd'] as const;
export type DiscountKind = (typeof DiscountKinds)[number];
export const DiscountNames: Record<DiscountKind, string> = { senior: 'Senior citizen', pwd: 'Person with disability' };
/** Off the whole sale. */
export const StatutoryDiscountPercent = 20;

/** How a sale is paid. Cash only for now; card and GCash come later. */
export const PaymentTypes = ['Cash'] as const;
export type PaymentType = (typeof PaymentTypes)[number];

export const SaleLimits = { lines: 200, quantity: 10_000, idNumber: 40, customerName: 100 } as const;

/** Which of a product's prices a line was charged at: SCHEMA-PLAN's price_basis. */
export const PriceBases = ['Retail', 'Promo', 'Wholesale'] as const;
export type PriceBasis = (typeof PriceBases)[number];

/** A product as the till prices it. Money is in centavos. */
export interface SaleProduct {
  id: string;
  code: string;
  name: string;
  /** The shelf price. */
  retailPrice: number;
  status: ProductStatus;
  /** Below the shelf price while there's a promo. Left out, there's none. */
  promoPrice?: number | null;
  /** The price once a line reaches wholesaleQuantity pieces. Left out, there's none. */
  wholesalePrice?: number | null;
  wholesaleQuantity?: number | null;
}

/** What the cashier rang up: a product, and how many. */
export interface CartLine {
  product: SaleProduct;
  quantity: number;
}

/** The customer's statutory discount, with what the law asks the shop to keep: whose ID it was. */
export interface StatutoryDiscount {
  kind: DiscountKind;
  idNumber: string;
  customerName: string;
}

/** A line as charged. Money is in centavos; the code, name and price are as they were at the sale. */
export interface PricedLine {
  productId: string;
  code: string;
  name: string;
  quantity: number;
  unitPrice: number;
  /** Which of the product's prices unitPrice is. */
  priceBasis: PriceBasis;
  /** quantity × unitPrice */
  subtotal: number;
  discount: number;
  /** subtotal − discount */
  total: number;
}

export interface PricedSale {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  discount: StatutoryDiscount | null;
}

export interface CashPayment {
  type: PaymentType;
  tendered: number;
  change: number;
}

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/** A share of an amount in whole centavos, half a centavo and up rounding up. */
function percentOf(centavos: number, percent: number): number {
  return Math.floor((centavos * percent + 50) / 100);
}

/**
 * The price a line is charged at without a statutory discount: the cheapest the customer qualifies
 * for (SCHEMA-PLAN). That's the promo price while there is one, and the wholesale price once the
 * line reaches its pieces. KVNsysCore's product rules keep both below the shelf price; on a tie the
 * promo wins, and the shelf price is charged only when nothing beats it.
 */
export function bestPrice(product: SaleProduct, quantity: number): { unitPrice: number; priceBasis: PriceBasis } {
  let best: { unitPrice: number; priceBasis: PriceBasis } = { unitPrice: product.retailPrice, priceBasis: 'Retail' };
  const promo = product.promoPrice ?? null;
  if (promo !== null && promo > 0 && promo < best.unitPrice) best = { unitPrice: promo, priceBasis: 'Promo' };
  const wholesale = product.wholesalePrice ?? null;
  const from = product.wholesaleQuantity ?? null;
  if (wholesale !== null && from !== null && wholesale > 0 && quantity >= from && wholesale < best.unitPrice) {
    best = { unitPrice: wholesale, priceBasis: 'Wholesale' };
  }
  return best;
}

/**
 * A line for a customer with a senior/PWD discount: **the better of the two, not both** — the
 * promo or wholesale price as it is, or 20% off the shelf price, whichever comes to less (a tie
 * takes the 20%, so the discount is on record). A stand-in the user hasn't settled (decisions.md,
 * Open): "both" would be 20% off the price charged instead, and this is the one place to change.
 */
function withStatutoryDiscount(product: SaleProduct, quantity: number): Omit<PricedLine, 'productId' | 'code' | 'name' | 'quantity'> {
  const best = bestPrice(product, quantity);
  const shelf = product.retailPrice * quantity;
  const off = percentOf(shelf, StatutoryDiscountPercent);
  const asIs = best.unitPrice * quantity;
  if (best.priceBasis === 'Retail' || shelf - off <= asIs) {
    return { unitPrice: product.retailPrice, priceBasis: 'Retail', subtotal: shelf, discount: off, total: shelf - off };
  }
  return { ...best, subtotal: asIs, discount: 0, total: asIs };
}

/** The discount as given: tidied, or refused with what's missing. */
export function checkDiscount(discount: StatutoryDiscount): StatutoryDiscount {
  if (!DiscountKinds.includes(discount.kind)) refuse(`"${discount.kind}" isn't a discount this version of KVNsys knows.`);
  const idNumber = discount.idNumber.trim();
  const customerName = discount.customerName.trim();
  const whose = discount.kind === 'senior' ? "senior citizen's" : "PWD's";
  if (!idNumber) refuse(`Type the ${whose} ID number.`);
  if (idNumber.length > SaleLimits.idNumber) refuse(`An ID number can be at most ${SaleLimits.idNumber} characters.`);
  if (!customerName) refuse(`Type the ${whose} name, as it is on the ID.`);
  if (customerName.length > SaleLimits.customerName) refuse(`A name can be at most ${SaleLimits.customerName} characters.`);
  return { kind: discount.kind, idNumber, customerName };
}

/**
 * What the sale comes to, the one place it's worked out, so the till and the server never
 * disagree. Each line is its price (bestPrice: the cheapest the customer qualifies for) times its
 * quantity; with a statutory discount, each line is the better of that price and 20% off the shelf
 * price (withStatutoryDiscount), so the lines always add up to the total. Refuses a sale that can't
 * be rung up: nothing in it, a part piece, a product switched off, or one with no price yet (an
 * unpriced item once rang up free).
 */
export function priceSale(cart: readonly CartLine[], discount: StatutoryDiscount | null): PricedSale {
  if (cart.length === 0) refuse('Scan or type at least one product.');
  if (cart.length > SaleLimits.lines) refuse(`One sale can have at most ${SaleLimits.lines} lines.`);
  const given = discount ? checkDiscount(discount) : null;

  const lines = cart.map(({ product, quantity }): PricedLine => {
    if (!Number.isSafeInteger(quantity) || quantity < 1) refuse(`${product.name}: sell at least one whole piece.`);
    if (quantity > SaleLimits.quantity) refuse(`${product.name}: one line can be at most ${SaleLimits.quantity.toLocaleString('en-US')} pieces.`);
    if (product.status !== 'Active') refuse(`${product.name} is switched off, so it can't be sold.`);
    if (product.retailPrice <= 0) refuse(`${product.name} has no price yet, so it can't be sold. Ask whoever manages products to price it.`);
    const charged = given ? withStatutoryDiscount(product, quantity) : undiscounted(product, quantity);
    return { productId: product.id, code: product.code, name: product.name, quantity, ...charged };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const discountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
  if (subtotal > MaxCentavos) refuse('That sale is more than KVNsys can record in one receipt. Split it.');
  return { lines, subtotal, discountTotal, total: subtotal - discountTotal, discount: given };
}

function undiscounted(product: SaleProduct, quantity: number): Omit<PricedLine, 'productId' | 'code' | 'name' | 'quantity'> {
  const best = bestPrice(product, quantity);
  const subtotal = best.unitPrice * quantity;
  return { ...best, subtotal, discount: 0, total: subtotal };
}

/** The customer's cash against the total: enough, and the change, or a refusal that says how much is short. */
export function takeCash(total: number, tendered: number): CashPayment {
  if (!Number.isSafeInteger(tendered) || tendered < 0 || tendered > MaxCentavos) refuse("That isn't an amount of cash.");
  if (tendered < total) refuse(`${displayPesos(tendered)} isn't enough: the total is ${displayPesos(total)}.`);
  return { type: 'Cash', tendered, change: tendered - total };
}

/** The cash given, as typed ("1,500" or "1500.50"), into centavos, or a refusal that says how to type it. */
export function readCash(typed: string): number {
  const text = typed.trim();
  if (!text) refuse('Type the cash the customer gave, in pesos, like 1500.');
  const centavos = parsePesos(text);
  if (centavos === null) refuse(`"${text}" isn't an amount of cash. Type it in pesos, like 1500 or 1500.50.`);
  return centavos;
}

/** A sale as recorded: its receipt number, what was charged, and how it was paid. */
export interface Receipt extends PricedSale {
  id: string;
  /** The shop's code and the receipt's number at that shop: HQ-000042. */
  code: string;
  number: number;
  locationId: string;
  payment: CashPayment;
  /** When it was saved, by the database's clock, as an ISO date and time. */
  createdAt: string;
  createdByUser: string | null;
  /** The register it was rung up at, or null when it was at none. */
  machineId: string | null;
  /** The shift it was rung up in. */
  shiftId: string | null;
}

/**
 * The record of sales. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * Recording a sale saves its receipt, its lines and its payment, and takes its pieces out of the
 * shop's stock (except a product that doesn't track stock, such as a service), all in one go: all
 * of it, or none. Receipt numbers count up per shop with no gaps.
 * A recorded receipt is never changed or deleted.
 */
export abstract class SalesJournal {
  /** `shiftId`: the cashier's open shift, which the receipt belongs to. Null only for a receipt recorded outside a till. */
  abstract record(sale: PricedSale, payment: CashPayment, locationId: string, lineage: Lineage, shiftId?: string | null): Promise<Receipt>;
  abstract get(id: string): Promise<Receipt | null>;
  /** The shop's receipts paid from `from` up to (not including) `to`, oldest first. */
  abstract between(locationId: string, from: Date, to: Date): Promise<ReceiptSummary[]>;
}
