import type { Lineage } from '../shared/lineage.js';
import { isCentavos } from '../shared/money.js';
import { Refusal } from '../shared/refusal.js';

/** An Active product can be sold. An Inactive one is kept, because past sales still name it. */
export const ProductStatuses = ['Active', 'Inactive'] as const;
export type ProductStatus = (typeof ProductStatuses)[number];

/** What a person fills in for a product: the launch list's fields. */
export interface ProductDetails {
  /** What staff type: PRD-0042. */
  code: string;
  /** What the scanner reads. Loose goods have none. */
  barcode: string | null;
  name: string;
  /** The shelf price, in centavos. */
  retailPrice: number;
  status: ProductStatus;
  description: string | null;
}

export interface Product extends ProductDetails {
  id: string;
}

export const ProductLimits = { code: 40, barcode: 48, name: 200, description: 1000 } as const;

/**
 * The rules a product meets before it's saved. Hands it back tidied (spaces trimmed, an empty
 * barcode or description as none) or refuses it with a message a person can act on.
 *
 * A price of zero is allowed, so a product can be encoded before it's priced. The till is what
 * refuses to sell one: the launch plan's lesson is that an unpriced item once rang up free.
 */
export function checkProduct(details: ProductDetails): ProductDetails {
  const code = details.code.trim();
  const barcode = details.barcode?.trim() || null;
  const name = details.name.trim();
  const description = details.description?.trim() || null;

  if (!code) refuse('A product needs a code.');
  // Typed at a till and matched exactly, so a space would only ever cause a miss.
  if (/\s/.test(code)) refuse(`A code can't contain spaces: "${code}".`);
  if (code.length > ProductLimits.code) refuse(`A code can be at most ${ProductLimits.code} characters.`);
  if (barcode !== null) {
    if (/\s/.test(barcode)) refuse(`A barcode can't contain spaces: "${barcode}".`);
    if (barcode.length > ProductLimits.barcode) refuse(`A barcode can be at most ${ProductLimits.barcode} characters.`);
  }
  if (!name) refuse('A product needs a name.');
  if (name.length > ProductLimits.name) refuse(`A name can be at most ${ProductLimits.name} characters.`);
  if (!isCentavos(details.retailPrice)) {
    refuse('The price has to be zero or more, to the centavo, and at most 999,999,999,999.99.');
  }
  if (!ProductStatuses.includes(details.status)) {
    refuse(`A product is ${ProductStatuses.join(' or ')}, not "${details.status}".`);
  }
  if (description !== null && description.length > ProductLimits.description) {
    refuse(`A description can be at most ${ProductLimits.description} characters.`);
  }
  return { code, barcode, name, retailPrice: details.retailPrice, status: details.status, description };
}

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/**
 * Where products are kept. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * Saving checks the product (checkProduct) and refuses a code or barcode another product already
 * has, ignoring capitals. A value is also never one product's code and another's barcode, so
 * whatever is typed or scanned at a till finds one product at most. A product's own code may be
 * its barcode too. Finding by code or barcode ignores capitals as well.
 */
export abstract class ProductCatalog {
  abstract create(details: ProductDetails, lineage: Lineage): Promise<Product>;
  abstract update(id: string, details: ProductDetails, lineage: Lineage): Promise<Product>;
  abstract get(id: string): Promise<Product | null>;
  abstract findByCode(code: string): Promise<Product | null>;
  abstract findByBarcode(barcode: string): Promise<Product | null>;
  /** Every product, by name. */
  abstract list(): Promise<Product[]>;
}
