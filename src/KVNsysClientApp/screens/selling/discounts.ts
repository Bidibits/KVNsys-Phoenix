import type { DiscountKind } from '@kvnsys/client';

/** What each discount is called on screen. Naming them by DiscountKind makes the build fail if one is missing. */
export const DiscountChoices = {
  senior: 'Senior citizen',
  pwd: 'Person with disability (PWD)',
} satisfies Record<DiscountKind, string>;
