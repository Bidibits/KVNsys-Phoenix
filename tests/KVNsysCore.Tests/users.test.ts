import { displayName, maySignIn } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

describe('displayName', () => {
  it('joins first and last name, with the middle name only when there is one', () => {
    expect(displayName('Ana', null, 'Cruz')).toBe('Ana Cruz');
    expect(displayName('Ana', 'Santos', 'Cruz')).toBe('Ana Santos Cruz');
    expect(displayName('Ana', '  ', 'Cruz')).toBe('Ana Cruz');
  });
});

describe('maySignIn', () => {
  const active = { status: 'Active', role: { code: 'CASHIER', status: 'Active' } };

  it('lets an active user with an active role in', () => {
    expect(maySignIn(active)).toBe(true);
  });

  it('keeps out a switched-off user, and anyone whose role is switched off', () => {
    expect(maySignIn({ ...active, status: 'Inactive' })).toBe(false);
    expect(maySignIn({ ...active, role: { code: 'CASHIER', status: 'Inactive' } })).toBe(false);
  });
});
