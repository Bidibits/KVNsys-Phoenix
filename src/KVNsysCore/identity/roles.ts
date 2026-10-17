import { Accesses, AllAccesses, type AccessName } from './accesses.js';

export interface RoleDefinition {
  code: string;
  name: string;
  /** Higher outranks lower. */
  level: number;
  accesses: readonly AccessName[];
}

export const AdminRoleCode = 'ADMIN';

/** The roles a new install starts with. A manager can change them later. */
export const DefaultRoles: readonly RoleDefinition[] = [
  { code: AdminRoleCode, name: 'Administrator', level: 100, accesses: AllAccesses },
  {
    code: 'MANAGER',
    name: 'Branch manager',
    level: 50,
    accesses: [Accesses.MachinesRegister, Accesses.MachinesView, Accesses.MachinesManage],
  },
  { code: 'CASHIER', name: 'Cashier', level: 10, accesses: [] },
];
