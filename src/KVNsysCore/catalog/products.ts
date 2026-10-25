import type { Lineage } from '../shared/lineage.js';
import { displayPesos, isCentavos } from '../shared/money.js';
import { Refusal } from '../shared/refusal.js';

/** An Active product can be sold. An Inactive one is kept, because past sales still name it. */
export const ProductStatuses = ['Active', 'Inactive'] as const;
export type ProductStatus = (typeof ProductStatuses)[number];

const Uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What a person fills in for a product: the launch list's fields, then the rest of SCHEMA-PLAN's.
 * The rest may be left out, and each then takes its value from ProductDefaults, so a product can
 * still be typed with only what a till needs.
 */
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

  /** Where it's sorted: one entry from each of the catalogue's lists, or none. */
  categoryId?: string | null;
  brandId?: string | null;
  supplierId?: string | null;
  manufacturerId?: string | null;
  /** pc, box, pack: free text for now. */
  unitOfMeasure?: string | null;
  /** A service, say, doesn't: selling it takes nothing out of stock. */
  tracksStock?: boolean;
  /** What the shop pays, in centavos: whatever someone last typed. */
  costPrice?: number;
  /** A price below the shelf price, in centavos, while there's a promo; none otherwise. */
  promoPrice?: number | null;
  /** The price from wholesaleQuantity pieces up, in centavos. The two come together or not at all. */
  wholesalePrice?: number | null;
  wholesaleQuantity?: number | null;
  hasWarranty?: boolean;
  /** Whole months; 0 without a warranty. */
  warrantyMonths?: number;
}

/** A product's details with nothing left out: what checkProduct hands back and the catalog keeps. */
export type FullProductDetails = Required<ProductDetails>;

/** What each of the fields after the launch list's is when it's left out. */
export const ProductDefaults = {
  categoryId: null,
  brandId: null,
  supplierId: null,
  manufacturerId: null,
  unitOfMeasure: null,
  tracksStock: true,
  costPrice: 0,
  promoPrice: null,
  wholesalePrice: null,
  wholesaleQuantity: null,
  hasWarranty: false,
  warrantyMonths: 0,
} as const satisfies Omit<FullProductDetails, 'code' | 'barcode' | 'name' | 'retailPrice' | 'status' | 'description'>;

export interface Product extends FullProductDetails {
  id: string;
  /** Whether it has a picture. The picture itself is fetched apart (ProductCatalog.picture). */
  hasPicture: boolean;
}

export const ProductLimits = {
  code: 40,
  barcode: 48,
  name: 200,
  description: 1000,
  unitOfMeasure: 20,
  wholesaleQuantity: 1_000_000,
  warrantyMonths: 120,
} as const;

/** The catalogue lists a product can be sorted under, by field, with how a refusal names each. */
const Sorting = {
  categoryId: 'category',
  brandId: 'brand',
  supplierId: 'supplier',
  manufacturerId: 'manufacturer',
} as const;
export type ProductSortingField = keyof typeof Sorting;
export const ProductSortingFields = Object.keys(Sorting) as ProductSortingField[];

/** "That brand isn't there any more. Choose another.": the same words wherever a choice has gone. */
export const chosenEntryGone = (field: ProductSortingField) => `That ${Sorting[field]} isn't there any more. Choose another.`;

/**
 * The rules a product meets before it's saved. Hands it back tidied (spaces trimmed, empty text as
 * none, every field left out filled from ProductDefaults) or refuses it with a message a person can
 * act on.
 *
 * A price of zero is allowed, so a product can be encoded before it's priced. The till is what
 * refuses to sell one: the launch plan's lesson is that an unpriced item once rang up free. A promo
 * or wholesale price, though, is never zero (empty says "none"), and always below the shelf price:
 * the till will charge the cheapest price the customer qualifies for (SCHEMA-PLAN), so one above it
 * could never apply.
 */
