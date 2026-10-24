import { checkDiscount, type CartLine, type PricedLine, type StatutoryDiscount } from '@kvnsys/core';
import { readOrRefuse, type Refused } from '../connection/server-call.js';
import { priceCart, type SaleProductResult, type SaleForm, type SaleResult } from './sales.js';

/** The sale being rung up, as the selling screen shows it: every line as charged, and the totals. */
export interface TillView {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  total: number;
  discount: StatutoryDiscount | null;
}

export type TillResult = { ok: true; till: TillView } | Refused;

/**
 * The cart, kept on the register while the cashier scans (the README's "keeping the cart" is the
 * client engine's). Every change is priced with KVNsysCore's rules before it's kept, so a product
 * that can't be sold never gets in, and what the screen shows is always what the server will charge.
 * A change that's refused leaves the sale as it was.
 */
export class Till {
  private cart: CartLine[] = [];
  private discount: StatutoryDiscount | null = null;

  view(): TillView {
    if (this.cart.length === 0) return { lines: [], subtotal: 0, discountTotal: 0, total: 0, discount: this.discount };
    const priced = priceCart(this.cart, this.discount);
    // Every cart kept here was priced before it was kept, so this can't be refused.
    if (!priced.ok) throw new Error(priced.message);
    const { lines, subtotal, discountTotal, total, discount } = priced.sale;
    return { lines, subtotal, discountTotal, total, discount };
  }

  /**
   * Finds what was scanned or typed, and adds one. Scanning a product already in the sale adds one
   * to its line, at the price it has now.
   */
  async scan(find: () => Promise<SaleProductResult>): Promise<TillResult> {
    const found = await find();
    if (!found.ok) return found;
    const { product } = found;
    const existing = this.cart.find((line) => line.product.id === product.id);
    const next = existing
      ? this.cart.map((line) => (line === existing ? { product, quantity: line.quantity + 1 } : line))
      : [...this.cart, { product, quantity: 1 }];
    return this.keep(next, this.discount);
  }

  setQuantity(productId: string, quantity: number): TillResult {
    return this.keep(
      this.cart.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
      this.discount,
    );
  }

  remove(productId: string): TillResult {
    return this.keep(
      this.cart.filter((line) => line.product.id !== productId),
      this.discount,
    );
  }

  /** Gives the sale a senior/PWD discount, or takes it off (null). */
  setDiscount(discount: StatutoryDiscount | null): TillResult {
    if (discount && this.cart.length === 0) {
      const checked = readOrRefuse(() => checkDiscount(discount));
      if (!checked.ok) return checked;
    }
    return this.keep(this.cart, discount);
  }

  clear(): TillView {
    this.cart = [];
    this.discount = null;
    return this.view();
  }

  /** Records the sale, paid with the cash as typed. Once it's recorded, the till starts a new sale. */
  async pay(tendered: string, record: (form: SaleForm) => Promise<SaleResult>): Promise<SaleResult> {
    const result = await record({ cart: this.cart, discount: this.discount, tendered });
    if (result.ok) this.clear();
    return result;
  }

  private keep(cart: CartLine[], discount: StatutoryDiscount | null): TillResult {
    if (cart.length > 0) {
      const priced = priceCart(cart, discount);
      if (!priced.ok) return priced;
      discount = priced.sale.discount;
    }
    this.cart = cart;
    this.discount = discount;
    return { ok: true, till: this.view() };
  }
}
