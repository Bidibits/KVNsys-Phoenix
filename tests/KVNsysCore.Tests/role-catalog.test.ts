import {
  AdminRoleCode,
  AllAccesses,
  blankRoleForm,
  checkRoleChange,
  checkRoleDetails,
  readRoleForm,
  RightGroups,
  rightsInWords,
  roleCodeFor,
  roleFormFor,
  roleRights,
  type Role,
} from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { name: string; kind: string; message: string };
  }
  return null;
};

describe('the rights, grouped for the role form', () => {
  it('hold every right exactly once', () => {
    const grouped = RightGroups.flatMap((group) => group.rights.map((right) => right.access));
    expect([...grouped].sort()).toEqual([...AllAccesses].sort());
  });

  it('only ever need a right in the same group', () => {
    for (const group of RightGroups) {
      const here = group.rights.map((right) => right.access);
      for (const right of group.rights) if (right.needs) expect(here).toContain(right.needs);
    }
  });
});

describe('a role', () => {
  const cashier = { name: 'Cashier', status: 'Active', rights: ['products.view'] };

  it('is tidied: name trimmed, rights once each, in the usual order', () => {
    expect(checkRoleDetails({ name: '  Cashier ', status: 'Active', rights: ['users.view', 'products.view', 'users.view'] })).toEqual({
      name: 'Cashier',
      status: 'Active',
      rights: ['products.view', 'users.view'],
    });
  });

  it('gets the right a ticked right needs: changing products means seeing them', () => {
    expect(checkRoleDetails({ ...cashier, rights: ['products.manage', 'roles.manage'] }).rights).toEqual([
      'products.view',
      'products.manage',
      'roles.view',
      'roles.manage',
    ]);
  });

  it('needs a name, of at most 60 characters', () => {
    expect(refusalOf(() => checkRoleDetails({ ...cashier, name: '   ' }))).toMatchObject({ kind: 'invalid', message: 'A role needs a name.' });
    expect(refusalOf(() => checkRoleDetails({ ...cashier, name: 'x'.repeat(61) }))).toMatchObject({ message: /at most 60/ });
    expect(checkRoleDetails({ ...cashier, name: 'x'.repeat(60) }).name).toHaveLength(60);
  });

  it('is Active or Inactive', () => {
    expect(refusalOf(() => checkRoleDetails({ ...cashier, status: 'Gone' }))).toMatchObject({ message: 'A role is Active or Inactive, not "Gone".' });
  });

  it('refuses a right this version does not know, rather than dropping it', () => {
    expect(refusalOf(() => checkRoleDetails({ ...cashier, rights: ['products.view', 'sales.void'] }))).toMatchObject({
      kind: 'invalid',
      message: '"sales.void" isn\'t a right this version of KVNsys knows.',
    });
  });

  it('may hold no rights at all', () => {
    expect(checkRoleDetails({ ...cashier, rights: [] }).rights).toEqual([]);
  });

  it('round-trips through its form', () => {
    const role: Role = { id: 'r1', code: 'CASHIER', name: 'Cashier', status: 'Active', rights: ['products.view'], userCount: 2, fixed: false };
    expect(readRoleForm(roleFormFor(role))).toEqual({ name: 'Cashier', status: 'Active', rights: ['products.view'] });
    expect(blankRoleForm()).toEqual({ name: '', status: 'Active', rights: [] });
  });
});

describe('the Administrator', () => {
  const everything = { name: 'Administrator', status: 'Active' as const, rights: [...AllAccesses] };

  it('holds every right, even ones its stored rows lack', () => {
    expect(roleRights(AdminRoleCode, [])).toEqual([...AllAccesses]);
    expect(roleRights('CASHIER', ['products.view', 'old.right'])).toEqual(['products.view']);
  });

  it('can be renamed, but never lose a right or be switched off', () => {
    expect(() => checkRoleChange(AdminRoleCode, { ...everything, name: 'Owner' })).not.toThrow();
    const lost = { ...everything, rights: AllAccesses.filter((a) => a !== 'roles.manage') };
    expect(refusalOf(() => checkRoleChange(AdminRoleCode, lost))).toMatchObject({ kind: 'invalid', message: /always has every right/ });
    expect(refusalOf(() => checkRoleChange(AdminRoleCode, { ...everything, status: 'Inactive' }))).toMatchObject({ message: /stays switched on/ });
    expect(() => checkRoleChange('CASHIER', { ...everything, status: 'Inactive', rights: [] })).not.toThrow();
  });
});

describe('role codes', () => {
  it('come from the name', () => {
    expect(roleCodeFor('Branch manager')).toBe('BRANCH_MANAGER');
    expect(roleCodeFor('  Kahera (gabi) ')).toBe('KAHERA_GABI');
    expect(roleCodeFor('Señora')).toBe('SENORA');
    expect(roleCodeFor('***')).toBe('ROLE');
  });

  it("are never the Administrator's, so no new role becomes the fixed one", () => {
    expect(roleCodeFor('Admin')).toBe('ADMIN_2');
  });
});

describe('rights in words', () => {
  it('say every, none, or the short labels in order', () => {
    expect(rightsInWords([...AllAccesses])).toBe('Every right');
    expect(rightsInWords([])).toBe('No rights');
    expect(rightsInWords(['users.view', 'products.view'])).toBe('See products, See users');
  });
});
