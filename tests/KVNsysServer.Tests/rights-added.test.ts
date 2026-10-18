import { AllAccesses } from '@kvnsys/core';
import { knownMigrations } from '@kvnsys/postgres';
import { RightsAddedBy, RightsInFirstUpdate, rightsToGrant } from '@kvnsys/server';
import { describe, expect, it } from 'vitest';

describe('the rights each database update brought in', () => {
  it('account for every right: in the first update, or added by exactly one later update', () => {
    const added = Object.values(RightsAddedBy).flat();
    expect(new Set(added).size).toBe(added.length);
    expect([...RightsInFirstUpdate, ...added].sort()).toEqual([...AllAccesses].sort());
  });

  it('name only updates this server ships, and never the first one', () => {
    const [first, ...later] = knownMigrations();
    for (const update of Object.keys(RightsAddedBy)) expect(later).toContain(update);
    expect(Object.keys(RightsAddedBy)).not.toContain(first);
  });

  it("hand each default role its share of the products update's rights, and nothing for the first", () => {
    expect(rightsToGrant(['20261018083704_products']).map((r) => `${r.roleCode} ${r.access}`).sort()).toEqual([
      'ADMIN products.manage',
      'ADMIN products.view',
      'CASHIER products.view',
      'MANAGER products.manage',
      'MANAGER products.view',
    ]);
    expect(rightsToGrant([knownMigrations()[0]!])).toEqual([]);
    expect(rightsToGrant([])).toEqual([]);
  });
});
