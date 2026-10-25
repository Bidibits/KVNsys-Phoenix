import type { PriceBasis } from '@kvnsys/client';

/**
 * What a line says about the price it was charged at: nothing for the shelf price, which is the
 * usual one. Naming them by PriceBasis makes the build fail if one is missing.
 */
export const PriceBasisWords = {
  Retail: null,
  Promo: 'Promo price',
  Wholesale: 'Wholesale price',
} satisfies Record<PriceBasis, string | null>;
