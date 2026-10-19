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

/** The Administrator: it can be renamed, but it always holds every right and is never switched off. */
export function isFixedRole(code: string): boolean {
  return code === AdminRoleCode;
}

/**
 * The rights a role holds. The Administrator holds every right there is, including any a later
 * version adds, whatever its rows in the database say. Every other role holds the rights stored for
 * it that this version knows.
 */
export function roleRights(code: string, stored: readonly string[]): AccessName[] {
  if (isFixedRole(code)) return [...AllAccesses];
  return AllAccesses.filter((access) => stored.includes(access));
}
