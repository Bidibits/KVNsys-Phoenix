import { checkMachineDetails, newMachineName, machineCode } from '@kvnsys/core';
import { describe, expect, it } from 'vitest';

const refusalOf = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    return error as { kind: string; message: string };
  }
  return null;
};

describe('a machine', () => {
  it("is coded by its location and its number there, and named by its PC until a manager names it", () => {
    expect([machineCode('HQ', 1), machineCode('HQ', 12), machineCode('GUMACA', 100)]).toEqual(['HQ-M01', 'HQ-M12', 'GUMACA-M100']);
    expect(newMachineName('COUNTER-PC')).toBe('New machine (COUNTER-PC)');
    expect(newMachineName(' ')).toBe('New machine (unnamed PC)');
    expect(newMachineName('X'.repeat(100))).toHaveLength(60);
  });

  it('needs a name, and is Active or Inactive', () => {
    expect(checkMachineDetails({ name: '  Counter 1 ', status: 'Inactive' })).toEqual({ name: 'Counter 1', status: 'Inactive' });
    expect(refusalOf(() => checkMachineDetails({ name: ' ', status: 'Active' }))).toMatchObject({ kind: 'invalid', message: 'A machine needs a name, such as "Counter 1".' });
    expect(refusalOf(() => checkMachineDetails({ name: 'X'.repeat(61), status: 'Active' }))).toMatchObject({ message: /at most 60 characters/ });
    expect(refusalOf(() => checkMachineDetails({ name: 'Counter 1', status: 'Broken' }))).toMatchObject({ message: 'A machine is Active or Inactive, not "Broken".' });
  });
});
