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

  it('are only the Administrator: every other role is made by hand', () => {
    expect(DefaultRoles.map((r) => r.code)).toEqual([AdminRoleCode]);
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
