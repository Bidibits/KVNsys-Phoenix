import { AccessDescriptions, Accesses, DefaultRoles, type AccessName } from '@kvnsys/core';
import type { RightToGrant } from '@kvnsys/postgres';

/** The rights the first database update came with. A new install's roles get them from the seed. */
export const RightsInFirstUpdate: readonly AccessName[] = [Accesses.MachinesRegister, Accesses.MachinesView, Accesses.MachinesManage];

/**
 * The rights each later database update brought in, by the update's name.
 *
 * When a server applies one of these updates to a database that already has its roles, each default
 * role that should hold one of these rights (DefaultRoles) gets it then, in the same transaction. An
 * update is only ever applied once, so a right a manager later takes away is never handed back.
 *
 * So a new right comes with a database update (an empty one will do) and a line here. A test checks
 * that every right is in the first update or in exactly one line below.
 */
export const RightsAddedBy: Readonly<Record<string, readonly AccessName[]>> = {
  '20261018083704_products': [Accesses.ProductsView, Accesses.ProductsManage],
};

/** The default roles' share of the rights these updates brought in. */
export function rightsToGrant(applied: string[]): RightToGrant[] {
  return applied.flatMap((update) =>
    (RightsAddedBy[update] ?? []).flatMap((access) =>
      DefaultRoles.filter((role) => role.accesses.includes(access)).map((role) => ({
        roleCode: role.code,
        access,
        description: AccessDescriptions[access],
      })),
    ),
  );
}
