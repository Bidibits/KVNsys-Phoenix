/**
 * Every named right in the system. A role holds some of them (the `accesses` table).
 * New rights are added here first.
 */
export const Accesses = {
  MachinesRegister: 'machines.register',
  MachinesView: 'machines.view',
  MachinesManage: 'machines.manage',
  ProductsView: 'products.view',
  ProductsManage: 'products.manage',
  UsersView: 'users.view',
  UsersManage: 'users.manage',
} as const;

export type AccessName = (typeof Accesses)[keyof typeof Accesses];

/** What each right allows, in words a manager can read. */
export const AccessDescriptions: Record<AccessName, string> = {
  'machines.register': 'Register a new PC as a register',
  'machines.view': 'See the list of registers',
  'machines.manage': 'Rename, move, replace or retire a register',
  'products.view': 'See the products and their prices',
  'products.manage': 'Add products, and change their details and prices',
  'users.view': 'See who has an account, and their role',
  'users.manage': "Add accounts, change them, switch them off, and reset passwords",
};

export const AllAccesses: readonly AccessName[] = Object.values(Accesses);
