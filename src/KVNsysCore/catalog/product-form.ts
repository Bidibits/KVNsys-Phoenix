import { parsePesos, pesosText } from '../shared/money.js';
import { Refusal } from '../shared/refusal.js';
import { checkProduct, ProductStatuses, type FullProductDetails, type ProductStatus } from './products.js';

/**
 * A product as a form holds it: every box's text exactly as typed, and the two tick boxes as
 * ticked. A screen keeps this, and readProductForm turns it into a product, so no screen ever
 * decides what a price means.
 */
export interface ProductForm {
  code: string;
  barcode: string;
  name: string;
  /** Pesos, as typed: "1450.50", "1,450.5". */
  retailPrice: string;
  status: string;
  description: string;
  /** The id of the entry chosen from each catalogue list, or empty for none. */
  categoryId: string;
  brandId: string;
  supplierId: string;
  manufacturerId: string;
  unitOfMeasure: string;
  tracksStock: boolean;
  /** Pesos, as typed; empty is ₱0.00 (not known). */
  costPrice: string;
  /** Pesos, as typed; empty is none. */
  promoPrice: string;
  wholesalePrice: string;
  /** Pieces, as typed; empty is none. */
  wholesaleQuantity: string;
  hasWarranty: boolean;
  /** Months, as typed. Read only when hasWarranty is ticked. */
  warrantyMonths: string;
  /** The picture as base64 JPEG text, or empty for none. It's checked apart (checkProductPicture). */
  picture: string;
}

/** A new product starts empty, Active, counted in stock, and without a warranty. */
export function blankProductForm(): ProductForm {
  return {
    code: '',
    barcode: '',
    name: '',
    retailPrice: '',
    status: 'Active',
    description: '',
    categoryId: '',
    brandId: '',
    supplierId: '',
    manufacturerId: '',
    unitOfMeasure: '',
    tracksStock: true,
    costPrice: '',
    promoPrice: '',
    wholesalePrice: '',
    wholesaleQuantity: '',
    hasWarranty: false,
    warrantyMonths: '',
    picture: '',
  };
}

/** A product's details as the form shows them for editing, with its picture if it has one. */
export function productFormFor(product: FullProductDetails, picture = ''): ProductForm {
  const pesos = (centavos: number | null) => (centavos === null ? '' : pesosText(centavos));
  return {
    code: product.code,
    barcode: product.barcode ?? '',
    name: product.name,
    retailPrice: pesosText(product.retailPrice),
    status: product.status,
    description: product.description ?? '',
    categoryId: product.categoryId ?? '',
    brandId: product.brandId ?? '',
    supplierId: product.supplierId ?? '',
    manufacturerId: product.manufacturerId ?? '',
    unitOfMeasure: product.unitOfMeasure ?? '',
    tracksStock: product.tracksStock,
    costPrice: product.costPrice === 0 ? '' : pesos(product.costPrice),
    promoPrice: pesos(product.promoPrice),
    wholesalePrice: pesos(product.wholesalePrice),
    wholesaleQuantity: product.wholesaleQuantity === null ? '' : String(product.wholesaleQuantity),
    hasWarranty: product.hasWarranty,
    warrantyMonths: product.hasWarranty ? String(product.warrantyMonths) : '',
    picture,
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

/** One of the other prices as typed: empty is none, anything else has to be pesos. */
function readOtherPrice(typed: string, what: string): number | null {
  const text = typed.trim();
  if (!text) return null;
  const centavos = parsePesos(text);
  if (centavos === null) {
    throw new Refusal('invalid', `The ${what} "${text}" isn't a price. Type it in pesos, like 1450.50, with at most two decimals.`);
  }
  return centavos;
}

/** A count as typed: empty is none, anything else has to be a whole number. */
function readWhole(typed: string, of: string): number | null {
  const text = typed.trim();
  if (!text) return null;
  if (!/^\d{1,9}$/.test(text)) throw new Refusal('invalid', `"${text}" isn't a whole number of ${of}.`);
  return Number(text);
}

/** What was typed, as a product that meets the rules (checkProduct), or a refusal in plain words. */
export function readProductForm(form: ProductForm): FullProductDetails {
  const retailPrice = readRetailPrice(form.retailPrice);
  if (!ProductStatuses.includes(form.status as ProductStatus)) {
    throw new Refusal('invalid', `A product is ${ProductStatuses.join(' or ')}, not "${form.status}".`);
  }
  const warrantyMonths = form.hasWarranty ? readWhole(form.warrantyMonths, 'months') : 0;
  if (warrantyMonths === null) throw new Refusal('invalid', 'Type how many months the warranty lasts.');
  return checkProduct({
    code: form.code,
    barcode: form.barcode,
    name: form.name,
    retailPrice,
    status: form.status as ProductStatus,
    description: form.description,
    categoryId: form.categoryId,
    brandId: form.brandId,
    supplierId: form.supplierId,
    manufacturerId: form.manufacturerId,
    unitOfMeasure: form.unitOfMeasure,
    tracksStock: form.tracksStock,
    costPrice: readOtherPrice(form.costPrice, 'cost') ?? 0,
    promoPrice: readOtherPrice(form.promoPrice, 'promo price'),
    wholesalePrice: readOtherPrice(form.wholesalePrice, 'wholesale price'),
    wholesaleQuantity: readWhole(form.wholesaleQuantity, 'pieces'),
    hasWarranty: form.hasWarranty,
    warrantyMonths,
  });
}
