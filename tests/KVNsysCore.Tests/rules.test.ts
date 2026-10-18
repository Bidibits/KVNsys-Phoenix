import {
  AccessDescriptions,
  AdminRoleCode,
  AllAccesses,
  DefaultRoles,
  newId,
  passwordProblem,
  serverMachineCode,
} from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

describe('default roles', () => {
  it('give the administrator every right', () => {
    const admin = DefaultRoles.find((r) => r.code === AdminRoleCode);
    expect([...(admin?.accesses ?? [])].sort()).toEqual([...AllAccesses].sort());
  });

  it('give a cashier no rights over machines', () => {
    const cashier = DefaultRoles.find((r) => r.code === 'CASHIER')!;
    expect(cashier.accesses.filter((access) => access.startsWith('machines.'))).toEqual([]);
  });

  it('let a cashier look products up, but not change them; a manager may do both', () => {
    const accesses = (code: string) => DefaultRoles.find((r) => r.code === code)!.accesses;
    expect(accesses('CASHIER')).toContain('products.view');
    expect(accesses('CASHIER')).not.toContain('products.manage');
    expect(accesses('MANAGER')).toEqual(expect.arrayContaining(['products.view', 'products.manage']));
  });

  it('have unique codes, and rank administrator over manager over cashier', () => {
    const codes = DefaultRoles.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    const level = (code: string) => DefaultRoles.find((r) => r.code === code)!.level;
    expect(level('ADMIN')).toBeGreaterThan(level('MANAGER'));
    expect(level('MANAGER')).toBeGreaterThan(level('CASHIER'));
  });

  it('only use rights that are described', () => {
    for (const role of DefaultRoles) {
      for (const access of role.accesses) expect(AccessDescriptions[access]).toBeTruthy();
    }
  });
});

describe('passwords', () => {
  it('need at least 8 characters', () => {
    expect(passwordProblem('1234567')).toMatch(/at least 8/);
    expect(passwordProblem('12345678')).toBeNull();
  });
});

describe('machines', () => {
  it("name a location's server PC after the location", () => {
    expect(serverMachineCode('HQ')).toBe('HQ-SRV');
  });
});

describe('ids', () => {
  it('are UUID v7: unique, and sortable by when they were made', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect([...ids].sort()).toEqual(ids);
  });
});
