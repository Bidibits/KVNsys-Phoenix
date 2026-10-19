import { AllAccesses, type AccessName } from './accesses.js';

export interface RoleDefinition {
  code: string;
  name: string;
  /** Higher outranks lower. */
  level: number;
  accesses: readonly AccessName[];
}

export const AdminRoleCode = 'ADMIN';

/**
 * The roles a new install starts with: only the Administrator, holding every right, so the first
 * person can sign in and set the shop up. Every other role (a branch manager, a cashier) is made by
 * hand, with the rights the shop decides on. The user's decision of 2026-10-19: no premade roles.
 */
export const DefaultRoles: readonly RoleDefinition[] = [
  { code: AdminRoleCode, name: 'Administrator', level: 100, accesses: AllAccesses },
];
