import { SetupStore, type Lineage, type SetupTransaction } from '@kvnsys/core';
import { InstallSeed, ScryptPasswordHasher, type SeedInput } from '@kvnsys/server';
import { describe, expect, it } from 'vitest';

interface Row {
  table: string;
  id: string;
  code?: string;
  lineage?: Lineage;
  [column: string]: unknown;
}

/** An in-memory database, enough to check what the seed writes and that it can run again. */
class MemorySetup extends SetupStore {
  rows: Row[] = [];
  accesses: { roleId: string; access: string }[] = [];

  transaction<T>(work: (tx: SetupTransaction) => Promise<T>): Promise<T> {
    const { rows, accesses } = this;
    const find = (table: string, code: string) => rows.find((r) => r.table === table && r.code === code) ?? null;
    const tx: SetupTransaction = {
      findLocationByCode: async (code) => find('locations', code),
      findServerMachine: async (hardwareId, code) =>
        (rows.find((r) => r.table === 'machines' && hardwareId !== null && r.machineUuid === hardwareId) as
          | { id: string; code: string }
          | undefined) ?? (find('machines', code) as { id: string; code: string } | null),
      createLocation: async (row) => void rows.push({ table: 'locations', ...row }),
      createMachine: async (row) => void rows.push({ table: 'machines', ...row }),
      findRoleByCode: async (code) => {
        const role = find('roles', code);
        return role ? { id: role.id, accesses: accesses.filter((a) => a.roleId === role.id).map((a) => a.access) } : null;
      },
      createRole: async (row) => void rows.push({ table: 'roles', ...row }),
      addAccess: async (row) => void accesses.push(row),
      countUsers: async () => rows.filter((r) => r.table === 'users').length,
      createUser: async (row) => void rows.push({ table: 'users', ...row }),
    };
    return work(tx);
  }

  count(table: string) {
    return this.rows.filter((r) => r.table === table).length;
  }
}

const input: SeedInput = {
  locationCode: 'HQ',
  locationName: 'Head Office',
  adminUsername: 'admin',
  adminPassword: 'a-long-password',
  server: { hardwareId: 'hw-1234', computerName: 'BRANCH-PC' },
};

function setup() {
  const store = new MemorySetup();
  return { store, seed: new InstallSeed(store, new ScryptPasswordHasher()) };
}

describe('InstallSeed', () => {
  it('creates the location, this PC as its machine, the Administrator role and the administrator', async () => {
    const { store, seed } = setup();
    await seed.run(input);
    expect([store.count('locations'), store.count('machines'), store.count('roles'), store.count('users')]).toEqual([1, 1, 1, 1]);
  });

  it('records this PC under its computer name and hardware id', async () => {
    const { store, seed } = setup();
    await seed.run(input);
    expect(store.rows.find((r) => r.table === 'machines')).toMatchObject({
      code: 'HQ-SRV',
      machineName: 'BRANCH-PC',
      machineUuid: 'hw-1234',
    });
  });

  it('stamps every row as written by nobody, on this PC, at this location', async () => {
    const { store, seed } = setup();
    await seed.run(input);
    const location = store.rows.find((r) => r.table === 'locations')!;
    const machine = store.rows.find((r) => r.table === 'machines')!;
    for (const row of store.rows) {
      expect(row.lineage).toEqual({ userId: null, machineId: machine.id, locationId: location.id });
    }
  });

  it('can run again without creating anything twice', async () => {
    const { store, seed } = setup();
    await seed.run(input);
    const second = await seed.run({ ...input, adminPassword: undefined });
    expect(second.created).toEqual([]);
    expect([store.count('locations'), store.count('machines'), store.count('roles'), store.count('users')]).toEqual([1, 1, 1, 1]);
  });

  it('still recognises this PC after it has been renamed', async () => {
    const { store, seed } = setup();
    await seed.run(input);
    await seed.run({ ...input, server: { hardwareId: 'hw-1234', computerName: 'RENAMED-PC' } });
    expect(store.count('machines')).toBe(1);
  });

  it('refuses an empty database without an administrator password', async () => {
    await expect(setup().seed.run({ ...input, adminPassword: undefined })).rejects.toThrow(/KVNSYS_ADMIN_PASSWORD/);
  });

  it('refuses a short administrator password', async () => {
    await expect(setup().seed.run({ ...input, adminPassword: 'short' })).rejects.toThrow(/at least 8/);
  });

  it('keeps the administrator username in lowercase, and refuses one sign-in could never match', async () => {
    const { store, seed } = setup();
    await seed.run({ ...input, adminUsername: ' Kenly ' });
    expect(store.rows.find((r) => r.table === 'users')).toMatchObject({ username: 'kenly' });
    await expect(setup().seed.run({ ...input, adminUsername: 'kenly lucena' })).rejects.toThrow(/KVNSYS_ADMIN_USERNAME: .*no spaces/);
  });

  it('stores the administrator password hashed, never as typed', async () => {
    const { store, seed } = setup();
    await seed.run(input);
    const admin = store.rows.find((r) => r.table === 'users')!;
    expect(admin.passwordHash).not.toContain(input.adminPassword);
    expect(admin.passwordHash).toMatch(/^scrypt\$/);
  });
});
