import { parsePesos, pesosText } from '../shared/money.js';
import { Refusal } from '../shared/refusal.js';
import { checkProduct, ProductStatuses, type ProductDetails, type ProductStatus } from './products.js';

/**
 * A product as a form holds it: every field is text, exactly as typed. A screen keeps this, and
 * readProductForm turns it into a product, so no screen ever decides what a price means.
 */
export interface ProductForm {
  code: string;
  barcode: string;
  name: string;
  /** Pesos, as typed: "1450.50", "1,450.5". */
  retailPrice: string;
  status: string;
  description: string;
}

/** A new product starts empty, and Active. */
export function blankProductForm(): ProductForm {
  return { code: '', barcode: '', name: '', retailPrice: '', status: 'Active', description: '' };
}

/** A product's details as the form shows them for editing. */
export function productFormFor(product: ProductDetails): ProductForm {
  return {
    code: product.code,
    barcode: product.barcode ?? '',
    name: product.name,
    retailPrice: pesosText(product.retailPrice),
    status: product.status,
    description: product.description ?? '',
  };
}

/**
 * A price as typed, into centavos, or a refusal that says how to type it. An empty box is refused
 * rather than taken as zero: a free product should be typed as 0, on purpose.
 */
export function readRetailPrice(typed: string): number {
  const text = typed.trim();
  if (!text) throw new Refusal('invalid', 'Type the price, in pesos, like 1450.50.');
  const centavos = parsePesos(text);
  if (centavos === null) {
    throw new Refusal('invalid', `"${text}" isn't a price. Type it in pesos, like 1450.50, with at most two decimals.`);
  }
  return centavos;
}

/** What was typed, as a product that meets the rules (checkProduct), or a refusal in plain words. */
export function readProductForm(form: ProductForm): ProductDetails {
  const retailPrice = readRetailPrice(form.retailPrice);
  if (!ProductStatuses.includes(form.status as ProductStatus)) {
    throw new Refusal('invalid', `A product is ${ProductStatuses.join(' or ')}, not "${form.status}".`);
  }
  return checkProduct({
    code: form.code,
    barcode: form.barcode,
    name: form.name,
    retailPrice,
    status: form.status as ProductStatus,
    description: form.description,
  });
}
