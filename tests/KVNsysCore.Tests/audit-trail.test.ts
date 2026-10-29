import { changesOnCreate, changesOnUpdate, HiddenValue, rightsText } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

describe('what a save writes into the audit log', () => {
  it('logs a new record as one Created row per column that has a value, in order', () => {
    expect(changesOnCreate({ code: 'PRD-0042', barcode: null, name: 'Sack of rice 25kg', description: '', retail_price: '1450.50' })).toEqual([
      { columnName: 'code', valueBefore: null, valueAfter: 'PRD-0042', changeType: 'Created' },
      { columnName: 'name', valueBefore: null, valueAfter: 'Sack of rice 25kg', changeType: 'Created' },
      { columnName: 'retail_price', valueBefore: null, valueAfter: '1450.50', changeType: 'Created' },
    ]);
  });

  it('logs a change as one row per column that differs, and nothing for a save that changed nothing', () => {
    const before = { code: 'PRD-0042', name: 'Rice', retail_price: '1450.50', description: null };
    expect(changesOnUpdate(before, { ...before, retail_price: '1499.00', description: 'Dinorado' })).toEqual([
      { columnName: 'retail_price', valueBefore: '1450.50', valueAfter: '1499.00', changeType: 'Updated' },
      { columnName: 'description', valueBefore: null, valueAfter: 'Dinorado', changeType: 'Updated' },
    ]);
    expect(changesOnUpdate(before, { ...before })).toEqual([]);
  });

  it('treats empty and null as the same value', () => {
    expect(changesOnUpdate({ description: null }, { description: '' })).toEqual([]);
    expect(changesOnUpdate({}, { description: null })).toEqual([]);
  });

  it('compares only the columns a save gives, so one it leaves alone needs no reading', () => {
    expect(changesOnUpdate({ name: 'Rice', image: 'a picture, 40 KB (abc)' }, { name: 'Rice' })).toEqual([]);
  });

  it('logs switching a record off as Decommissioned, and switching it back on as Updated', () => {
    expect(changesOnUpdate({ status: 'Active' }, { status: 'Inactive' })).toEqual([
      { columnName: 'status', valueBefore: 'Active', valueAfter: 'Inactive', changeType: 'Decommissioned' },
    ]);
    expect(changesOnUpdate({ status: 'Inactive' }, { status: 'Active' })[0]!.changeType).toBe('Updated');
  });

  it('logs that a password changed, never what either one was', () => {
    expect(changesOnCreate({ username: 'ana', password_hash: 'scrypt$secret-1' })).toContainEqual({
      columnName: 'password_hash',
      valueBefore: null,
      valueAfter: HiddenValue,
      changeType: 'Created',
    });
    expect(changesOnUpdate({ password_hash: 'scrypt$secret-1' }, { password_hash: 'scrypt$secret-2' })).toEqual([
      { columnName: 'password_hash', valueBefore: HiddenValue, valueAfter: HiddenValue, changeType: 'Updated' },
    ]);
    // Compared as they are, shown hidden: the same password saved again is no change.
    expect(changesOnUpdate({ password_hash: 'scrypt$secret-1' }, { password_hash: 'scrypt$secret-1' })).toEqual([]);
  });

  it("writes a role's rights as one sorted list, so the same rights always read the same", () => {
    expect(rightsText(['users.view', 'products.view', 'users.view'])).toBe('products.view, users.view');
    expect(rightsText([])).toBeNull();
    expect(changesOnUpdate({ accesses: rightsText(['products.view', 'users.view']) }, { accesses: rightsText(['users.view', 'products.view']) })).toEqual([]);
  });
});
