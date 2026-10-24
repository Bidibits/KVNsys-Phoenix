/**
 * Every named right in the system. A role holds some of them (the `accesses` table).
 * New rights are added here first, and to RightGroups below.
 */
export const Accesses = {
  MachinesRegister: 'machines.register',
  MachinesView: 'machines.view',
  MachinesManage: 'machines.manage',
  ProductsView: 'products.view',
  ProductsManage: 'products.manage',
  UsersView: 'users.view',
  UsersManage: 'users.manage',
  RolesView: 'roles.view',
  RolesManage: 'roles.manage',
  StockView: 'stock.view',
  StockReceive: 'stock.receive',
  StockAdjust: 'stock.adjust',
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
  'roles.view': 'See the roles and the rights each one holds',
  'roles.manage': 'Make roles, and change their names, rights and status',
  'stock.view': "See the shop's stock, and every product's movements in and out",
  'stock.receive': 'Record goods coming in from a supplier',
  'stock.adjust': 'Put a stock count right, with the reason',
};

export const AllAccesses: readonly AccessName[] = Object.values(Accesses);

/** One right as the role form offers it. */
export interface RightChoice {
  access: AccessName;
  /** Short, for the roles list: "See products". */
  label: string;
  /** A right that's no use without another: changing products needs seeing them first. */
  needs?: AccessName;
}

/** The rights by area, in the order the role form shows them. Every right is in exactly one group. */
export interface RightGroup {
  area: string;
  rights: readonly RightChoice[];
}

export const RightGroups: readonly RightGroup[] = [
  {
    area: 'Registers',
    rights: [
      { access: 'machines.register', label: 'Register PCs' },
      { access: 'machines.view', label: 'See registers' },
      { access: 'machines.manage', label: 'Change registers', needs: 'machines.view' },
    ],
  },
  {
    area: 'Products',
    rights: [
      { access: 'products.view', label: 'See products' },
      { access: 'products.manage', label: 'Change products', needs: 'products.view' },
    ],
  },
  {
    area: 'Users',
    rights: [
      { access: 'users.view', label: 'See users' },
      { access: 'users.manage', label: 'Change users', needs: 'users.view' },
    ],
  },
  {
    area: 'Roles',
    rights: [
      { access: 'roles.view', label: 'See roles' },
      { access: 'roles.manage', label: 'Change roles', needs: 'roles.view' },
    ],
  },
  {
    area: 'Stock',
    rights: [
      { access: 'stock.view', label: 'See stock' },
      { access: 'stock.receive', label: 'Receive stock', needs: 'stock.view' },
      { access: 'stock.adjust', label: 'Adjust stock', needs: 'stock.view' },
    ],
  },
];
