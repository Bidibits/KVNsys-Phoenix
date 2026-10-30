import type { Lineage } from '../shared/lineage.js';
import type { Listed } from '../shared/record-history.js';
import { Refusal } from '../shared/refusal.js';
import { AllAccesses, RightGroups, type AccessName } from './accesses.js';
import { AdminRoleCode, isFixedRole } from './roles.js';

/** An Active role's people can sign in. An Inactive one is switched off, and kept, because accounts name it. */
export const RoleStatuses = ['Active', 'Inactive'] as const;
export type RoleStatus = (typeof RoleStatuses)[number];

/** A role as the Roles screen shows it. */
export interface Role {
  id: string;
  /** Fixed when the role is made, from its first name; renaming it later doesn't change it. */
  code: string;
  name: string;
  status: RoleStatus;
  /** In the order AllAccesses lists them. */
  rights: AccessName[];
  /** How many accounts have this role, switched off ones included. */
  userCount: number;
  /** The Administrator: every right, always switched on. Only its name can change. */
  fixed: boolean;
  description: string | null;
}

/** What a manager decides for a role. */
export interface RoleDetails {
  name: string;
  status: RoleStatus;
  rights: AccessName[];
}

export const RoleLimits = { name: 60 } as const;

/** The role as a form holds it: the name as typed, the status, and the rights ticked. */
export interface RoleForm {
  name: string;
  status: string;
  rights: string[];
}

/** A new role starts with no name, switched on, and no rights. */
export function blankRoleForm(): RoleForm {
  return { name: '', status: 'Active', rights: [] };
}

export function roleFormFor(role: Role): RoleForm {
  return { name: role.name, status: role.status, rights: [...role.rights] };
}

function refuse(message: string): never {
  throw new Refusal('invalid', message);
}

/** Each right that's no use without another, with the one it needs (changing products needs seeing them). */
const Needs = new Map(RightGroups.flatMap((group) => group.rights.flatMap((right) => (right.needs ? [[right.access, right.needs] as const] : []))));

/** The rights given, plus any they need, once each, in the order AllAccesses lists them. */
export function withNeededRights(rights: readonly AccessName[]): AccessName[] {
  const held = new Set<AccessName>(rights);
  for (const right of rights) {
    const needed = Needs.get(right);
    if (needed) held.add(needed);
  }
  return AllAccesses.filter((access) => held.has(access));
}

/**
 * The rules a role meets before it's saved, from a form or over the network. Hands it back tidied
 * (name trimmed, the rights a ticked right needs added) or refuses with a message a person can act
 * on. A right this version doesn't know is refused rather than quietly dropped.
 */
export function checkRoleDetails(details: { name: string; status: string; rights: readonly string[] }): RoleDetails {
  const name = details.name.trim();
  if (!name) refuse('A role needs a name.');
  if (name.length > RoleLimits.name) refuse(`A role's name can be at most ${RoleLimits.name} characters.`);
  if (!RoleStatuses.includes(details.status as RoleStatus)) {
    refuse(`A role is ${RoleStatuses.join(' or ')}, not "${details.status}".`);
  }
  const unknown = details.rights.find((right) => !AllAccesses.includes(right as AccessName));
  if (unknown !== undefined) refuse(`"${unknown}" isn't a right this version of KVNsys knows.`);
  return { name, status: details.status as RoleStatus, rights: withNeededRights(details.rights as AccessName[]) };
}

/** What was typed and ticked, as a role that meets the rules. Whether its name is taken, only the store can say. */
export function readRoleForm(form: RoleForm): RoleDetails {
  return checkRoleDetails(form);
}

/**
 * The Administrator's rights and status can't change, so the shop can never lose the one role that
 * can do everything. Its name can.
 */
export function checkRoleChange(code: string, details: RoleDetails): void {
  if (isFixedRole(code) && (details.status !== 'Active' || details.rights.length !== AllAccesses.length)) {
    throw new Refusal('invalid', 'The Administrator always has every right and stays switched on. Only its name can change.');
  }
}

/**
 * The code a new role gets from its name: "Branch manager" becomes BRANCH_MANAGER. Never the
 * Administrator's code, so no new role can become the fixed one. The store adds _2, _3… when it's taken.
 */
export function roleCodeFor(name: string): string {
  const code =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'ROLE';
  return code === AdminRoleCode ? `${AdminRoleCode}_2` : code;
}

/** A role's rights in a few words, for the roles list: "Every right", "No rights", or "See products, See users". */
export function rightsInWords(rights: readonly AccessName[]): string {
  if (rights.length === AllAccesses.length) return 'Every right';
  if (rights.length === 0) return 'No rights';
  const labels = new Map(RightGroups.flatMap((group) => group.rights.map((right) => [right.access, right.label] as const)));
  return AllAccesses.filter((access) => rights.includes(access))
    .map((access) => labels.get(access) ?? access)
    .join(', ');
}

/**
 * Where roles are kept. KVNsysCore only describes it; KVNsysPostgres provides the real one.
 *
 * Saving refuses a name another role has (ignoring capitals), any change to the Administrator's
 * rights or status, and any change that would leave nobody able to manage users.
 */
export abstract class RoleCatalog {
  /** The Administrator first, then the rest by name. */
  abstract list(): Promise<Listed<Role>[]>;
  abstract get(id: string): Promise<Role | null>;
  abstract create(details: RoleDetails, lineage: Lineage): Promise<Role>;
  abstract update(id: string, details: RoleDetails, lineage: Lineage): Promise<Role>;
  /** The accounts that have this role, so their passes can end when it's switched off. */
  abstract memberIds(id: string): Promise<string[]>;
}
