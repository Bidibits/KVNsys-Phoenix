import { checkRegisterDetails, newRegisterName, registerCode } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { kind: string; message: string };
  }
  return null;
};

describe('a register', () => {
  it("is coded by its shop and its number there, and named by its PC until a manager names it", () => {
    expect([registerCode('HQ', 1), registerCode('HQ', 12), registerCode('GUMACA', 100)]).toEqual(['HQ-R01', 'HQ-R12', 'GUMACA-R100']);
    expect(newRegisterName('COUNTER-PC')).toBe('New register (COUNTER-PC)');
    expect(newRegisterName(' ')).toBe('New register (unnamed PC)');
    expect(newRegisterName('X'.repeat(100))).toHaveLength(60);
  });

  it('needs a name, and is Active or Inactive', () => {
    expect(checkRegisterDetails({ name: '  Counter 1 ', status: 'Inactive' })).toEqual({ name: 'Counter 1', status: 'Inactive' });
    expect(refusalOf(() => checkRegisterDetails({ name: ' ', status: 'Active' }))).toMatchObject({ kind: 'invalid', message: 'A register needs a name, such as "Counter 1".' });
    expect(refusalOf(() => checkRegisterDetails({ name: 'X'.repeat(61), status: 'Active' }))).toMatchObject({ message: /at most 60 characters/ });
    expect(refusalOf(() => checkRegisterDetails({ name: 'Counter 1', status: 'Broken' }))).toMatchObject({ message: 'A register is Active or Inactive, not "Broken".' });
  });
});
