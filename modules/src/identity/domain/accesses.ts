/**
 * Every named right in the system. A role holds some of them (the `accesses` table), and
 * each guarded endpoint names the one it needs. New rights are added here first.
 */
export const Accesses = {
  MachinesRegister: 'machines.register',
  MachinesView: 'machines.view',
  MachinesManage: 'machines.manage',
} as const;

export type AccessName = (typeof Accesses)[keyof typeof Accesses];

/** What each right allows, in words a manager can read on the grant screen. */
export const AccessDescriptions: Record<AccessName, string> = {
  'machines.register': 'Register a new device as a register',
  'machines.view': 'See the list of registers',
  'machines.manage': 'Rename, move, replace or decommission a register',
};

export const AllAccesses: readonly AccessName[] = Object.values(Accesses);

export function holds(accesses: readonly string[], access: AccessName): boolean {
  return accesses.includes(access);
}
