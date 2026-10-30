import {
  AccessDescriptions,
  blankRoleForm,
  readRoleForm,
  RightGroups,
  rightsInWords,
  roleFormFor,
  type AccessName,
  type Listed,
  type Role,
  type RoleForm,
  type RoleStatus,
} from '@kvnsys/core';
import { RoleListReply, RoleReply, RolesPath, rolePath, type RoleOnWire, type SessionPass } from '@kvnsys/wire';
import { callServer, readOrRefuse, type CallOptions, type Refused } from '../connection/server-call.js';

/** A role as the roles list shows it, with its rights put in a few words. */
export type ListedRole = Listed<Role> & { rightsInWords: string };

/** One tick box on the role form. */
export interface RightBox {
  access: AccessName;
  /** What the right allows, as the box says it. */
  description: string;
  /** Ticking this box ticks that one too; unticking that one unticks this. */
  needs?: AccessName;
}

/** The tick boxes for one area: Products, Users… */
export interface RightBoxGroup {
  area: string;
  rights: RightBox[];
}

export type RoleListResult = { ok: true; roles: ListedRole[] } | Refused;
export type RoleResult = { ok: true; role: Role } | Refused;
/** The form to fill in, the tick boxes to show, and whether the role is the Administrator (rights fixed). */
export type RoleFormResult = { ok: true; form: RoleForm; groups: RightBoxGroup[]; fixed: boolean } | Refused;

const fromWire = (role: RoleOnWire): Role => ({ ...role, status: role.status as RoleStatus, rights: role.rights as AccessName[] });

/** Every right, grouped by area, as the form's tick boxes. This version's own list, the same as the server's. */
const boxes = (): RightBoxGroup[] =>
  RightGroups.map((group) => ({
    area: group.area,
    rights: group.rights.map((right) => ({ access: right.access, description: AccessDescriptions[right.access], needs: right.needs })),
  }));

/** Every role, the Administrator first, each with its rights in words. */
export async function listRoles(address: string, pass: SessionPass, options: CallOptions): Promise<RoleListResult> {
  const answer = await callServer(address, pass, options, { path: RolesPath }, RoleListReply);
  if (!answer.ok) return answer;
  return {
    ok: true,
    roles: answer.reply.roles.map((wire) => {
      const role = fromWire(wire);
      return { ...role, history: wire.history, rightsInWords: rightsInWords(role.rights) };
    }),
  };
}

/** The form to fill in: blank for a new role (id null), or the role as the server has it now. */
export async function loadRoleForm(address: string, pass: SessionPass, id: string | null, options: CallOptions): Promise<RoleFormResult> {
  if (id === null) return { ok: true, form: blankRoleForm(), groups: boxes(), fixed: false };
  const answer = await callServer(address, pass, options, { path: rolePath(id) }, RoleReply);
  if (!answer.ok) return answer;
  const role = fromWire(answer.reply.role);
  return { ok: true, form: roleFormFor(role), groups: boxes(), fixed: role.fixed };
}

/**
 * Saves what was typed and ticked: a new role (id null) or changes to one. Read and checked here
 * first, then the server checks again: only it knows whether the name is taken.
 */
export async function saveRoleForm(address: string, pass: SessionPass, id: string | null, form: RoleForm, options: CallOptions): Promise<RoleResult> {
  const read = readOrRefuse(() => readRoleForm(form));
  if (!read.ok) return read;
  const body = read.value;
  const answer =
    id === null
      ? await callServer(address, pass, options, { path: RolesPath, method: 'POST', body }, RoleReply)
      : await callServer(address, pass, options, { path: rolePath(id), method: 'PUT', body }, RoleReply);
  return answer.ok ? { ok: true, role: fromWire(answer.reply.role) } : answer;
}
