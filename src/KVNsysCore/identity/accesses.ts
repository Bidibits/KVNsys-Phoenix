/**
 * Every named right in the system. A role holds some of them (the `accesses` table).
 * New rights are added here first.
 */
export const Accesses = {
  MachinesRegister: 'machines.register',
  MachinesView: 'machines.view',
  MachinesManage: 'machines.manage',
} as const;

export type AccessName = (typeof Accesses)[keyof typeof Accesses];

/** What each right allows, in words a manager can read. */
export const AccessDescriptions: Record<AccessName, string> = {
  'machines.register': 'Register a new PC as a register',
  'machines.view': 'See the list of registers',
  'machines.manage': 'Rename, move, replace or retire a register',
};

export const AllAccesses: readonly AccessName[] = Object.values(Accesses);