export function checkProduct(details: ProductDetails): FullProductDetails {
  const full = { ...ProductDefaults, ...withoutUndefined(details) };
  const code = full.code.trim();
  const barcode = full.barcode?.trim() || null;
  const name = full.name.trim();
  const description = full.description?.trim() || null;
  const unitOfMeasure = full.unitOfMeasure?.trim() || null;
  const sorting = {} as Record<ProductSortingField, string | null>;
  for (const field of ProductSortingFields) sorting[field] = full[field]?.trim() || null;

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
  if (!isCentavos(full.retailPrice)) {
    refuse('The price has to be zero or more, to the centavo, and at most 999,999,999,999.99.');
  }
  if (!ProductStatuses.includes(full.status)) {
    refuse(`A product is ${ProductStatuses.join(' or ')}, not "${full.status}".`);
  }
  if (description !== null && description.length > ProductLimits.description) {
    refuse(`A description can be at most ${ProductLimits.description} characters.`);
  }

  for (const field of ProductSortingFields) {
    const id = sorting[field];
    if (id !== null && !Uuid.test(id)) refuse(chosenEntryGone(field));
  }
  if (unitOfMeasure !== null && unitOfMeasure.length > ProductLimits.unitOfMeasure) {
    refuse(`A unit can be at most ${ProductLimits.unitOfMeasure} characters, like pc, box or pack.`);
  }
  if (typeof full.tracksStock !== 'boolean') refuse('Say whether selling it takes it out of stock.');

  if (!isCentavos(full.costPrice)) refuse('The cost has to be zero or more, to the centavo.');
  if (full.promoPrice !== null) checkLowerPrice('promo price', full.promoPrice, full.retailPrice);
  if (full.wholesalePrice !== null || full.wholesaleQuantity !== null) {
    if (full.wholesalePrice === null) refuse(`Wholesale from ${full.wholesaleQuantity} pieces needs a wholesale price.`);
    if (full.wholesaleQuantity === null) refuse('A wholesale price needs the number of pieces it starts at.');
    checkLowerPrice('wholesale price', full.wholesalePrice, full.retailPrice);
    const pieces = full.wholesaleQuantity;
    if (!Number.isInteger(pieces) || pieces < 2 || pieces > ProductLimits.wholesaleQuantity) {
      refuse(`Wholesale starts at a whole number of pieces, from 2 to ${ProductLimits.wholesaleQuantity.toLocaleString('en-PH')}.`);
    }
  }

  if (typeof full.hasWarranty !== 'boolean') refuse('Say whether it has a warranty.');
  const months = full.warrantyMonths;
  if (full.hasWarranty && (!Number.isInteger(months) || months < 1 || months > ProductLimits.warrantyMonths)) {
    refuse(`A warranty lasts a whole number of months, from 1 to ${ProductLimits.warrantyMonths}.`);
  }
  if (!full.hasWarranty && months !== 0) refuse('Warranty months only go with a warranty.');

  return {
    code,
    barcode,
    name,
    retailPrice: full.retailPrice,
    status: full.status,
    description,
    ...sorting,
    unitOfMeasure,
    tracksStock: full.tracksStock,
    costPrice: full.costPrice,
    promoPrice: full.promoPrice,
    wholesalePrice: full.wholesalePrice,
    wholesaleQuantity: full.wholesaleQuantity,
    hasWarranty: full.hasWarranty,
    warrantyMonths: months,
  };
}

/** A promo or wholesale price: more than zero (none is empty, not ₱0.00), and below the shelf price. */
function checkLowerPrice(what: string, price: number, retailPrice: number) {
  if (!isCentavos(price)) refuse(`The ${what} has to be more than zero, to the centavo.`);
  if (price === 0) refuse(`A ${what} of ₱0.00 would give it away. Leave it empty if there isn't one.`);
  if (price >= retailPrice) refuse(`A ${what} has to be below the shelf price (${displayPesos(retailPrice)}).`);
}

/** Left out and undefined are the same thing here, so a field sent as undefined still takes its default. */
function withoutUndefined(details: ProductDetails): ProductDetails {
  return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined)) as unknown as ProductDetails;
}

/**
 * A product's one picture. SCHEMA-PLAN keeps a single format, so nothing has to record how to
 * read it: a JPEG, shrunk on the register before it's sent (see ProductPictureLimit).
 */
export const ProductPictureLimit = 256 * 1024;

/** The picture as it will be kept, or a refusal: it has to be a JPEG, of at most 256 KB. */
export function checkProductPicture(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    refuse("A product's picture has to be a JPEG.");
  }
  if (bytes.length > ProductPictureLimit) {
    refuse(`A product's picture can be at most ${ProductPictureLimit / 1024} KB; this one is ${Math.ceil(bytes.length / 1024)} KB.`);
  }
  return bytes;
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
 * its barcode too. Finding by code or barcode ignores capitals as well. A category, brand, supplier
 * or manufacturer it's sorted under has to exist.
 *
 * The picture travels apart from the details, so a list never carries every product's picture.
 * Saving takes one (checkProductPicture) or null for none; changing a product without one keeps
 * the picture it has.
 */
export abstract class ProductCatalog {
  abstract create(details: ProductDetails, lineage: Lineage, picture?: Uint8Array | null): Promise<Product>;
  abstract update(id: string, details: ProductDetails, lineage: Lineage, picture?: Uint8Array | null): Promise<Product>;
  abstract get(id: string): Promise<Product | null>;
  /** The product's picture; null when it has none, or there's no such product. */
  abstract picture(id: string): Promise<Uint8Array | null>;
  abstract findByCode(code: string): Promise<Product | null>;
  abstract findByBarcode(barcode: string): Promise<Product | null>;
  /** Every product, by name. */
  abstract list(): Promise<Product[]>;
}
